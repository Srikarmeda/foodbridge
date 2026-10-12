# Pages and user flows (Task 8)

| Page | Who | What it does |
|---|---|---|
| index.html | everyone | Hero, UNEP statistics (sourced), how it works, roles, CTA |
| signup.html | guests | Role choice, live password rules, email code, auto-login |
| login.html | guests | Email + password, ?next= redirect (local .html only), unconfirmed-user help |
| donor.html | Donor | Impact stats, claims needing attention, handover confirmation, listing management |
| post.html | Donor | Listing form, photo upload (presigned POST), Leaflet pin, validation mirroring the API |

## Flows
1. Sign up -> confirm code -> auto-login -> ensureProfile() (POST /profile) -> role home page
2. Post food -> upload photo (S3) -> POST /listings -> receivers within 10 km emailed -> dashboard
3. Receiver claims -> donor sees it under "Needs your attention" -> after pickup, donor confirms handover
4. Impact counts only COMPLETED claims: meals = servings, CO2e = kg x 2.5 (estimate)

## Safety notes
- All dynamic text is rendered through h() as text nodes (no innerHTML with user data)
- ?next= only accepts a plain local .html file name
- Map tiles and address search come from OpenStreetMap / Nominatim (light, button-triggered use)