# Notifications

| Email | Trigger | Sent by | Recipient |
|---|---|---|---|
| New food nearby | Listing created | foodbridge-listings | Receivers within 10 km (max 10) |
| Claim confirmed | Claim succeeds | foodbridge-claims | Receiver |
| Your listing was claimed | Claim succeeds | foodbridge-claims | Donor |
| Pickup reminder | Pickup window starts within 60 min | foodbridge-sweeper | Receiver (once per claim) |

- SES sandbox: sender and recipients must be verified identities (addresses are not stored in this repo).
- Email failures are logged and never fail the API call.
- Sweeper schedule: EventBridge rule `foodbridge-sweeper-5min`, `rate(5 minutes)`.
- Sweeper also persists EXPIRED on stale AVAILABLE listings (reads already hide them).
- Env vars: SENDER_EMAIL, APP_URL, REMINDER_MINUTES, NOTIFY_MODE (ses|sns|off), NEARBY_KM.