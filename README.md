# 🌉 FoodBridge

> From extra to essential: a serverless platform that connects surplus-food donors with NGOs and volunteers before the food expires.

![status](https://img.shields.io/badge/status-in%20development-orange)
![aws](https://img.shields.io/badge/AWS-Serverless-232F3E)

## Overview
FoodBridge lets restaurants, hotels, caterers, households and event organizers post surplus food.
NGOs, shelters and volunteers browse a live map, claim a listing, and pick it up before it expires.

## Architecture
S3 + CloudFront · Cognito · API Gateway (HTTP API) · Lambda · DynamoDB · S3 presigned uploads · EventBridge · SES · Leaflet + OpenStreetMap

See [`docs/architecture.md`](docs/architecture.md) and [`docs/data-model.md`](docs/data-model.md).

## Roles
- **Donor**: posts listings, tracks claims, sees personal impact
- **Receiver**: browses, filters, maps and claims food
- **Admin**: manages users and listings, views impact stats

## Claim lifecycle
`AVAILABLE → CLAIMED → PICKED_UP → COMPLETED` (or `EXPIRED` if nobody claims in time)

## Repository layout
| Path | Purpose |
|---|---|
| `backend/lambdas/` | One folder per Lambda function |
| `backend/policies/` | JSON policies |
| `frontend/` | Static site (HTML/CSS/JS ES modules) |
| `data/` | Sample and test data |
| `docs/` | Diagrams, data model, demo script |

## Status
Built task by task. See git tags `task-0-done`, `task-1-done`, and so on.

## Impact assumptions
1 kg of food ≈ 2.5 meals; 1 kg of food rescued ≈ 2.5 kg CO₂e avoided (estimates, shown as such in the UI).