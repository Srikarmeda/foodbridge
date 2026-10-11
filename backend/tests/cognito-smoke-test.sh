#!/usr/bin/env bash
# Usage: ./cognito-smoke-test.sh <clientId> <email> <password> <name>
# Signs up a test DONOR, confirms with the emailed code, logs in, prints token claims.
set -euo pipefail

CLIENT_ID="$1"; EMAIL="$2"; PASSWORD="$3"; NAME="$4"
ENDPOINT="https://cognito-idp.us-east-1.amazonaws.com/"
PY="$(command -v python3 || command -v python)"

call() {  # $1 = Cognito action, $2 = JSON body
  curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/x-amz-json-1.1" \
    -H "X-Amz-Target: AWSCognitoIdentityProviderService.$1" \
    -d "$2"
}

echo "== 1. SignUp"
call SignUp "{\"ClientId\":\"$CLIENT_ID\",\"Username\":\"$EMAIL\",\"Password\":\"$PASSWORD\",\"UserAttributes\":[{\"Name\":\"email\",\"Value\":\"$EMAIL\"},{\"Name\":\"name\",\"Value\":\"$NAME\"},{\"Name\":\"custom:requestedRole\",\"Value\":\"DONOR\"}]}"
echo

echo "== 2. Confirm"
read -r -p "Enter the 6-digit emailed code (or press Enter if you confirmed in the console): " CODE
if [ -n "$CODE" ]; then
  call ConfirmSignUp "{\"ClientId\":\"$CLIENT_ID\",\"Username\":\"$EMAIL\",\"ConfirmationCode\":\"$CODE\"}"
  echo
fi

echo "== 3. Login"
RESP=$(call InitiateAuth "{\"AuthFlow\":\"USER_PASSWORD_AUTH\",\"ClientId\":\"$CLIENT_ID\",\"AuthParameters\":{\"USERNAME\":\"$EMAIL\",\"PASSWORD\":\"$PASSWORD\"}}")
ID_TOKEN=$(echo "$RESP" | "$PY" -c "import sys,json; print(json.load(sys.stdin)['AuthenticationResult']['IdToken'])")

echo "== 4. ID token claims (decoded locally)"
echo "$ID_TOKEN" | "$PY" -c "
import sys, json, base64
p = sys.stdin.read().strip().split('.')[1]
p += '=' * (-len(p) % 4)
print(json.dumps(json.loads(base64.urlsafe_b64decode(p)), indent=2))"