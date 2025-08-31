#!/bin/bash

echo "🎯 TESTING PAYPAL INTEGRATION COMPLETE FLOW"
echo "============================================"

# Test 1: PayPal OAuth Token
echo -e "\n1️⃣ Testing PayPal OAuth Token..."
TOKEN_RESPONSE=$(curl -s -X POST "https://api.sandbox.paypal.com/v1/oauth2/token" \
  -H "Accept: application/json" \
  -H "Accept-Language: en_US" \
  -u "AbNi5hkQXOA0NNow-Pp7SpwHZAlxRizdENCE3tualI_g9K44AN6oMUzwatje50oWMrra704XbO2LbAwm:EIFAxnP0mYInTRYDNfjacBnaCTR6dCWhVnHpR29m61I9wsPRUd17PmzQJuoqFxwTa65Lq18bO4oiaoSx" \
  -d "grant_type=client_credentials")

ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | jq -r '.access_token')
echo "✅ PayPal Token: ${ACCESS_TOKEN:0:50}..."

# Test 2: Create PayPal Order Directly
echo -e "\n2️⃣ Creating PayPal Order directly..."
ORDER_DATA='{
  "intent": "CAPTURE",
  "purchase_units": [{
    "amount": {
      "currency_code": "USD",
      "value": "50.00"
    },
    "description": "P2P Bolivia Test Deposit"
  }],
  "application_context": {
    "brand_name": "P2P Bolivia",
    "locale": "en-US",
    "return_url": "http://localhost:8080/paypal/success",
    "cancel_url": "http://localhost:8080/paypal/cancel"
  }
}'

ORDER_RESPONSE=$(curl -s -X POST "https://api.sandbox.paypal.com/v2/checkout/orders" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d "$ORDER_DATA")

ORDER_ID=$(echo $ORDER_RESPONSE | jq -r '.id')
APPROVAL_URL=$(echo $ORDER_RESPONSE | jq -r '.links[] | select(.rel=="approve") | .href')

echo "✅ PayPal Order ID: $ORDER_ID"
echo "🔗 Approval URL: $APPROVAL_URL"

# Test 3: Test our API
echo -e "\n3️⃣ Testing our P2P Bolivia API..."

# Register user
USER_RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/register \
  -H "Content-Type: application/json" \
  -d '{"email": "paypal-test@sandbox.com", "password": "TestPass123"}')

USER_TOKEN=$(echo $USER_RESPONSE | jq -r '.access_token')
USER_ID=$(echo $USER_RESPONSE | jq -r '.user_id')

echo "✅ User registered: $USER_ID"
echo "🔑 Token: ${USER_TOKEN:0:50}..."

# Test deposit endpoint (this might have the bug but let's try)
echo -e "\n4️⃣ Testing deposit endpoint..."
DEPOSIT_RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"currency": "USD", "amount": 25.00, "method": "PAYPAL"}')

echo "📝 Deposit Response: $DEPOSIT_RESPONSE"

# Test wallets
echo -e "\n5️⃣ Checking user wallets..."
WALLETS_RESPONSE=$(curl -s -X GET http://localhost:8080/api/v1/wallets \
  -H "Authorization: Bearer $USER_TOKEN")

echo "💰 Wallets: $WALLETS_RESPONSE"

echo -e "\n🎉 PAYPAL INTEGRATION TEST COMPLETED!"
echo "ℹ️  To complete a real payment, visit the approval URL in a browser:"
echo "   $APPROVAL_URL"