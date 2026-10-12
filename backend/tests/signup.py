#!/usr/bin/env python3
"""Sign up a FoodBridge test user.
Usage: python backend/tests/signup.py <clientId> <email> <password> <name> <DONOR|RECEIVER>
Then confirm the user: Cognito console > Users > the user > Actions > Confirm account.
"""
import json
import sys
import urllib.error
import urllib.request

if len(sys.argv) != 6:
    sys.exit(__doc__)
client_id, email, password, name, role = sys.argv[1:]
if role not in ("DONOR", "RECEIVER"):
    sys.exit("role must be DONOR or RECEIVER")

payload = {
    "ClientId": client_id,
    "Username": email,
    "Password": password,
    "UserAttributes": [
        {"Name": "email", "Value": email},
        {"Name": "name", "Value": name},
        {"Name": "custom:requestedRole", "Value": role},
    ],
}
req = urllib.request.Request(
    "https://cognito-idp.us-east-1.amazonaws.com/",
    data=json.dumps(payload).encode(),
    headers={
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.SignUp",
    },
)
try:
    with urllib.request.urlopen(req, timeout=30) as r:
        print("Signed up:", r.read().decode())
        print("Next: confirm the user in the Cognito console (Actions > Confirm account).")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print("Cognito error:", body)
    if "UsernameExistsException" in body:
        print("This email already exists. That is fine if it is confirmed and has the right role.")