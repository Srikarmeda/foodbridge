# FoodBridge API

Base URL: `https://<api-id>.execute-api.us-east-1.amazonaws.com` (HTTP API, `$default` stage)
Auth: `Authorization: Bearer <Cognito ID token>` on every route (JWT authorizer `cognito-jwt`)
Errors: `{"error": "message"}` with 400, 401, 403, 404, 409, 410 or 500

| Method | Path | Lambda | Who |
|---|---|---|---|
| POST | /profile | foodbridge-profile | any signed-in user |
| GET | /profile | foodbridge-profile | any signed-in user |
| POST | /uploads/presign | foodbridge-presign | Donor, Admin |
| POST | /listings | foodbridge-listings | Donor, Admin |
| GET | /listings | foodbridge-listings | any (query: lat, lng, radiusKm, foodType, dietary, q, sort) |
| GET | /listings/mine | foodbridge-listings | Donor, Admin |
| GET | /listings/{id} | foodbridge-listings | any |
| DELETE | /listings/{id} | foodbridge-listings | owning Donor (AVAILABLE only) |
| POST | /listings/{id}/claim | foodbridge-claims | Receiver |
| GET | /claims/mine | foodbridge-claims | Receiver, Admin |
| GET | /claims/incoming | foodbridge-claims | Donor, Admin |
| POST | /claims/{id}/pickup | foodbridge-claims | claiming Receiver |
| POST | /claims/{id}/complete | foodbridge-claims | owning Donor |
| POST | /claims/{id}/cancel | foodbridge-claims | claiming Receiver |

Throttling: 10 requests/s, burst 20. CORS: configured on the gateway (origin narrowed in Task 11).

## Task 10 routes (foodbridge-admin)
| Method | Path | Who |
|---|---|---|
| GET | /stats | any signed-in user (completed-handover totals, cached 15 s) |
| GET | /leaderboard | any signed-in user (top 10 donors by kg; own rank included; never exposes user ids) |
| GET | /admin/users | Admin (counts + users; no phone or coordinates) |
| GET | /admin/listings | Admin (counts + latest 200; optional ?status=) |
| DELETE | /admin/listings/{id} | Admin (AVAILABLE only; audit line in CloudWatch) |

Total routes: 19. Impact definition: only COMPLETED claims; meals = servings (fallback kg x 2.5); CO2e = kg x 2.5.

