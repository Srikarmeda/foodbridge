"""FoodBridge notifications (layer foodbridge-common, version 2).
Email problems must never break an API call, so every public function swallows errors."""
import math
import os
from datetime import datetime, timedelta, timezone
from html import escape

import boto3
from boto3.dynamodb.conditions import Key

from common import REGION, USERS

SENDER = os.environ.get("SENDER_EMAIL", "")
APP_URL = os.environ.get("APP_URL", "").rstrip("/")
MODE = os.environ.get("NOTIFY_MODE", "ses").lower()  # ses | sns | off
SNS_TOPIC_ARN = os.environ.get("SNS_TOPIC_ARN", "")
NEARBY_KM = float(os.environ.get("NEARBY_KM", "10"))
MAX_NEARBY_EMAILS = int(os.environ.get("MAX_NEARBY_EMAILS", "10"))
TZ_OFFSET_MIN = int(os.environ.get("DISPLAY_TZ_OFFSET_MIN", "330"))  # 330 = IST
TZ_LABEL = os.environ.get("DISPLAY_TZ_LABEL", "IST")

_ses = boto3.client("ses", region_name=REGION)
_sns = boto3.client("sns", region_name=REGION)


# ---------- helpers ----------
def fmt_time(iso_str):
    try:
        dt = datetime.fromisoformat(str(iso_str).replace("Z", "+00:00"))
        local = dt.astimezone(timezone(timedelta(minutes=TZ_OFFSET_MIN)))
        return local.strftime("%d %b, %I:%M %p ") + TZ_LABEL
    except Exception:
        return str(iso_str)


def _km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def _html(heading, lines, button=None, url=None):
    paras = "".join(
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#1B3A2A">{escape(str(l))}</p>'
        for l in lines
    )
    btn = ""
    if button and url:
        btn = (f'<p style="margin:20px 0 0"><a href="{escape(url, quote=True)}" '
               'style="background:#1D8102;color:#ffffff;text-decoration:none;padding:12px 22px;'
               f'border-radius:8px;font-weight:bold;display:inline-block">{escape(button)}</a></p>')
    return ('<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;'
            'border:1px solid #E1E8E3;border-radius:12px">'
            f'<h2 style="margin:0 0 16px;color:#1B3A2A">{escape(heading)}</h2>{paras}{btn}'
            '<p style="margin:24px 0 0;font-size:12px;color:#5F6B7A">'
            'FoodBridge: from extra to essential</p></div>')


def send_email(to, subject, lines, button=None, url=None):
    """Returns True if handed to SES/SNS. Never raises."""
    if MODE == "off" or not to:
        return False
    subject = " ".join(str(subject).split())[:150]  # no newlines in headers
    text = "\n\n".join(str(l) for l in lines)
    if button and url:
        text += f"\n\n{button}: {url}"
    try:
        if MODE == "sns":
            _sns.publish(TopicArn=SNS_TOPIC_ARN, Subject=subject[:100], Message=f"(for {to})\n\n{text}")
            return True
        if not SENDER:
            print("SENDER_EMAIL not set; skipping email to", to)
            return False
        _ses.send_email(
            Source=f"FoodBridge <{SENDER}>",
            Destination={"ToAddresses": [to]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {
                    "Text": {"Data": text, "Charset": "UTF-8"},
                    "Html": {"Data": _html(subject, lines, button, url), "Charset": "UTF-8"},
                },
            },
        )
        return True
    except Exception as e:
        print("Email to", to, "failed:", repr(e))
        return False


def email_of(user_id):
    try:
        return USERS.get_item(Key={"userId": user_id}).get("Item", {}).get("email", "")
    except Exception as e:
        print("email_of failed:", repr(e))
        return ""


# ---------- notifications ----------
def notify_new_listing(item):
    """Email receivers within NEARBY_KM of a new listing."""
    try:
        lat, lng = float(item["lat"]), float(item["lng"])
        resp = USERS.query(
            IndexName="role-createdAt-index",
            KeyConditionExpression=Key("role").eq("RECEIVER"),
            Limit=200,
        )
        sent = 0
        for u in resp["Items"]:
            if sent >= MAX_NEARBY_EMAILS:
                break
            if not u.get("email") or u.get("lat") is None or u.get("lng") is None:
                continue
            km = _km(lat, lng, float(u["lat"]), float(u["lng"]))
            if km > NEARBY_KM:
                continue
            ok = send_email(
                u["email"],
                f"New food nearby: {item['title']}",
                [
                    f"{item['donorName']} just posted {item['title']} "
                    f"({item['servings']} servings, about {km:.1f} km from you).",
                    f"Pickup window: {fmt_time(item['pickupStart'])} to {fmt_time(item['pickupEnd'])}.",
                    f"Address: {item['address']}",
                    f"Claim it before it expires at {fmt_time(item['expiresAt'])}.",
                ],
                "View and claim", APP_URL or None,
            )
            sent += 1 if ok else 0
        return sent
    except Exception as e:
        print("notify_new_listing failed:", repr(e))
        return 0


def notify_claim(claim, receiver_email):
    """Confirmation to the receiver, heads-up to the donor."""
    try:
        window = f"{fmt_time(claim['pickupStart'])} to {fmt_time(claim['pickupEnd'])}"
        send_email(
            receiver_email,
            f"Claim confirmed: {claim['listingTitle']}",
            [
                f"You claimed {claim['listingTitle']} from {claim['donorName']}.",
                f"Pick it up between {window}.",
                f"Address: {claim['address']}",
                "Please mark it as picked up in FoodBridge once you have the food.",
            ],
            "Open my claims", APP_URL or None,
        )
        send_email(
            email_of(claim["donorId"]),
            f"Your listing was claimed: {claim['listingTitle']}",
            [
                f"{claim['receiverName']} will collect {claim['listingTitle']}.",
                f"Expected pickup window: {window}.",
                "Please confirm the handover in FoodBridge when they have collected it.",
            ],
            "Open dashboard", APP_URL or None,
        )
    except Exception as e:
        print("notify_claim failed:", repr(e))


def notify_reminder(claim, receiver_email):
    try:
        send_email(
            receiver_email,
            f"Pickup reminder: {claim['listingTitle']}",
            [
                f"Your pickup window for {claim['listingTitle']} starts at {fmt_time(claim['pickupStart'])} "
                f"and ends at {fmt_time(claim['pickupEnd'])}.",
                f"Address: {claim['address']}",
            ],
            "Open my claims", APP_URL or None,
        )
    except Exception as e:
        print("notify_reminder failed:", repr(e))