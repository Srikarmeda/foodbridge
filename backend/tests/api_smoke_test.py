#!/usr/bin/env python3
"""FoodBridge API smoke test (Task 5).

Usage:
  python backend/tests/api_smoke_test.py --api https://abc123.execute-api.us-east-1.amazonaws.com \
      --client-id <APP_CLIENT_ID> --donor you+donor@example.com --receiver you+ngo@example.com \
      --password '<test password>'

Both users must already exist, be confirmed, and use the same password.
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

COGNITO = "https://cognito-idp.us-east-1.amazonaws.com/"


def http(method, url, headers=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"raw": raw}


def login(client_id, email, password):
    status, data = http(
        "POST", COGNITO,
        {"Content-Type": "application/x-amz-json-1.1",
         "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth"},
        {"AuthFlow": "USER_PASSWORD_AUTH", "ClientId": client_id,
         "AuthParameters": {"USERNAME": email, "PASSWORD": password}},
    )
    if status != 200:
        sys.exit(f"Login failed for {email}: {data}")
    return data["AuthenticationResult"]["IdToken"]


def fmt(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True)
    ap.add_argument("--client-id", required=True)
    ap.add_argument("--donor", required=True)
    ap.add_argument("--receiver", required=True)
    ap.add_argument("--password", required=True)
    a = ap.parse_args()
    base = a.api.rstrip("/")

    donor_tok = login(a.client_id, a.donor, a.password)
    recv_tok = login(a.client_id, a.receiver, a.password)

    def call(method, path, token=None, body=None):
        h = {"Content-Type": "application/json"}
        if token:
            h["Authorization"] = "Bearer " + token
        return http(method, base + path, h, body)

    results = []

    def check(name, ok, detail=None):
        print(("PASS  " if ok else "FAIL  ") + name)
        if not ok:
            print("      got:", detail)
            results.append(bool(ok))

    now = datetime.now(timezone.utc)
    listing_body = {
        "title": "Veg biryani, 20 portions", "description": "Freshly cooked, packed in boxes.",
        "foodType": "Cooked meal", "dietary": "veg", "quantityKg": 6, "servings": 20,
        "address": "Anna Nagar, Chennai", "lat": 13.085, "lng": 80.2101,
        "pickupStart": fmt(now + timedelta(hours=1)),
        "pickupEnd": fmt(now + timedelta(hours=3)),
        "expiresAt": fmt(now + timedelta(hours=6)),
    }

    # 1. Security
    s, d = call("GET", "/listings")
    check("01 no token is rejected (401)", s == 401, (s, d))

    # 2. Profiles
    s, d = call("POST", "/profile", donor_tok, {
        "orgName": "Test Kitchen", "phone": "+91 98765 43210",
        "address": "Anna Nagar, Chennai", "lat": 13.085, "lng": 80.2101})
    check("02 donor profile saved, role DONOR", s == 200 and d.get("profile", {}).get("role") == "DONOR", (s, d))
    s, d = call("POST", "/profile", recv_tok, {
        "orgName": "Hope NGO", "address": "T Nagar, Chennai", "lat": 13.0418, "lng": 80.2341})
    check("03 receiver profile saved, role RECEIVER", s == 200 and d.get("profile", {}).get("role") == "RECEIVER", (s, d))

    # 3. Presign
    s, d = call("POST", "/uploads/presign", donor_tok, {"contentType": "image/jpeg"})
    check("04 donor gets presigned upload", s == 200 and d.get("key", "").startswith("listings/"), (s, d))
    s, d = call("POST", "/uploads/presign", recv_tok, {"contentType": "image/jpeg"})
    check("05 receiver cannot presign (403)", s == 403, (s, d))

    # 4. Listings
    s, d = call("POST", "/listings", donor_tok, listing_body)
    listing_id = d.get("listing", {}).get("listingId")
    check("06 donor creates listing (201)", s == 201 and listing_id, (s, d))
    if not listing_id:
        sys.exit("Cannot continue without a listing.")
    s, d = call("POST", "/listings", recv_tok, listing_body)
    check("07 receiver cannot create listing (403)", s == 403, (s, d))
    bad = dict(listing_body, title="x")
    s, d = call("POST", "/listings", donor_tok, bad)
    check("08 invalid input rejected (400)", s == 400, (s, d))
    s, d = call("GET", "/listings?lat=13.0827&lng=80.2707&radiusKm=10", recv_tok)
    ids = [x["listingId"] for x in d.get("listings", [])]
    check("09 nearby search finds the listing", s == 200 and listing_id in ids, (s, d))
    s, d = call("GET", "/listings/" + listing_id, recv_tok)
    check("10 listing detail loads", s == 200 and d.get("listing", {}).get("status") == "AVAILABLE", (s, d))

    # 5. Claim flow
    s, d = call("POST", f"/listings/{listing_id}/claim", donor_tok)
    check("11 donor cannot claim (403)", s == 403, (s, d))
    s, d = call("POST", f"/listings/{listing_id}/claim", recv_tok)
    claim_id = d.get("claim", {}).get("claimId")
    check("12 receiver claims (200, CLAIMED)", s == 200 and d.get("claim", {}).get("status") == "CLAIMED", (s, d))
    s, d = call("POST", f"/listings/{listing_id}/claim", recv_tok)
    check("13 second claim is blocked (409)", s == 409, (s, d))
    s, d = call("POST", f"/claims/{claim_id}/pickup", recv_tok)
    check("14 receiver marks picked up", s == 200 and d.get("claim", {}).get("status") == "PICKED_UP", (s, d))
    s, d = call("POST", f"/claims/{claim_id}/complete", recv_tok)
    check("15 receiver cannot complete (403)", s == 403, (s, d))
    s, d = call("POST", f"/claims/{claim_id}/complete", donor_tok)
    check("16 donor completes", s == 200 and d.get("claim", {}).get("status") == "COMPLETED", (s, d))

    # 6. Read-backs
    s, d = call("GET", "/listings/" + listing_id, recv_tok)
    check("17 listing is COMPLETED", s == 200 and d.get("listing", {}).get("status") == "COMPLETED", (s, d))
    s, d = call("GET", "/claims/mine", recv_tok)
    check("18 My claims shows it", s == 200 and any(c["claimId"] == claim_id for c in d.get("claims", [])), (s, d))
    s, d = call("GET", "/claims/incoming", donor_tok)
    check("19 donor's incoming claims shows it", s == 200 and any(c["claimId"] == claim_id for c in d.get("claims", [])), (s, d))
    s, d = call("DELETE", "/listings/" + listing_id, donor_tok)
    check("20 completed listing cannot be withdrawn (409)", s == 409, (s, d))

    print(f"\n{sum(results)}/{len(results)} checks passed.")
    print("Test listing id:", listing_id, "| claim id:", claim_id)
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()