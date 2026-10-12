"""foodbridge-sweeper  (EventBridge schedule: rate(5 minutes))
1. Persist EXPIRED on AVAILABLE listings whose expiresAt has passed.
2. Email a pickup reminder for CLAIMED claims whose pickup window starts within
   REMINDER_MINUTES (or has started and not ended). One reminder per claim.
"""
import json
import os
from datetime import timedelta

from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

import notify
from common import CLAIMS, LISTINGS, iso, now_dt

REMINDER_MINUTES = int(os.environ.get("REMINDER_MINUTES", "60"))


def _paged_query(table, **kwargs):
    while True:
        resp = table.query(**kwargs)
        yield from resp["Items"]
        if "LastEvaluatedKey" not in resp:
            return
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def expire_listings(now_s):
    expired = 0
    for item in _paged_query(
        LISTINGS,
        IndexName="status-expiresAt-index",
        KeyConditionExpression=Key("status").eq("AVAILABLE") & Key("expiresAt").lte(now_s),
    ):
        try:
            LISTINGS.update_item(
                Key={"listingId": item["listingId"]},
                UpdateExpression="SET #s = :e, updatedAt = :now",
                ConditionExpression="#s = :a",  # skip if someone claimed it meanwhile
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":e": "EXPIRED", ":a": "AVAILABLE", ":now": now_s},
            )
            expired += 1
        except ClientError as e:
            if e.response["Error"]["Code"] != "ConditionalCheckFailedException":
                raise
    return expired


def send_reminders(now, now_s):
    horizon = iso(now + timedelta(minutes=REMINDER_MINUTES))
    sent = 0
    for claim in _paged_query(
        CLAIMS,
        IndexName="status-pickupStart-index",
        KeyConditionExpression=Key("status").eq("CLAIMED") & Key("pickupStart").lte(horizon),
        FilterExpression=Attr("pickupEnd").gt(now_s) & Attr("reminderSent").not_exists(),
    ):
        try:  # mark first: at-most-once, so a retry can never double-email
            CLAIMS.update_item(
                Key={"claimId": claim["claimId"]},
                UpdateExpression="SET reminderSent = :t",
                ConditionExpression="attribute_not_exists(reminderSent) AND #s = :c",
                ExpressionAttributeNames={"#s": "status"},
                ExpressionAttributeValues={":t": now_s, ":c": "CLAIMED"},
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                continue
            raise
        notify.notify_reminder(claim, notify.email_of(claim["receiverId"]))
        sent += 1
    return sent


def lambda_handler(event, context):
    now = now_dt()
    now_s = iso(now)
    result = {"expired": expire_listings(now_s), "reminders": send_reminders(now, now_s)}
    print(json.dumps(result))
    return result