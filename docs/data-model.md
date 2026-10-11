# FoodBridge Data Model

Region: us-east-1 · Billing: on-demand · Timestamps: ISO-8601 UTC strings

## Tables
| Table | PK |
|---|---|
| foodbridge-users | userId (Cognito sub) |
| foodbridge-listings | listingId |
| foodbridge-claims | claimId |

## GSIs (projection: ALL)
| Table | Index | PK | SK |
|---|---|---|---|
| users | role-createdAt-index | role | createdAt |
| listings | donor-createdAt-index | donorId | createdAt |
| listings | status-expiresAt-index | status | expiresAt |
| listings | geo5-expiresAt-index | geo5 | expiresAt |
| claims | receiver-createdAt-index | receiverId | createdAt |
| claims | donor-createdAt-index | donorId | createdAt |
| claims | listing-createdAt-index | listingId | createdAt |
| claims | status-pickupStart-index | status | pickupStart |

## Item shapes
**User:** userId, email, name, role (DONOR|RECEIVER|ADMIN), orgName, phone, address, lat, lng, createdAt

**Listing:** listingId, donorId, donorName, title, foodType, dietary (veg|non-veg|vegan), quantityKg, servings, photoKey, address, lat, lng, geo5, pickupStart, pickupEnd, expiresAt, status, claimedBy, claimId, createdAt, updatedAt

**Claim:** claimId, listingId, donorId, receiverId, receiverName, status, kg, servings, pickupStart, createdAt, pickedUpAt, completedAt

## Access patterns
| # | Need | Operation |
|---|---|---|
| AP1 | My profile | GetItem users |
| AP2 | Admin lists users by role | Query role-createdAt-index |
| AP3 | One listing | GetItem listings |
| AP4 | Donor's listings | Query donor-createdAt-index |
| AP5 | Browse available by expiry | Query status-expiresAt-index (AVAILABLE) |
| AP6 | Available near me | Query geo5-expiresAt-index + Haversine |
| AP7 | Atomic claim | UpdateItem with condition status = AVAILABLE |
| AP8 | Expire stale | Query status-expiresAt-index (AVAILABLE, expiresAt < now) |
| AP9 | My claims | Query receiver-createdAt-index |
| AP10 | Claims on my food | Query claims donor-createdAt-index |
| AP11 | Pickup reminders | Query status-pickupStart-index (CLAIMED, soon) |
| AP12 | Stats / leaderboard | Query status-pickupStart-index (COMPLETED) + aggregate |

## Design notes
- `status` is a DynamoDB reserved word; use ExpressionAttributeNames (`#s`).
- Claims are denormalized (donorId, kg, servings) so stats need no joins.
- Double-claim prevention relies on atomic conditional writes.