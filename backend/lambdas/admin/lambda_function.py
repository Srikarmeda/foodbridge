"""foodbridge-admin
Routes: GET    /stats                  platform impact totals        (any signed-in user)
        GET    /leaderboard            top donors by kg rescued      (any signed-in user)
        GET    /admin/users            user list + counts            (Admin)
        GET    /admin/listings         listing list + counts         (Admin)
        DELETE /admin/listings/{id}    remove an AVAILABLE listing   (Admin)
"""
import json
import os
import time

from common import *  # noqa: F401,F403 (layer)

MEALS_PER_KG = float(os.environ.get("MEALS_PER_KG", "2.5"))
CO2_PER_KG = float(os.environ.get("CO2_PER_KG", "2.5"))
MAX_PAGES = 10          # safety cap per query
CACHE_SECONDS = 15
LISTING_STATUSES = ["AVAILABLE", "CLAIMED", "PICKED_UP", "COMPLETED", "EXPIRED"]
ROLES = ["DONOR", "RECEIVER", "ADMIN"]

_cache = {"at": 0.0, "items": []}


def _paged(table, **kwargs):
    for _ in range(MAX_PAGES):
        resp = table.query(**kwargs)
        yield from resp["Items"]
        if "LastEvaluatedKey" not in resp:
            return
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def completed_claims():
    """AP12: all COMPLETED claims (cached briefly so page loads stay cheap)."""
    if time.time() - _cache["at"] < CACHE_SECONDS:
        return _cache["items"]
    items = list(_paged(
        CLAIMS,
        IndexName="status-pickupStart-index",
        KeyConditionExpression=Key("status").eq("COMPLETED"),
    ))
    _cache["at"], _cache["items"] = time.time(), items
    return items


def _meals(claim):
    servings = float(claim.get("servings") or 0)
    return servings if servings > 0 else float(claim.get("kg") or 0) * MEALS_PER_KG


# ---------- impact (any signed-in user) ----------
def stats(event, user):
    items = completed_claims()
    kg = sum(float(c.get("kg") or 0) for c in items)
    return 200, {"stats": {
        "donations": len(items),
        "kg": round(kg, 1),
        "meals": round(sum(_meals(c) for c in items)),
        "co2": round(kg * CO2_PER_KG, 1),
        "donors": len({c["donorId"] for c in items}),
        "receivers": len({c["receiverId"] for c in items}),
        "mealsPerKg": MEALS_PER_KG,
        "co2PerKg": CO2_PER_KG,
    }}


def leaderboard(event, user):
    board = {}
    for c in completed_claims():
        d = board.setdefault(c["donorId"], {"donorName": "Anonymous donor", "kg": 0.0, "meals": 0.0, "donations": 0})
        d["donorName"] = c.get("donorName") or d["donorName"]
        d["kg"] += float(c.get("kg") or 0)
        d["meals"] += _meals(c)
        d["donations"] += 1

    ranked = sorted(board.items(), key=lambda kv: (-kv[1]["kg"], kv[1]["donorName"]))

    def row(rank, donor_id, v):
        return {
            "rank": rank, "donorName": v["donorName"], "kg": round(v["kg"], 1),
            "meals": round(v["meals"]), "donations": v["donations"],
            "co2": round(v["kg"] * CO2_PER_KG, 1), "isYou": donor_id == user["id"],
        }

    top = [row(i + 1, did, v) for i, (did, v) in enumerate(ranked[:10])]
    result = {"leaderboard": top}
    for i, (did, v) in enumerate(ranked):  # your own rank, even outside the top 10
        if did == user["id"] and i >= 10:
            result["you"] = row(i + 1, did, v)
    return 200, result


# ---------- admin ----------
def _shown_status(item, now):
    if item.get("status") == "AVAILABLE" and item.get("expiresAt", "") <= now:
        return "EXPIRED"  # same read-time rule as the public API
    return item.get("status")


def list_users(event, user):
    require(user, "ADMIN")
    role = (event.get("queryStringParameters") or {}).get("role")
    roles = [role] if role in ROLES else ROLES
    rows, counts = [], {r: 0 for r in ROLES}
    for r in roles:
        for it in _paged(USERS, IndexName="role-createdAt-index", KeyConditionExpression=Key("role").eq(r)):
            counts[r] += 1
            rows.append({
                "name": it.get("name") or "",
                "email": it.get("email") or "",
                "role": r,
                "orgName": it.get("orgName") or "",
                "hasLocation": it.get("lat") is not None and it.get("lng") is not None,
                "createdAt": it.get("createdAt", ""),
            })
    rows.sort(key=lambda x: x["createdAt"], reverse=True)
    return 200, {"counts": counts, "users": rows[:500]}


def list_listings(event, user):
    require(user, "ADMIN")
    wanted = (event.get("queryStringParameters") or {}).get("status")
    now = now_iso()
    rows, counts = [], {s: 0 for s in LISTING_STATUSES}
    for status in LISTING_STATUSES:
        for it in _paged(LISTINGS, IndexName="status-expiresAt-index", KeyConditionExpression=Key("status").eq(status)):
            shown = _shown_status(it, now)
            counts[shown] = counts.get(shown, 0) + 1
            if wanted and shown != wanted:
                continue
            rows.append({
                "listingId": it["listingId"], "title": it["title"], "donorName": it.get("donorName", ""),
                "status": shown, "dietary": it.get("dietary"), "foodType": it.get("foodType"),
                "quantityKg": it.get("quantityKg"), "servings": it.get("servings"),
                "address": it.get("address", ""), "expiresAt": it.get("expiresAt"),
                "createdAt": it.get("createdAt", ""),
            })
    rows.sort(key=lambda x: x["createdAt"], reverse=True)
    return 200, {"counts": counts, "listings": rows[:200]}


def remove_listing(event, user):
    require(user, "ADMIN")
    listing_id = event["pathParameters"]["id"]
    try:
        LISTINGS.delete_item(
            Key={"listingId": listing_id},
            ConditionExpression="#s = :a",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":a": "AVAILABLE"},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise ApiError(409, "Only existing AVAILABLE listings can be removed")
        raise
    print(json.dumps({"audit": "admin_remove_listing", "admin": user["id"], "listingId": listing_id}))
    return 200, {"deleted": True}


ROUTES = {
    "GET /stats": stats,
    "GET /leaderboard": leaderboard,
    "GET /admin/users": list_users,
    "GET /admin/listings": list_listings,
    "DELETE /admin/listings/{id}": remove_listing,
}


def lambda_handler(event, context):
    return run(event, ROUTES)