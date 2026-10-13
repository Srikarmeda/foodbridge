#!/usr/bin/env python3
"""Seed demo listings around Chennai (coordinates are approximate neighbourhood centres).

Usage:
  python backend/tests/seed_demo.py --api https://abc123.execute-api.us-east-1.amazonaws.com \
      --client-id <APP_CLIENT_ID> --donor you+donor@gmail.com [--password 'FoodBridge#2026']

Tip: set NOTIFY_MODE=off on foodbridge-listings first, otherwise every listing emails nearby receivers.
"""
import argparse
import sys
from datetime import datetime, timedelta, timezone

from api_smoke_test import fmt, http, login

# title, type, diet, kg, servings, address, lat, lng, pickup start (h), pickup end (h), expires (h), notes
DEMO = [
    ("Veg biryani and raita", "Cooked meal", "veg", 6, 20, "Anna Nagar, Chennai", 13.0850, 80.2101, 0.25, 2, 3, "Freshly cooked, packed in boxes."),
    ("Idli and sambar trays", "Cooked meal", "veg", 8, 40, "T Nagar, Chennai", 13.0418, 80.2341, 0.5, 2.5, 3.5, "Bring your own containers if possible."),
    ("Chicken curry and rice", "Cooked meal", "non-veg", 5, 15, "Adyar, Chennai", 13.0067, 80.2570, 0.1, 0.8, 0.9, "Must be collected quickly."),
    ("Fresh bread and buns", "Bakery", "vegan", 4, 30, "Mylapore, Chennai", 13.0368, 80.2676, 1, 3, 5, "Baked this morning."),
    ("Mixed fruit boxes", "Fruits & vegetables", "vegan", 10, 40, "Velachery, Chennai", 12.9815, 80.2180, 1, 6, 12, "Seasonal fruit, slightly ripe."),
    ("Sealed packaged snacks", "Packaged food", "veg", 3, 25, "Nungambakkam, Chennai", 13.0569, 80.2425, 2, 8, 24, "Unopened packs, long shelf life."),
    ("Milk packets and curd", "Dairy", "veg", 12, 24, "Guindy, Chennai", 13.0067, 80.2206, 0.5, 3, 4, "Keep chilled."),
    ("Wedding buffet leftovers", "Cooked meal", "non-veg", 15, 60, "Egmore, Chennai", 13.0732, 80.2609, 0.5, 2, 2.5, "Large quantity, vehicle recommended."),
    ("Fruit juice cartons", "Beverages", "vegan", 6, 30, "Besant Nagar, Chennai", 13.0002, 80.2668, 1, 10, 30, "Sealed cartons."),
    ("Sandwiches and wraps", "Bakery", "veg", 3, 18, "Kodambakkam, Chennai", 13.0521, 80.2255, 0.25, 2, 2.2, "Made today."),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True)
    ap.add_argument("--client-id", required=True)
    ap.add_argument("--donor", required=True)
    ap.add_argument("--password", default="FoodBridge#2026")
    a = ap.parse_args()
    base = a.api.rstrip("/")

    token = login(a.client_id, a.donor, a.password)
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + token}
    s, d = http("POST", base + "/profile", headers, {})  # make sure the donor profile exists
    if s != 200:
        sys.exit(f"Profile step failed: {s} {d}")

    now = datetime.now(timezone.utc)
    made = 0
    for title, ftype, diet, kg, serv, addr, lat, lng, st, en, ex, notes in DEMO:
        body = {
            "title": title, "description": notes, "foodType": ftype, "dietary": diet,
            "quantityKg": kg, "servings": serv, "address": addr, "lat": lat, "lng": lng,
            "pickupStart": fmt(now + timedelta(hours=st)),
            "pickupEnd": fmt(now + timedelta(hours=en)),
            "expiresAt": fmt(now + timedelta(hours=ex)),
        }
        s, d = http("POST", base + "/listings", headers, body)
        print(("OK    " if s == 201 else "FAIL  ") + title + ("" if s == 201 else f"  -> {s} {d}"))
        made += s == 201
    print(f"\n{made}/{len(DEMO)} listings created. Open browse.html as the receiver.")


if __name__ == "__main__":
    main()