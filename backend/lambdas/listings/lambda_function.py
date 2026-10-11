"""foodbridge-listings
Routes: POST   /listings          donor creates a listing
        GET    /listings          browse/search/filter (distance, type, diet, text)
        GET    /listings/mine     donor's own listings
        GET    /listings/{id}     one listing
        DELETE /listings/{id}     donor withdraws an AVAILABLE listing
"""
import math

from common import *  # noqa: F401,F403 (layer)

FOOD_TYPES = {"Cooked meal", "Bakery", "Fruits & vegetables", "Packaged food",
              "Dairy", "Beverages", "Other"}
DIETARY = {"veg", "non-veg", "vegan"}
GEO_MAX_KM = 10  # beyond this, fall back to the status index

_B32 = "0123456789bcdefghjkmnpqrstuvwxyz"


def geohash(lat, lng, precision=5):
    lat_rng, lng_rng = [-90.0, 90.0], [-180.0, 180.0]
    bits, bit, ch, even, out = [16, 8, 4, 2, 1], 0, 0, True, ""
    while len(out) < precision:
        rng, val = (lng_rng, lng) if even else (lat_rng, lat)
        mid = (rng[0] + rng[1]) / 2
        if val > mid:
            ch |= bits[bit]
            rng[0] = mid
        else:
            rng[1] = mid
        even = not even
        if bit < 4:
            bit += 1
        else:
            out += _B32[ch]
            bit, ch = 0, 0
    return out


def haversine(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(a))


def _span(center, delta, step=0.04):
    # A 5-char geohash cell is ~0.044 degrees wide, so a 0.04 step touches every cell.
    pts, x = [], center - delta
    while x < center + delta:
        pts.append(x)
        x += step
    pts.append(center + delta)
    return pts


def cells_for(lat, lng, radius_km):
    dlat = radius_km / 111.0
    dlng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.05))
    cells = set()
    for la in _span(lat, dlat):
        for ln in _span(lng, dlng):
            cells.add(geohash(max(-89.99, min(89.99, la)), max(-179.99, min(179.99, ln))))
    return cells


def public_listing(item):
    out = dict(item)
    out["photoUrl"] = f"{IMAGES_BASE_URL}/{out['photoKey']}" if out.get("photoKey") else None
    if out.get("status") == "AVAILABLE" and out.get("expiresAt", "") <= now_iso():
        out["status"] = "EXPIRED"  # sweeper (Task 6) persists this; reads are always correct
    return out


# ---------- handlers ----------
def create_listing(event, user):
    require(user, "DONOR", "ADMIN")
    b = body(event)

    profile = get_profile(user["id"])
    if not profile:
        raise ApiError(409, "Complete your profile first (POST /profile)")
    donor_name = profile.get("orgName") or user["name"] or "Anonymous donor"

    title = text(b.get("title"), "title", 3, 80)
    description = text(b.get("description"), "description", 0, 300)
    food_type = b.get("foodType")
    if food_type not in FOOD_TYPES:
        raise ApiError(400, "foodType must be one of: " + ", ".join(sorted(FOOD_TYPES)))
    dietary = b.get("dietary")
    if dietary not in DIETARY:
        raise ApiError(400, "dietary must be veg, non-veg or vegan")
    kg = num(b.get("quantityKg"), "quantityKg", 0.1, 1000)
    servings = int(num(b.get("servings"), "servings", 1, 5000))
    address = text(b.get("address"), "address", 5, 200)
    lat = num(b.get("lat"), "lat", -90, 90)
    lng = num(b.get("lng"), "lng", -180, 180)

    start, end, expiry = (parse_iso(b.get(k)) for k in ("pickupStart", "pickupEnd", "expiresAt"))
    now = now_dt()
    if expiry <= now:
        raise ApiError(400, "expiresAt must be in the future")
    if not start < end:
        raise ApiError(400, "pickupStart must be before pickupEnd")
    if end > expiry:
        raise ApiError(400, "pickupEnd cannot be after expiresAt")
    if expiry - now > timedelta(days=3):
        raise ApiError(400, "expiresAt must be within 3 days from now")

    photo_key = str(b.get("photoKey") or "")
    if photo_key and not photo_key.startswith(f"listings/{user['id']}/"):
        raise ApiError(400, "photoKey does not belong to you")

    item = to_ddb({
        "listingId": str(uuid.uuid4()),
        "donorId": user["id"],
        "donorName": donor_name,
        "title": title,
        "description": description,
        "foodType": food_type,
        "dietary": dietary,
        "quantityKg": kg,
        "servings": servings,
        "photoKey": photo_key,
        "address": address,
        "lat": lat,
        "lng": lng,
        "geo5": geohash(lat, lng, 5),
        "pickupStart": iso(start),
        "pickupEnd": iso(end),
        "expiresAt": iso(expiry),
        "status": "AVAILABLE",
        "createdAt": iso(now),
        "updatedAt": iso(now),
    })
    LISTINGS.put_item(Item=item)
    return 201, {"listing": public_listing(item)}


def browse(event, user):
    q = event.get("queryStringParameters") or {}
    now = now_iso()

    lat = lng = None
    if q.get("lat") and q.get("lng"):
        lat = num(q["lat"], "lat", -90, 90)
        lng = num(q["lng"], "lng", -180, 180)
    radius = num(q.get("radiusKm", 10), "radiusKm", 0.5, 100)

    items = []
    if lat is not None and radius <= GEO_MAX_KM:  # AP6: geohash cells
        for cell in cells_for(lat, lng, radius):
            resp = LISTINGS.query(
                IndexName="geo5-expiresAt-index",
                KeyConditionExpression=Key("geo5").eq(cell) & Key("expiresAt").gt(now),
                FilterExpression=Attr("status").eq("AVAILABLE"),
            )
            items += resp["Items"]
    else:  # AP5: all available, soonest expiry first
        resp = LISTINGS.query(
            IndexName="status-expiresAt-index",
            KeyConditionExpression=Key("status").eq("AVAILABLE") & Key("expiresAt").gt(now),
        )
        items = resp["Items"]

    food_type = q.get("foodType")
    dietary = q.get("dietary")
    term = str(q.get("q", "")).strip().lower()

    results = []
    for it in items:
        dist = None
        if lat is not None:
            dist = haversine(lat, lng, float(it["lat"]), float(it["lng"]))
            if dist > radius:
                continue
        if food_type and it.get("foodType") != food_type:
            continue
        if dietary and it.get("dietary") != dietary:
            continue
        if term and term not in f"{it['title']} {it['donorName']} {it.get('foodType', '')}".lower():
            continue
        view = public_listing(it)
        view["distanceKm"] = round(dist, 1) if dist is not None else None
        results.append(view)

    if q.get("sort") == "distance" and lat is not None:
        results.sort(key=lambda x: x["distanceKm"])
    else:
        results.sort(key=lambda x: x["expiresAt"])
    return 200, {"count": len(results), "listings": results[:100]}


def my_listings(event, user):
    require(user, "DONOR", "ADMIN")
    resp = LISTINGS.query(
        IndexName="donor-createdAt-index",
        KeyConditionExpression=Key("donorId").eq(user["id"]),
        ScanIndexForward=False,
        Limit=100,
    )
    return 200, {"listings": [public_listing(i) for i in resp["Items"]]}


def get_listing(event, user):
    item = LISTINGS.get_item(Key={"listingId": event["pathParameters"]["id"]}).get("Item")
    if not item:
        raise ApiError(404, "Listing not found")
    return 200, {"listing": public_listing(item)}


def withdraw_listing(event, user):
    require(user, "DONOR")
    try:
        LISTINGS.delete_item(
            Key={"listingId": event["pathParameters"]["id"]},
            ConditionExpression="donorId = :d AND #s = :a",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":d": user["id"], ":a": "AVAILABLE"},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise ApiError(409, "Only your own AVAILABLE listings can be withdrawn")
        raise
    return 200, {"deleted": True}


ROUTES = {
    "POST /listings": create_listing,
    "GET /listings": browse,
    "GET /listings/mine": my_listings,
    "GET /listings/{id}": get_listing,
    "DELETE /listings/{id}": withdraw_listing,
}


def lambda_handler(event, context):
    return run(event, ROUTES)