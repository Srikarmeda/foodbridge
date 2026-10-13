# AWS Resources (us-east-1)

| Resource | Name / ID | Created in |
|---|---|---|
| DynamoDB table | foodbridge-users | Task 1 |
| DynamoDB table | foodbridge-listings | Task 1 |
| DynamoDB table | foodbridge-claims | Task 1 |
| S3 bucket (images) | foodbridge-images-srikar | Task 2 |
| S3 bucket (website) | foodbridge-web-srikar | Task 2 |
| Website endpoint | http://foodbridge-web-srikar.s3-website-us-east-1.amazonaws.com | Task 2 |
| Cognito user pool | _filled in Task 3_ | Task 3 |
| Cognito user pool | foodbridge-pool (us-east-1_gI0tvTNia) | Task 3 |
| Cognito app client | foodbridge-web-client (public, no secret) | Task 3 |
| Cognito groups | Admin, Donor, Receiver | Task 3 |
| Lambda layer | foodbridge-common (Python 3.12) | Task 4 |
| Lambda | foodbridge-profile | Task 4 |
| Lambda | foodbridge-presign | Task 4 |
| Lambda | foodbridge-listings | Task 4 |
| Lambda | foodbridge-claims | Task 4 |
| HTTP API | foodbridge-api (| HTTP API | foodbridge-api (http://foodbridge-web-srikar.s3-website-us-east-1.amazonaws.com) | Task 5 |
| JWT authorizer | cognito-jwt (issuer = pool, audience = app client) | Task 5 |) | Task 5 |
| JWT authorizer | cognito-jwt (issuer = pool, audience = app client) | Task 5 |
| SES identities | 3 verified emails (sender, donor, receiver; not listed) | Task 6 |
| Lambda layer | foodbridge-common version 2 (adds notify.py) | Task 6 |
| Lambda | foodbridge-sweeper | Task 6 |
| EventBridge rule | foodbridge-sweeper-5min, rate(5 minutes) | Task 6 |
| Frontend (design system) | styleguide.html on the website bucket | Task 7 |
## Photo key convention
`listings/{donorId}/{uuid}.{ext}` (public read on `listings/*` only)