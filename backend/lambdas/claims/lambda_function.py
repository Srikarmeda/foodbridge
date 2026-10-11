"""foodbridge-claims
Routes: POST /listings/{id}/claim   receiver claims (atomic, no double-claim)
        GET  /claims/mine           receiver's claims
        GET  /claims/incoming       donor's claims on their food
        POST /claims/{id}/pickup    receiver: CLAIMED   -> PICKED_UP
        POST /claims/{id}/complete  donor:    PICKED_UP -> COMPLETED
        POST /claims/{id}/cancel    receiver: CLAIMED   -> CANCELLED (listing reopens)
"""
from common import *  # noqa: F401,F403 (layer)

client = dynamodb.meta.client


def claim_listing(event, user):
    require(user, "RECEIVER")
    listing_id = event["pathParameters"]["id"]
    listing = LISTINGS.get_item(Key={"listingId": listing_id}).get("Item")
    if not listing:
        raise ApiError(404, "Listing not found")
    now = now_iso()
    if listing["donorId"] == user["id"]:
        raise ApiError(400, "You cannot claim your own listing")
    if listing["status"] != "AVAILABLE":
        raise ApiError(409, "Someone already claimed this listing")
    if listing["expiresAt"] <= now:
        raise ApiError(410, "This listing has expired")

    profile = get_profile(user["id"])
    if not profile:
        raise ApiError(409, "Complete your profile first (POST /profile)")

    claim_id = str(uuid.uuid4())
    claim = {  # denormalized so "My claims" and stats need no joins
        "claimId": claim_id,
        "listingId": listing_id,
        "listingTitle": listing["title"],
        "donorId": listing["donorId"],
        "donorName": listing["donorName"],
        "receiverId": user["id"],
        "receiverName": profile.get("orgName") or user["name"] or "Receiver",
        "status": "CLAIMED",
        "kg": listing["quantityKg"],
        "servings": listing["servings"],
        "address": listing["address"],
        "lat": listing["lat"],
        "lng": listing["lng"],
        "photoKey": listing.get("photoKey", ""),
        "pickupStart": listing["pickupStart"],
        "pickupEnd": listing["pickupEnd"],
        "expiresAt": listing["expiresAt"],
        "createdAt": now,
        "updatedAt": now,
    }
    try:
        client.transact_write_items(TransactItems=[
            {"Update": {
                "TableName": LISTINGS.name,
                "Key": {"listingId": listing_id},
                "UpdateExpression": "SET #s = :claimed, claimedBy = :r, claimId = :c, updatedAt = :now",
                "ConditionExpression": "#s = :avail AND expiresAt > :now",
                "ExpressionAttributeNames": {"#s": "status"},
                "ExpressionAttributeValues": {
                    ":claimed": "CLAIMED", ":avail": "AVAILABLE",
                    ":r": user["id"], ":c": claim_id, ":now": now,
                },
            }},
            {"Put": {
                "TableName": CLAIMS.name,
                "Item": claim,
                "ConditionExpression": "attribute_not_exists(claimId)",
            }},
        ])
    except ClientError as e:
        if e.response["Error"]["Code"] == "TransactionCanceledException":
            raise ApiError(409, "Someone just claimed this listing")
        raise
    return 200, {"claim": claim}


def _list_claims(index, key_name, user_id):
    resp = CLAIMS.query(
        IndexName=index,
        KeyConditionExpression=Key(key_name).eq(user_id),
        ScanIndexForward=False,
        Limit=100,
    )
    return 200, {"claims": resp["Items"]}


def my_claims(event, user):
    require(user, "RECEIVER", "ADMIN")
    return _list_claims("receiver-createdAt-index", "receiverId", user["id"])


def incoming_claims(event, user):
    require(user, "DONOR", "ADMIN")
    return _list_claims("donor-createdAt-index", "donorId", user["id"])


def _move(event, user, actor_field, from_status, to_status, stamp, listing_status=None):
    claim_id = event["pathParameters"]["id"]
    claim = CLAIMS.get_item(Key={"claimId": claim_id}).get("Item")
    if not claim:
        raise ApiError(404, "Claim not found")
    if claim[actor_field] != user["id"] and user["role"] != "ADMIN":
        raise ApiError(403, "You are not allowed to update this claim")
    if claim["status"] != from_status:
        raise ApiError(409, f"Claim is {claim['status']}; expected {from_status}")

    now = now_iso()
    claim_expr = "SET #s = :to, updatedAt = :now, " + f"{stamp} = :now"
    if to_status == "CANCELLED":
        # Reopen the listing, or mark it expired if the time already passed.
        listing_to = "AVAILABLE" if claim["expiresAt"] > now else "EXPIRED"
        listing_expr = "SET #s = :lto, updatedAt = :now REMOVE claimedBy, claimId"
    else:
        listing_to = listing_status
        listing_expr = "SET #s = :lto, updatedAt = :now"
    try:
        client.transact_write_items(TransactItems=[
            {"Update": {
                "TableName": CLAIMS.name,
                "Key": {"claimId": claim_id},
                "UpdateExpression": claim_expr,
                "ConditionExpression": "#s = :frm",
                "ExpressionAttributeNames": {"#s": "status"},
                "ExpressionAttributeValues": {":to": to_status, ":frm": from_status, ":now": now},
            }},
            {"Update": {
                "TableName": LISTINGS.name,
                "Key": {"listingId": claim["listingId"]},
                "UpdateExpression": listing_expr,
                "ConditionExpression": "claimId = :cid",
                "ExpressionAttributeNames": {"#s": "status"},
                "ExpressionAttributeValues": {":lto": listing_to, ":now": now, ":cid": claim_id},
            }},
        ])
    except ClientError as e:
        if e.response["Error"]["Code"] == "TransactionCanceledException":
            raise ApiError(409, "This claim was just updated; refresh and retry")
        raise
    claim.update({"status": to_status, "updatedAt": now, stamp: now})
    return 200, {"claim": claim}


def pickup(event, user):
    require(user, "RECEIVER", "ADMIN")
    return _move(event, user, "receiverId", "CLAIMED", "PICKED_UP", "pickedUpAt", "PICKED_UP")


def complete(event, user):
    require(user, "DONOR", "ADMIN")
    return _move(event, user, "donorId", "PICKED_UP", "COMPLETED", "completedAt", "COMPLETED")


def cancel(event, user):
    require(user, "RECEIVER", "ADMIN")
    return _move(event, user, "receiverId", "CLAIMED", "CANCELLED", "cancelledAt")


ROUTES = {
    "POST /listings/{id}/claim": claim_listing,
    "GET /claims/mine": my_claims,
    "GET /claims/incoming": incoming_claims,
    "POST /claims/{id}/pickup": pickup,
    "POST /claims/{id}/complete": complete,
    "POST /claims/{id}/cancel": cancel,
}


def lambda_handler(event, context):
    return run(event, ROUTES)