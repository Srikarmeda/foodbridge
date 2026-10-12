#!/usr/bin/env bash
# FoodBridge Task 5: HTTP API + JWT authorizer + 14 routes + CORS + throttling.
# Run in AWS CloudShell (us-east-1).
# Usage: bash create-api.sh <USER_POOL_ID> <CLIENT_ID>
set -Eeuo pipefail

POOL_ID="${1:?Usage: bash create-api.sh <USER_POOL_ID> <CLIENT_ID>}"
CLIENT_ID="${2:?Usage: bash create-api.sh <USER_POOL_ID> <CLIENT_ID>}"
REGION="us-east-1"
API_NAME="foodbridge-api"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"

EXISTING="$(aws apigatewayv2 get-apis --region "$REGION" \
  --query "Items[?Name=='$API_NAME'].ApiId" --output text)"
if [ -n "$EXISTING" ] && [ "$EXISTING" != "None" ]; then
  echo "An API named $API_NAME already exists ($EXISTING). Delete it first (see Troubleshooting)."
  exit 1
fi

# If anything fails below, remove the half-built API so you can simply re-run.
trap 'echo "FAILED. Removing partial API..."; [ -n "${API_ID:-}" ] && aws apigatewayv2 delete-api --region "$REGION" --api-id "$API_ID" || true' ERR

echo "1/6 Creating API with CORS..."
API_ID="$(aws apigatewayv2 create-api --region "$REGION" --name "$API_NAME" --protocol-type HTTP \
  --cors-configuration '{"AllowOrigins":["*"],"AllowMethods":["GET","POST","DELETE","OPTIONS"],"AllowHeaders":["authorization","content-type"],"MaxAge":3600}' \
  --query ApiId --output text)"

echo "2/6 Creating Cognito JWT authorizer..."
AUTH_ID="$(aws apigatewayv2 create-authorizer --region "$REGION" --api-id "$API_ID" \
  --name cognito-jwt --authorizer-type JWT \
  --identity-source '$request.header.Authorization' \
  --jwt-configuration "Audience=$CLIENT_ID,Issuer=https://cognito-idp.$REGION.amazonaws.com/$POOL_ID" \
  --query AuthorizerId --output text)"

echo "3/6 Creating Lambda integrations and invoke permissions..."
integration() {  # $1 = Lambda function name; prints the integration id
  aws lambda add-permission --region "$REGION" --function-name "$1" \
    --statement-id "apigw-$API_ID" --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:$REGION:$ACCOUNT_ID:$API_ID/*/*" >/dev/null
  aws apigatewayv2 create-integration --region "$REGION" --api-id "$API_ID" \
    --integration-type AWS_PROXY --payload-format-version 2.0 \
    --integration-uri "arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$1" \
    --query IntegrationId --output text
}
I_PROFILE="$(integration foodbridge-profile)"
I_PRESIGN="$(integration foodbridge-presign)"
I_LISTINGS="$(integration foodbridge-listings)"
I_CLAIMS="$(integration foodbridge-claims)"

echo "4/6 Creating 14 secured routes..."
route() {  # $1 = route key, $2 = integration id
  aws apigatewayv2 create-route --region "$REGION" --api-id "$API_ID" --route-key "$1" \
    --target "integrations/$2" --authorization-type JWT --authorizer-id "$AUTH_ID" >/dev/null
  echo "   $1"
}
route "POST /profile"                  "$I_PROFILE"
route "GET /profile"                   "$I_PROFILE"
route "POST /uploads/presign"          "$I_PRESIGN"
route "POST /listings"                 "$I_LISTINGS"
route "GET /listings"                  "$I_LISTINGS"
route "GET /listings/mine"             "$I_LISTINGS"
route "GET /listings/{id}"             "$I_LISTINGS"
route "DELETE /listings/{id}"          "$I_LISTINGS"
route "POST /listings/{id}/claim"      "$I_CLAIMS"
route "GET /claims/mine"               "$I_CLAIMS"
route "GET /claims/incoming"           "$I_CLAIMS"
route "POST /claims/{id}/pickup"       "$I_CLAIMS"
route "POST /claims/{id}/complete"     "$I_CLAIMS"
route "POST /claims/{id}/cancel"       "$I_CLAIMS"

echo "5/6 Creating \$default stage (auto-deploy, throttled)..."
aws apigatewayv2 create-stage --region "$REGION" --api-id "$API_ID" --stage-name '$default' \
  --auto-deploy --default-route-settings '{"ThrottlingBurstLimit":20,"ThrottlingRateLimit":10}' >/dev/null

echo "6/6 Done."
echo
echo "API ID:     $API_ID"
echo "INVOKE URL: https://$API_ID.execute-api.$REGION.amazonaws.com"