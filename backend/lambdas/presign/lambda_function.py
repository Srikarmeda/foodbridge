"""foodbridge-presign
Route: POST /uploads/presign  body: {"contentType": "image/jpeg"}
Returns a presigned POST (max 5 MB, images only) for the images bucket.
"""
import boto3
from botocore.config import Config
from common import *  # noqa: F401,F403 (layer)

s3 = boto3.client("s3", region_name="us-east-1", config=Config(signature_version="s3v4"))

EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_BYTES = 5 * 1024 * 1024


def presign(event, user):
    require(user, "DONOR", "ADMIN")
    content_type = str(body(event).get("contentType", "")).lower()
    if content_type not in EXT:
        raise ApiError(400, "contentType must be image/jpeg, image/png or image/webp")

    key = f"listings/{user['id']}/{uuid.uuid4()}.{EXT[content_type]}"
    post = s3.generate_presigned_post(
        Bucket=IMAGES_BUCKET,
        Key=key,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, MAX_BYTES],
        ],
        ExpiresIn=300,
    )
    return 200, {
        "upload": post,  # {"url": ..., "fields": {...}}
        "key": key,
        "publicUrl": f"{IMAGES_BASE_URL}/{key}",
        "maxBytes": MAX_BYTES,
    }


ROUTES = {"POST /uploads/presign": presign}


def lambda_handler(event, context):
    return run(event, ROUTES)