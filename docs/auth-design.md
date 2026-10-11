# Authentication Design

- Service: Amazon Cognito user pool (us-east-1), sign-in with email
- App client: public (no secret), flows USER_PASSWORD_AUTH, USER_SRP_AUTH, REFRESH_TOKEN_AUTH
- Tokens: ID/access 60 min, refresh 7 days
- Groups: Admin (1), Donor (2), Receiver (3)

## Role assignment
1. Sign-up form sends `custom:requestedRole` = DONOR | RECEIVER (immutable attribute).
2. First login: browser calls `POST /profile`.
3. The profile Lambda validates the claim (never ADMIN), calls AdminAddUserToGroup,
   writes the users-table row, and the client refreshes its token to receive `cognito:groups`.
4. Admins are created manually in the console and added to the Admin group.

## Token claims used by the backend
| Claim | Use |
|---|---|
| sub | userId (primary key in users table) |
| email, name | display and notifications |
| cognito:groups | authorization (Admin / Donor / Receiver) |
| custom:requestedRole | one-time role bootstrap |

## API authorization (Task 5)
HTTP API JWT authorizer: issuer https://cognito-idp.us-east-1.amazonaws.com/<userPoolId>, audience = app client ID.