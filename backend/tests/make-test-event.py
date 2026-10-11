#!/usr/bin/env python3
"""Print a Lambda console test event (with fresh timestamps) to paste into 'Test'.

Usage:  python backend/tests/make-test-event.py <name> [id]

  profile       -> foodbridge-profile    (donor)           profile-receiver, profile-admin-attempt
  presign       -> foodbridge-presign
  create        -> foodbridge-listings   (donor)
  browse, browse-far, mine, get <listingId>, withdraw <listingId>   -> foodbridge-listings
  claim <listingId>, claim-other <listingId>                         -> foodbridge-claims
  claims-mine, claims-incoming                                       -> foodbridge-claims
  pickup <claimId>, complete <claimId>, cancel <claimId>             -> foodbridge-claims
"""
import json
import sys
from datetime import datetime, timedelta, timezone

DONOR = ("test-donor-1", "donor@example.com", "Test Donor", "DONOR")
R1 = ("test-receiver-1", "ngo1@example.com", "Hope NGO", "RECEIVER")
R2 = ("test-receiver-2", "ngo2@example.com", "Care Volunteers", "RECEIVER")
EVIL = ("test-evil-1", "evil@example.com", "Evil User", "ADMIN")


def fmt(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def ev(route, who, body=None, path=None, query=None):
    sub, email, name, role = who
    claims = {"sub": sub, "email": email, "name": name,
              "cognito:username": sub, "custom:requestedRole": role}
    e = {"routeKey": route,
         "requestContext": {"authorizer": {"jwt": {"claims": claims}}}}
    if body is not None:
        e["body"] = json.dumps(body)
    if path:
        e["pathParameters"] = path
    if query:
        e["queryStringParameters"] = query
    return e


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    name = sys.argv[1]
    arg = sys.argv[2] if len(sys.argv) > 2 else "PASTE-ID-HERE"
    now = datetime.now(timezone.utc)

    profile_body = {"orgName": "Test Kitchen", "phone": "+91 98765 43210",
                    "address": "Anna Nagar, Chennai", "lat": 13.085, "lng": 80.2101}
    listing_body = {
        "title": "Veg biryani, 20 portions", "description": "Freshly cooked, packed in boxes.",
        "foodType": "Cooked meal", "dietary": "veg", "quantityKg": 6, "servings": 20,
        "address": "Anna Nagar, Chennai", "lat": 13.085, "lng": 80.2101,
        "pickupStart": fmt(now + timedelta(hours=1)),
        "pickupEnd": fmt(now + timedelta(hours=3)),
        "expiresAt": fmt(now + timedelta(hours=6)),
    }
    events = {
        "profile": lambda: ev("POST /profile", DONOR, profile_body),
        "profile-receiver": lambda: ev("POST /profile", R1, {"orgName": "Hope NGO"}),
        "profile-admin-attempt": lambda: ev("POST /profile", EVIL, {"orgName": "x"}),
        "presign": lambda: ev("POST /uploads/presign", DONOR, {"contentType": "image/jpeg"}),
        "create": lambda: ev("POST /listings", DONOR, listing_body),
        "browse": lambda: ev("GET /listings", R1, query={"lat": "13.0827", "lng": "80.2707", "radiusKm": "10"}),
        "browse-far": lambda: ev("GET /listings", R1, query={"lat": "11.0168", "lng": "76.9558", "radiusKm": "10"}),
        "mine": lambda: ev("GET /listings/mine", DONOR),
        "get": lambda: ev("GET /listings/{id}", R1, path={"id": arg}),
        "withdraw": lambda: ev("DELETE /listings/{id}", DONOR, path={"id": arg}),
        "claim": lambda: ev("POST /listings/{id}/claim", R1, path={"id": arg}),
        "claim-other": lambda: ev("POST /listings/{id}/claim", R2, path={"id": arg}),
        "claims-mine": lambda: ev("GET /claims/mine", R1),
        "claims-incoming": lambda: ev("GET /claims/incoming", DONOR),
        "pickup": lambda: ev("POST /claims/{id}/pickup", R1, path={"id": arg}),
        "complete": lambda: ev("POST /claims/{id}/complete", DONOR, path={"id": arg}),
        "cancel": lambda: ev("POST /claims/{id}/cancel", R1, path={"id": arg}),
    }
    if name not in events:
        sys.exit("Unknown event name.\n" + __doc__)
    print(json.dumps(events[name](), indent=2))


if __name__ == "__main__":
    main()