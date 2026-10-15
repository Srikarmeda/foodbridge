#!/usr/bin/env bash
# FoodBridge Task 12: remove every FoodBridge resource. DRY RUN unless you pass --yes.
# Run in AWS CloudShell (us-east-1).
#   Preview:  bash teardown.sh <SUFFIX> <USER_POOL_ID>
#   Delete:   bash teardown.sh <SUFFIX> <USER_POOL_ID> --yes
# It never touches LabRole, SES identities or anything not named foodbridge-*.
set -uo pipefail   # no -e on purpose: keep going if one resource is already gone

SUFFIX="${1:?Usage: bash teardown.sh <SUFFIX> <USER_POOL_ID> [--yes]}"
POOL_ID="${2:?Usage: bash teardown.sh <SUFFIX> <USER_POOL_ID> [--yes]}"
MODE="${3:-}"
export AWS_DEFAULT_REGION="us-east-1"

if ! [[ "$POOL_ID" =~ ^us-east-1_[A-Za-z0-9]+$ ]]; then echo "USER_POOL_ID should look like us-east-1_AbCdEfGhI"; exit 1; fi
DRY=1
[ "$MODE" = "--yes" ] && DRY=0

WEB="foodbridge-web-$SUFFIX"
IMG="foodbridge-images-$SUFFIX"
FUNCS=(foodbridge-profile foodbridge-presign foodbridge-listings foodbridge-claims foodbridge-sweeper foodbridge-admin)
TABLES=(foodbridge-users foodbridge-listings foodbridge-claims)
RULE="foodbridge-sweeper-5min"

if [ "$DRY" -eq 1 ]; then
  echo "DRY RUN: nothing will be deleted. Add --yes to delete for real."
else
  read -r -p "This PERMANENTLY deletes all FoodBridge resources and data. Type DELETE to continue: " ANS
  [ "$ANS" = "DELETE" ] || { echo "Cancelled."; exit 1; }
fi

do_it() {  # do_it "description" command args...
  local desc="$1"; shift
  if [ "$DRY" -eq 1 ]; then echo "  [dry-run] $desc"; return 0; fi
  if "$@" >/dev/null 2>&1; then echo "  deleted: $desc"; else echo "  skipped (already gone or not permitted): $desc"; fi
}

echo "1/8 EventBridge schedule"
TARGETS="$(aws events list-targets-by-rule --rule "$RULE" --query 'Targets[].Id' --output text 2>/dev/null || true)"
if [ -n "$TARGETS" ] && [ "$TARGETS" != "None" ]; then
  # shellcheck disable=SC2086  # intentional word splitting: one id per target
  do_it "targets of $RULE" aws events remove-targets --rule "$RULE" --ids $TARGETS
fi
do_it "rule $RULE" aws events delete-rule --name "$RULE"

echo "2/8 API Gateway"
API_IDS="$(aws apigatewayv2 get-apis --query "Items[?Name=='foodbridge-api'].ApiId" --output text 2>/dev/null || true)"
if [ -z "$API_IDS" ] || [ "$API_IDS" = "None" ]; then echo "  none found"; else
  for id in $API_IDS; do do_it "API $id" aws apigatewayv2 delete-api --api-id "$id"; done
fi

echo "3/8 Lambda functions"
for f in "${FUNCS[@]}"; do do_it "function $f" aws lambda delete-function --function-name "$f"; done

echo "4/8 Lambda layer versions"
VERS="$(aws lambda list-layer-versions --layer-name foodbridge-common --query 'LayerVersions[].Version' --output text 2>/dev/null || true)"
if [ -z "$VERS" ] || [ "$VERS" = "None" ]; then echo "  none found"; else
  for v in $VERS; do do_it "layer foodbridge-common version $v" aws lambda delete-layer-version --layer-name foodbridge-common --version-number "$v"; done
fi

echo "5/8 DynamoDB tables"
for t in "${TABLES[@]}"; do do_it "table $t" aws dynamodb delete-table --table-name "$t"; done

echo "6/8 S3 buckets (objects first)"
for b in "$WEB" "$IMG"; do
  do_it "objects in $b" aws s3 rm "s3://$b" --recursive
  do_it "bucket $b" aws s3api delete-bucket --bucket "$b"
done

echo "7/8 Cognito user pool"
do_it "deletion protection off for $POOL_ID" aws cognito-idp update-user-pool --user-pool-id "$POOL_ID" --deletion-protection INACTIVE
do_it "user pool $POOL_ID" aws cognito-idp delete-user-pool --user-pool-id "$POOL_ID"

echo "8/8 CloudWatch log groups"
LOG_GROUPS="$(aws logs describe-log-groups --log-group-name-prefix /aws/lambda/foodbridge- --query 'logGroups[].logGroupName' --output text 2>/dev/null || true)"
if [ -z "$LOG_GROUPS" ] || [ "$LOG_GROUPS" = "None" ]; then echo "  none found"; else
  for g in $LOG_GROUPS; do do_it "log group $g" aws logs delete-log-group --log-group-name "$g"; done
fi

echo
if [ "$DRY" -eq 1 ]; then echo "Dry run finished. Nothing was deleted."; else
  echo "Done. Still to do by hand: SES verified identities, and any SNS topic named foodbridge-alerts."; fi