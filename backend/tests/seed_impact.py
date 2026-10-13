#!/usr/bin/env python3
"""Seed completed rescues (create -> claim -> pick up -> confirm) for the impact page.

Usage:
  python backend/tests/seed_impact.py --api https://abc123.execute-api.us-east-1.amazonaws.com \
     --client-id <APP_CLIENT_ID> --receiver you+ngo@gmail.com \
     --donor "you+donor@gmail.com:Anna Nagar Kitchen" --donor "you+donor2@gmail.com:City Bakery" \
     [--cycles 3] [--password 'FoodBridge#2026']

Each --donor is  email[:Organisation name].  Running it twice doubles the data.
Set NOTIFY_MODE=off on foodbridge-listings AND foodbridge-claims first (otherwise ~2 emails per cycle).
"""
import argparse
import sys
from datetime import datetime, timedelta, timezone

from api_smoke_test import fmt, http, login

# title, type, diet, kg, servings
BATCHES = [
    ("Veg meals, lunch service", "Cooked meal", "veg", 8, 32),
    ("Bread and pastries", "Bakery", "vegan", 5, 25),
    ("Fruit and vegetable crates", "Fruits & vegetables", "vegan", 12, 40),
    ("Chicken biryani trays", "Cooked meal", "non-veg", 10, 36),
    ("Sealed snack boxes", "Packaged food", "veg", 4, 20),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True)
    ap.add_argument("--client-id", required=True)
    ap.add_argument("--receiver", required=True)
    ap.add_argument("--donor", action="append", required=True)
    ap.add_argument("--cycles", type=int, default=3)
    ap.add_argument("--password", default="FoodBridge#2026")
    a = ap.parse_args()
    base = a.api.rstrip("/")

    def call(method, path, token, body=None):
        return http(method, base + path, {"Content-Type": "application/json", "Authorization": "Bearer " + token}, body)

    rt = login(a.client_id, a.receiver, a.password)
    call("POST", "/profile", rt, {})
    done = 0
    total_kg = 0.0

    for spec in a.donor:
        email, _, org = spec.partition(":")
        dt = login(a.client_id, email.strip(), a.password)
        s, d = call("POST", "/profile", dt, {"orgName": org.strip()} if org.strip() else {})
        if s != 200:
            sys.exit(f"Profile failed for {email}: {s} {d}")
        for i in range(a.cycles):
            title, ftype, diet, kg, serv = BATCHES[(i + len(email)) % len(BATCHES)]
            now = datetime.now(timezone.utc)
            body = {
                "title": f"{title} (demo)", "description": "Demo data for the impact page.",
                "foodType": ftype, "dietary": diet, "quantityKg": kg, "servings": serv,
                "address": "Anna Nagar, Chennai", "lat": 13.085, "lng": 80.2101,
                "pickupStart": fmt(now + timedelta(hours=1)), "pickupEnd": fmt(now + timedelta(hours=3)),
                "expiresAt": fmt(now + timedelta(hours=6)),
            }
            s, d = call("POST", "/listings", dt, body)
            if s != 201:
                print(f"FAIL  create for {email}: {s} {d}"); continue
            lid = d["listing"]["listingId"]
            s, d = call("POST", f"/listings/{lid}/claim", rt)
            if s != 200:
                print(f"FAIL  claim: {s} {d}"); continue
            cid = d["claim"]["claimId"]
            s1, _ = call("POST", f"/claims/{cid}/pickup", rt)
            s2, _ = call("POST", f"/claims/{cid}/complete", dt)
            ok = s1 == 200 and s2 == 200
            print(("OK    " if ok else "FAIL  ") + f"{org or email}: {title} ({kg} kg)")
            if ok:
                done += 1
                total_kg += kg

    print(f"\n{done} rescues completed, {total_kg:.0f} kg in total. Open impact.html.")


if __name__ == "__main__":
    main()