# FoodBridge: lifecycle, persistence and cleanup

## What persists
| Item | After the 4-hour session ends | After a lab Reset or the course end date | Idle cost (estimate) |
|---|---|---|---|
| GitHub repo, tags, local files | Kept | Kept (outside AWS) | $0 |
| DynamoDB tables and rows | Kept | Deleted | cents or less |
| S3 buckets (site, photos) | Kept | Deleted | cents or less |
| Cognito pool, groups, users | Kept | Deleted | $0 at this scale |
| Lambda functions and layer | Kept | Deleted | $0 |
| API Gateway (HTTP API) | Kept | Deleted | $0 while unused |
| EventBridge rule | Kept, but it may not fire while the lab is stopped (not verified) | Deleted | cents or less |
| SES verified identities | Kept | Deleted | $0 |
| CloudWatch logs | Kept | Deleted | cents or less |
| Console login, CLI keys | Expire; Start Lab gives new ones | n/a | $0 |
| CloudShell files | Treat as temporary (scripts live in the repo) | Lost | $0 |
| Credits already spent | Stay spent | n/a | n/a |

Rule of thumb: everything in AWS survives a session end but not a Reset or the end date your instructor set. Start the lab before any demo, because the app may not answer while the session is stopped.

## Estimated idle cost
Well under $0.10 per month: tiny DynamoDB and S3 storage, CloudWatch log storage, and the 5-minute sweeper (about 8,600 small invocations a month). Check the real number in the Learner Lab header.

## Pause between demos (optional)
    aws events disable-rule --name foodbridge-sweeper-5min
    aws events enable-rule  --name foodbridge-sweeper-5min      # before the next demo
Reads already hide expired listings, so pausing only delays the stored EXPIRED status and pickup reminder emails.

## Shorten log retention (optional)
    for g in $(aws logs describe-log-groups --log-group-name-prefix /aws/lambda/foodbridge- --query 'logGroups[].logGroupName' --output text); do aws logs put-retention-policy --log-group-name "$g" --retention-in-days 7; done

## Teardown (only after grading)
1. Preview: `bash backend/scripts/teardown.sh <suffix> <user-pool-id>` (changes nothing).
2. Delete: add `--yes`, then type DELETE when asked.
3. By hand: SES identities, and any SNS topic named foodbridge-alerts.
Rebuild later from docs/aws-resources.md, the scripts in backend/scripts and the Lambda code in this repo.