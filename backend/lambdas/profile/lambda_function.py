"""foodbridge-profile
Routes: POST /profile  (create/update my profile, bootstrap role)
        GET  /profile  (read my profile)
"""
import os

import boto3
from common import *  # noqa: F401,F403 (layer)

cognito = boto3.client("cognito-idp", region_name=REGION)
USER_POOL_ID = os.environ.get("USER_POOL_ID", "")


def upsert_profile(event, user):
    if user["role"] is None:
        raise ApiError(403, "No valid role on this account (must be Donor or Receiver)")
    b = body(event)

    fields = {
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "updatedAt": now_iso(),
    }
    if "orgName" in b:
        fields["orgName"] = text(b["orgName"], "orgName", 0, 80)
    if "address" in b:
        fields["address"] = text(b["address"], "address", 0, 200)
    if "phone" in b and str(b["phone"]).strip():
        phone = str(b["phone"]).strip()
        if not PHONE_RE.match(phone):
            raise ApiError(400, "phone has an invalid format")
        fields["phone"] = phone
    if b.get("lat") is not None and b.get("lng") is not None:
        fields["lat"] = num(b["lat"], "lat", -90, 90)
        fields["lng"] = num(b["lng"], "lng", -180, 180)

    names = {f"#{k}": k for k in fields}
    values = {f":{k}": v for k, v in to_ddb(fields).items()}
    expr = "SET " + ", ".join(f"#{k} = :{k}" for k in fields)
    expr += ", #createdAt = if_not_exists(#createdAt, :createdAt)"
    names["#createdAt"] = "createdAt"
    values[":createdAt"] = now_iso()

    saved = USERS.update_item(
        Key={"userId": user["id"]},
        UpdateExpression=expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW",
    )["Attributes"]

    # Best effort: add to the Cognito group so the next token carries cognito:groups.
    group_added = False
    if user["role"] in ("DONOR", "RECEIVER") and not user["groups"] and USER_POOL_ID:
        try:
            cognito.admin_add_user_to_group(
                UserPoolId=USER_POOL_ID,
                Username=user["username"],
                GroupName=user["role"].title(),  # DONOR -> Donor
            )
            group_added = True
        except Exception as e:  # never block signup on this
            print("AdminAddUserToGroup skipped:", repr(e))

    return 200, {"profile": saved, "groupAdded": group_added}


def read_profile(event, user):
    item = get_profile(user["id"])
    if not item:
        raise ApiError(404, "Profile not found")
    return 200, {"profile": item}


ROUTES = {
    "POST /profile": upsert_profile,
    "GET /profile": read_profile,
}


def lambda_handler(event, context):
    return run(event, ROUTES)