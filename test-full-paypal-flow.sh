#!/bin/bash

echo "🎯 COMPLETE PAYPAL INTEGRATION TEST"
echo "=================================="
echo ""

# Step 1: Create new order
echo "1️⃣ Creating new PayPal order..."
USER_RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/register \
  -H "Content-Type: application/json" \
  -d '{"email": "paypal-flow-test@sandbox.com", "password": "TestPass123"}')

TOKEN=$(echo $USER_RESPONSE | jq -r '.access_token')
USER_ID=$(echo $USER_RESPONSE | jq -r '.user_id')

echo "✅ User ID: $USER_ID"
echo "🔑 Token: ${TOKEN:0:50}..."

# Step 2: Create deposit
DEPOSIT_RESPONSE=$(curl -s -X POST http://localhost:8080/api/v1/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"currency": "USD", "amount": 15.00, "method": "PAYPAL"}')

echo ""
echo "2️⃣ PayPal Order Created:"
echo $DEPOSIT_RESPONSE | jq .

APPROVAL_URL=$(echo $DEPOSIT_RESPONSE | jq -r '.approval_url')
TX_ID=$(echo $DEPOSIT_RESPONSE | jq -r '.transaction_id')
PAYPAL_ID=$(echo $DEPOSIT_RESPONSE | jq -r '.paypal_id')

echo ""
echo "🔗 APPROVAL URL: $APPROVAL_URL"
echo "📋 Transaction ID: $TX_ID"
echo "🏦 PayPal Order ID: $PAYPAL_ID"
echo ""

# Step 3: Instructions for manual testing
echo "3️⃣ MANUAL TESTING STEPS:"
echo "========================"
echo ""
echo "A. Open this URL in browser:"
echo "   $APPROVAL_URL"
echo ""
echo "B. Login with sandbox credentials:"
echo "   📧 Email: sb-frwav45459963@personal.example.com"
echo "   🔒 Password: l@U9EU/P"
echo ""
echo "C. Complete the payment (click 'Pay Now')"
echo ""
echo "D. Check if funds were credited:"
echo "   curl -X GET http://localhost:8080/api/v1/wallets \\"
echo "     -H \"Authorization: Bearer $TOKEN\""
echo ""
echo "E. Check transaction status:"
echo "   curl -X GET http://localhost:8080/api/v1/transactions/$TX_ID \\"
echo "     -H \"Authorization: Bearer $TOKEN\""
echo ""

# Step 4: Show current wallet status
echo "4️⃣ CURRENT WALLET STATUS:"
echo "========================="
WALLETS=$(curl -s -X GET http://localhost:8080/api/v1/wallets \
  -H "Authorization: Bearer $TOKEN")
echo $WALLETS | jq .

echo ""
echo "🎉 INTEGRATION TEST READY!"
echo "Now complete the payment manually and check results."