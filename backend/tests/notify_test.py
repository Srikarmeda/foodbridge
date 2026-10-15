#!/usr/bin/env python3
"""Task 6 test data.
Creates: listing A (expires in 2 minutes) and listing B (claimed, pickup in 20 minutes).
Triggers: 'new food nearby' emails, a claim confirmation and a donor notice.
Then waits 2.5 minutes so listing A passes its expiry.

Usage:
  python backend/tests/notify_test.py --api https://abc123.execute-api.us-east-1.amazonaws.com \
     --client-id <APP_CLIENT_ID> --donor you+donor@example.com --receiver you+ngo@example.com
"""
import argparse
import sys
import time
from datetime import datetime, timedelta, timezone

from api_smoke_test import fmt, http, login


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True)
    ap.add_argument("--client-id", required=True)
    ap.add_argument("--donor", required=True)
    ap.add_argument("--receiver", required=True)
    ap.add_argument("--password", required=True)
    a = ap.parse_args()
    base = a.api.rstrip("/")
    dt = login(a.client_id, a.donor, a.password)
    rt = login(a.client_id, a.receiver, a.password)

    def call(method, path, token, body=None):
        return http(method, base + path, {"Content-Type": "application/json",
                                          "Authorization": "Bearer " + token}, body)

    now = datetime.now(timezone.utc)
    common = {"description": "Task 6 test", "foodType": "Cooked meal", "dietary": "veg",
              "quantityKg": 4, "servings": 12, "address": "Anna Nagar, Chennai",
              "lat": 13.085, "lng": 80.2101}

    listing_a = dict(common, title="Sweeper test A (expires soon)",
                     pickupStart=fmt(now + timedelta(seconds=30)),
                     pickupEnd=fmt(now + timedelta(seconds=90)),
                     expiresAt=fmt(now + timedelta(minutes=2)))
    s, d = call("POST", "/listings", dt, listing_a)
    if s != 201:
        sys.exit(f"Could not create listing A: {s} {d}")
    id_a = d["listing"]["listingId"]

    listing_b = dict(common, title="Reminder test B (claimed)",
                     pickupStart=fmt(now + timedelta(minutes=20)),
                     pickupEnd=fmt(now + timedelta(hours=2)),
                     expiresAt=fmt(now + timedelta(hours=3)))
    s, d = call("POST", "/listings", dt, listing_b)
    if s != 201:
        sys.exit(f"Could not create listing B: {s} {d}")
    id_b = d["listing"]["listingId"]
    s, d = call("POST", f"/listings/{id_b}/claim", rt)
    if s != 200:
        sys.exit(f"Could not claim listing B: {s} {d}")
    claim_b = d["claim"]["claimId"]

    print("Listing A (will expire):", id_a)
    print("Listing B (claimed)    :", id_b)
    print("Claim B                :", claim_b)
    print("\nCheck the donor and receiver inboxes now:")
    print("  receiver: 2x 'New food nearby' + 1x 'Claim confirmed'")
    print("  donor   : 1x 'Your listing was claimed'")
    print("\nWaiting 150 seconds so listing A passes its expiry...")
    for left in range(150, 0, -30):
        print(f"  {left}s left")
        time.sleep(30)
    print("\nDone waiting. Now invoke foodbridge-sweeper from the Lambda console (Test tab, event {}).")


if __name__ == "__main__":
    main()