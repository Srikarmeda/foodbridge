#!/usr/bin/env bash
# FoodBridge Task 11: restrict the API's CORS to your real site (plus localhost for development).
# Run in AWS CloudShell (us-east-1).  Usage: bash tighten-cors.sh https://dxxxxxxxxxxxx.cloudfront.net
set -Eeuo pipefail

SITE="${1:?Usage: bash tighten-cors.sh https://<your-cloudfront-domain>}"
SITE="${SITE%/}"
if ! [[ "$SITE" =~ ^https?://[A-Za-z0-9.-]+(:[0-9]+)?$ ]]; then
  echo "Give an origin only: scheme + host, no path and no trailing slash."; exit 1
fi
REGION="us-east-1"

API_ID="$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='foodbridge-api'].ApiId | [0]" --output text)"
if [ -z "$API_ID" ] || [ "$API_ID" = "None" ]; then echo "API foodbridge-api not found."; exit 1; fi

CORS="$(printf '{"AllowOrigins":["%s","http://localhost:8080"],"AllowMethods":["GET","POST","DELETE","OPTIONS"],"AllowHeaders":["authorization","content-type"],"MaxAge":3600}' "$SITE")"
aws apigatewayv2 update-api --region "$REGION" --api-id "$API_ID" --cors-configuration "$CORS" >/dev/null

echo "CORS now allows:"
aws apigatewayv2 get-api --region "$REGION" --api-id "$API_ID" --query "CorsConfiguration.AllowOrigins" --output text | tr '\t' '\n' | sed 's/^/  /'