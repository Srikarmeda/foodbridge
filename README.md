# 🌉 FoodBridge

> From extra to essential: a serverless platform that connects surplus-food donors with NGOs and volunteers before the food expires.

![status](https://img.shields.io/badge/status-complete-1F7A4D)
![aws](https://img.shields.io/badge/AWS-serverless-232F3E)
![python](https://img.shields.io/badge/Lambda-Python%203.12-3776AB)

**Live demo:** https://YOUR-CLOUDFRONT-DOMAIN  ·  **Architecture:** [docs/architecture.md](docs/architecture.md)

## Why
About 1.05 billion tonnes of food were wasted worldwide in 2022 (19% of food available to consumers) while 783 million people faced chronic hunger (UNEP Food Waste Index Report 2024). FoodBridge shortens the path between a kitchen with leftovers and a shelter that needs them.

## Features
- **Three roles:** Donor, Receiver, Admin, with secure email sign-up and login
- **Donors:** post food with photo, quantity, dietary tags, pickup window, expiry and a map pin
- **Receivers:** browse and filter by distance, type and diet, see results on a live map, claim in one tap
- **Safe claims:** Available → Claimed → Picked up → Completed (or Expired / Cancelled), with atomic double-claim prevention
- **Automation:** listings expire automatically; email alerts for nearby food, claim confirmations and pickup reminders
- **Impact:** meals saved, kg rescued and CO₂e avoided (estimates), plus a donor leaderboard
- **Admin:** platform stats, user and listing tables, listing moderation
- **UI:** mobile-first, WCAG AA contrast, keyboard accessible, skeleton loaders, toasts, empty and error states

## Architecture
CloudFront + S3 · Cognito · API Gateway (HTTP API, JWT authorizer) · 6 Lambda functions · DynamoDB (3 tables, 8 GSIs) · S3 presigned uploads · EventBridge · SES · Leaflet + OpenStreetMap. Diagrams and flows are in [docs/architecture.md](docs/architecture.md).

## Screenshots
| Landing | Browse + map |
|---|---|
| ![](docs/screenshots/landing.png) | ![](docs/screenshots/browse.png) |
| Donor dashboard | Impact leaderboard |
| ![](docs/screenshots/donor.png) | ![](docs/screenshots/impact.png) |

## Repository layout
| Path | Purpose |
|---|---|
| `backend/lambdas/` | One folder per Lambda function |
| `backend/layer/python/` | Shared layer: auth, validation, notifications |
| `backend/scripts/` | CloudShell scripts for API routes and CORS |
| `backend/tests/` | API, admin and live-site test scripts, seeders |
| `frontend/` | Static site (HTML, CSS, ES modules, no build step) |
| `docs/` | Architecture, data model, API, design system, demo script |

## Run the frontend locally
```bash
cd frontend
python -m http.server 8080   # then open http://localhost:8080
```
Set your own values in `frontend/js/config.js` (API URL, Cognito pool and client IDs, photo bucket URL).

## Deploy
1. Create the AWS resources in the order of [docs/aws-resources.md](docs/aws-resources.md).
2. Upload the contents of `frontend/` to the website bucket, then invalidate the CloudFront cache.
3. Verify with `python backend/tests/live_check.py --site ... --api ... --images ...`.

## Tests
`api_smoke_test.py` (20 checks), `admin_smoke_test.py` (16), `live_check.py` (12). Seed scripts create demo data.

## Security
Verified JWT on every route, server-side role checks, input validation, conditional writes, presigned uploads with size and type limits, CORS allow-list, throttling, security headers. Known gap: the website bucket is public.

## Cost
Estimated well under $3 for the whole build, with no idle cost.

## Roadmap
Custom domain, CloudFront OAC with a private bucket, Content-Security-Policy and SRI, CI/CD deployment, SES production access, push notifications.

## Impact assumptions
1 kg of food ≈ 2.5 meals (servings entered by donors are used when available) and ≈ 2.5 kg CO₂e avoided. These are estimates and are shown as such in the UI.