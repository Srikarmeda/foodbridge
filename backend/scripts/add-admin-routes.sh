#!/usr/bin/env bash
# FoodBridge Task 10: add the impact and admin routes to the existing HTTP API.
# Run in AWS CloudShell (us-east-1).  Usage: bash add-admin-routes.sh
set -Eeuo pipefail

REGION="us-east-1"
API_NAME="foodbridge-api"
FUNC="foodbridge-admin"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

API_ID="$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='$API_NAME'].ApiId | [0]" --output text)"
if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then echo "API $API_NAME not found. Finish Task 5 first."; exit 1; fi

AUTH_ID="$(aws apigatewayv2 get-authorizers --region "$REGION" --api-id "$API_ID" --query "Items[?Name=='cognito-jwt'].AuthorizerId | [0]" --output text)"
if [ -z "$AUTH_ID" ] || [ "$AUTH_ID" = "None" ]; then echo "Authorizer cognito-jwt not found on $API_NAME."; exit 1; fi

if ! aws lambda get-function --region "$REGION" --function-name "$FUNC" >/dev/null 2>&1; then
  echo "Lambda $FUNC not found. Create it first (step 10.1)."; exit 1
fi

echo "1/3 Lambda invoke permission..."
PERM_ERR="$(mktemp)"
if ! aws lambda add-permission --region "$REGION" --function-name "$FUNC" \
     --statement-id "apigw-admin-$API_ID" --action lambda:InvokeFunction \
     --principal apigateway.amazonaws.com \
     --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/*" >/dev/null 2>"$PERM_ERR"; then
  if grep -q ResourceConflictException "$PERM_ERR"; then echo "   already present"; else cat "$PERM_ERR"; exit 1; fi
fi

echo "2/3 Integration..."
URI="arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$FUNC"
INT_ID="$(aws apigatewayv2 get-integrations --region "$REGION" --api-id "$API_ID" --query "Items[?IntegrationUri=='$URI'].IntegrationId | [0]" --output text)"
if [ -z "$INT_ID" ] || [ "$INT_ID" = "None" ]; then
  INT_ID="$(aws apigatewayv2 create-integration --region "$REGION" --api-id "$API_ID" \
    --integration-type AWS_PROXY --payload-format-version 2.0 --integration-uri "$URI" \
    --query IntegrationId --output text)"
  echo "   created"
else
  echo "   already present"
fi

echo "3/3 Routes (secured by the JWT authorizer)..."
EXISTING="$(aws apigatewayv2 get-routes --region "$REGION" --api-id "$API_ID" --query "Items[].RouteKey" --output text | tr '\t' '\n')"
route() {
  if printf '%s\n' "$EXISTING" | grep -qxF "$1"; then echo "   exists: $1"; return; fi
  aws apigatewayv2 create-route --region "$REGION" --api-id "$API_ID" --route-key "$1" \
    --target "integrations/$INT_ID" --authorization-type JWT --authorizer-id "$AUTH_ID" >/dev/null
  echo "   added:  $1"
}
route "GET /stats"
route "GET /leaderboard"
route "GET /admin/users"
route "GET /admin/listings"
route "DELETE /admin/listings/{id}"

TOTAL="$(aws apigatewayv2 get-routes --region "$REGION" --api-id "$API_ID" --query "length(Items)" --output text)"
echo
echo "Done. $API_NAME now has $TOTAL routes (expected 19)."