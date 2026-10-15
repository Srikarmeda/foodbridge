#!/usr/bin/env python3
"""Task 10 smoke test: impact routes for everyone, admin routes for admins only.

Usage:
  python backend/tests/admin_smoke_test.py --api https://abc123.execute-api.us-east-1.amazonaws.com \
     --client-id <APP_CLIENT_ID> --admin <admin email> --donor you+donor@example.com \
     --password '<test password>' [--admin-password '...']
"""
import argparse
import sys
from datetime import datetime, timedelta, timezone

from api_smoke_test import fmt, http, login


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", required=True)
    ap.add_argument("--client-id", required=True)
    ap.add_argument("--admin", required=True)
    ap.add_argument("--donor", required=True)
    ap.add_argument("--password", required=True)
    ap.add_argument("--admin-password", default=None)
    a = ap.parse_args()
    base = a.api.rstrip("/")

    admin_tok = login(a.client_id, a.admin, a.admin_password or a.password)
    donor_tok = login(a.client_id, a.donor, a.password)

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

    # Everyone signed in
    s, d = call("GET", "/stats")
    check("01 no token is rejected (401)", s == 401, (s, d))
    s, d = call("GET", "/stats", donor_tok)
    st = d.get("stats", {})
    check("02 donor can read /stats", s == 200 and all(k in st for k in ("donations", "kg", "meals", "co2")), (s, d))
    s, lb = call("GET", "/leaderboard", donor_tok)
    rows = lb.get("leaderboard", [])
    check("03 donor can read /leaderboard", s == 200 and isinstance(rows, list), (s, lb))

    # Admin only
    s, d = call("GET", "/admin/users", donor_tok)
    check("04 donor blocked from /admin/users (403)", s == 403, (s, d))
    s, d = call("GET", "/admin/listings", donor_tok)
    check("05 donor blocked from /admin/listings (403)", s == 403, (s, d))
    s, d = call("DELETE", "/admin/listings/does-not-matter", donor_tok)
    check("06 donor blocked from removing listings (403)", s == 403, (s, d))

    s, d = call("GET", "/stats", admin_tok)
    check("07 admin can read /stats", s == 200, (s, d))
    s, d = call("GET", "/admin/users", admin_tok)
    check("08 admin lists users with counts", s == 200 and "DONOR" in d.get("counts", {}) and isinstance(d.get("users"), list), (s, d))
    s, d = call("GET", "/admin/listings", admin_tok)
    check("09 admin lists listings with counts", s == 200 and "AVAILABLE" in d.get("counts", {}), (s, d))

    # Moderation round trip
    call("POST", "/profile", donor_tok, {})
    now = datetime.now(timezone.utc)
    body = {
        "title": "Moderation test listing", "description": "Admin smoke test.",
        "foodType": "Cooked meal", "dietary": "veg", "quantityKg": 2, "servings": 8,
        "address": "Anna Nagar, Chennai", "lat": 13.085, "lng": 80.2101,
        "pickupStart": fmt(now + timedelta(hours=1)), "pickupEnd": fmt(now + timedelta(hours=3)),
        "expiresAt": fmt(now + timedelta(hours=6)),
    }
    s, d = call("POST", "/listings", donor_tok, body)
    lid = d.get("listing", {}).get("listingId")
    check("10 donor creates a listing", s == 201 and lid, (s, d))
    if not lid:
        sys.exit("Cannot continue without a listing.")
    s, d = call("GET", "/admin/listings?status=AVAILABLE", admin_tok)
    check("11 admin sees it as AVAILABLE", s == 200 and any(x["listingId"] == lid for x in d.get("listings", [])), (s, d))
    s, d = call("DELETE", f"/admin/listings/{lid}", admin_tok)
    check("12 admin removes it", s == 200 and d.get("deleted") is True, (s, d))
    s, d = call("GET", f"/listings/{lid}", donor_tok)
    check("13 listing is gone (404)", s == 404, (s, d))
    s, d = call("DELETE", f"/admin/listings/{lid}", admin_tok)
    check("14 removing again is refused (409)", s == 409, (s, d))

    # Consistency
    kgs = [r["kg"] for r in rows]
    check("15 leaderboard is sorted by kg", kgs == sorted(kgs, reverse=True), kgs)
    check("16 platform kg covers the top donor", not rows or st.get("kg", 0) + 0.05 >= rows[0]["kg"], (st, rows[:1]))

    print(f"\n{sum(results)}/{len(results)} checks passed.")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()