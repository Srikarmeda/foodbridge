# FoodBridge Demo Script (about 8 minutes)

## Before you present (30 minutes ahead)
1. Start the Learner Lab and confirm the console opens. Do not rely on the app answering while the lab is stopped.
2. Open the live site and log in as each role once. Fix anything that fails now, not on stage.
3. Seed fresh demo data (expiries are hours, so seed within an hour of presenting):
   - Set NOTIFY_MODE=off on foodbridge-listings, run `seed_demo.py`, then delete NOTIFY_MODE again.
4. Check the SES identities show Verified, and the receiver has a saved location (set it on Browse once).
5. Open four windows: A donor (normal), B receiver (private window), C admin (second private window or profile), D slides.
6. Invalidate the CloudFront cache if you uploaded files recently.
7. Keep backup screenshots or a short screen recording ready for every step.

## Accounts (passwords are not stored in the repo)
| Role | Window | Use |
|---|---|---|
| Donor | A | Posts food, confirms handover |
| Receiver | B | Browses, claims, picks up |
| Admin | C | Dashboard and moderation |

## Script
| Time | Show | Say |
|---|---|---|
| 0:00 | Landing page | "Over a billion tonnes of food are wasted a year while 783 million people go hungry. FoodBridge connects surplus food with the people who can use it before it expires." |
| 0:45 | Architecture slide | "Fully serverless: CloudFront and S3, Cognito, API Gateway, Lambda, DynamoDB, EventBridge and SES. It costs cents and needs no servers." |
| 1:45 | Window A: Post food | Fill the form, drop a photo, search an address, pin the map. "Receivers within 10 km get an email as soon as this posts." Click Post. |
| 3:15 | Window B: Browse | New listing appears on the map. Filter by Veg, switch to nearest first, click a pin. "Distance uses geohash cells plus the Haversine formula." Open details, click Claim. |
| 4:15 | Email inbox | Show the claim confirmation email. |
| 4:45 | Double-claim test | Open the same listing in a second receiver tab, claim in both. "One transaction in DynamoDB makes the second claim fail with a clear message. No double-claiming is possible." |
| 5:30 | Window B then A | Receiver: I've picked it up. Donor: Confirm handover. Stats rise. "Only donor-confirmed handovers count toward impact." |
| 6:30 | Impact page, then Window C | Leaderboard, then the admin dashboard. "Admins see users and listings and can remove available listings. Roles come from Cognito groups, so the browser cannot grant itself admin." |
| 7:15 | AWS console | API Gateway routes (19 secured), DynamoDB items, the EventBridge rule. "A scheduled Lambda expires listings and sends pickup reminders." |
| 8:00 | Wrap | "Security: JWT, validation, presigned uploads, CORS allow-list. Next: custom domain, CI deployment, CSP." |

## If something breaks
| Problem | Do this |
|---|---|
| Emails slow | Say "SES sandbox delivery can lag", show the earlier email screenshot |
| API errors | Refresh once, check the lab is running, then show the recording |
| Map tiles missing | The list still works: "OpenStreetMap is a free tile service" |
| Login fails | Switch to the pre-logged-in window |

## Likely questions
- Why serverless? No idle cost, nothing to patch, conditional writes give atomic claims.
- How is double-claiming prevented? One DynamoDB transaction with a condition on status.
- How do listings expire? Reads hide them instantly, and a five-minute EventBridge sweeper persists the status.
- How is admin protected? The role comes from the Cognito group in the verified token, and admin routes check it server-side.
- What did it cost? Well under $3 of the $50 lab budget (estimate).
- What would you change for production? Custom domain, private bucket with OAC, CSP, CI/CD, SES production access.