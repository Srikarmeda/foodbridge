"""FoodBridge shared helpers (Lambda layer: foodbridge-common)."""
import base64
import json
import os
import re
import traceback
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

REGION = os.environ.get("AWS_REGION", "us-east-1")
dynamodb = boto3.resource("dynamodb", region_name=REGION)
USERS = dynamodb.Table(os.environ.get("USERS_TABLE", "foodbridge-users"))
LISTINGS = dynamodb.Table(os.environ.get("LISTINGS_TABLE", "foodbridge-listings"))
CLAIMS = dynamodb.Table(os.environ.get("CLAIMS_TABLE", "foodbridge-claims"))
IMAGES_BUCKET = os.environ.get("IMAGES_BUCKET", "foodbridge-images-srikar")
IMAGES_BASE_URL = f"https://{IMAGES_BUCKET}.s3.us-east-1.amazonaws.com"


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def _json_default(o):
    if isinstance(o, Decimal):
        return int(o) if o == o.to_integral_value() else float(o)
    raise TypeError(f"Not serializable: {type(o)}")


def respond(status, data):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(data, default=_json_default),
    }


# ---------- time ----------
def now_dt():
    return datetime.now(timezone.utc)


def iso(dt):
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def now_iso():
    return iso(now_dt())


def parse_iso(value):
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        raise ApiError(400, f"Invalid date: {value}")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


# ---------- input ----------
def to_ddb(obj):
    """Convert floats to Decimal (DynamoDB rejects floats)."""
    return json.loads(json.dumps(obj), parse_float=Decimal)


def body(event):
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        data = json.loads(raw)
    except ValueError:
        raise ApiError(400, "Body must be valid JSON")
    if not isinstance(data, dict):
        raise ApiError(400, "Body must be a JSON object")
    return data


def text(value, name, lo, hi):
    s = str(value if value is not None else "").strip()
    if not (lo <= len(s) <= hi):
        raise ApiError(400, f"{name} must be {lo}-{hi} characters")
    return s


def num(value, name, lo, hi):
    try:
        x = float(value)
    except (TypeError, ValueError):
        raise ApiError(400, f"{name} must be a number")
    if x != x or not (lo <= x <= hi):
        raise ApiError(400, f"{name} must be between {lo} and {hi}")
    return x


PHONE_RE = re.compile(r"^[+0-9()\-\s]{7,20}$")


# ---------- auth ----------
def get_user(event):
    """Read verified JWT claims injected by the API Gateway authorizer."""
    try:
        c = event["requestContext"]["authorizer"]["jwt"]["claims"]
    except KeyError:
        raise ApiError(401, "Missing authentication")
    groups = str(c.get("cognito:groups", "")).strip("[]").replace(",", " ").split()
    if "Admin" in groups:
        role = "ADMIN"
    elif "Donor" in groups:
        role = "DONOR"
    elif "Receiver" in groups:
        role = "RECEIVER"
    else:
        requested = str(c.get("custom:requestedRole", "")).upper()
        role = requested if requested in ("DONOR", "RECEIVER") else None
    return {
        "id": c["sub"],
        "email": c.get("email", ""),
        "name": c.get("name", ""),
        "username": c.get("cognito:username", c["sub"]),
        "groups": groups,
        "role": role,
    }


def require(user, *roles):
    if user["role"] not in roles:
        raise ApiError(403, "Your account role cannot do this")


def get_profile(user_id):
    return USERS.get_item(Key={"userId": user_id}).get("Item")


# ---------- router ----------
def run(event, routes):
    try:
        handler = routes.get(event.get("routeKey"))
        if handler is None:
            raise ApiError(404, "Unknown route")
        status, data = handler(event, get_user(event))
        return respond(status, data)
    except ApiError as e:
        return respond(e.status, {"error": e.message})
    except Exception:
        traceback.print_exc()  # full detail goes to CloudWatch only
        return respond(500, {"error": "Internal server error"})