#!/bin/bash

echo "🔧 Testing PayPal Integration..."

# Load environment variables
source .env

# Test PayPal OAuth
echo "1. Testing PayPal OAuth token..."
curl -X POST "https://api.sandbox.paypal.com/v1/oauth2/token" \
  -H "Accept: application/json" \
  -H "Accept-Language: en_US" \
  -u "${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}" \
  -d "grant_type=client_credentials"

echo -e "\n\n2. Testing deposit endpoint..."
# Register and login first
RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@paypal.com",
    "password": "password123"
  }')

echo "Register response: $RESPONSE"

TOKEN=$(echo $RESPONSE | jq -r '.access_token')
echo "Token: $TOKEN"

# Test deposit
echo "3. Testing PayPal deposit..."
curl -X POST http://localhost:8080/api/v1/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "currency": "USD",
    "amount": 50.00,
    "method": "PAYPAL"
  }' | jq .

echo -e "\n✅ PayPal integration test completed!"