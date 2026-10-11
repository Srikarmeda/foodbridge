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

## Photo key convention
`listings/{donorId}/{uuid}.{ext}` (public read on `listings/*` only)