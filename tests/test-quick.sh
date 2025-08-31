#!/bin/bash

echo "🧪 Quick P2P Test"
echo "================"

TIMESTAMP=$(date +%s%N | cut -c1-16)
EMAIL="quicktest${TIMESTAMP}@test.com"
PHONE="+59111${TIMESTAMP:8:8}"

echo "Creating user: $EMAIL"

# Register user
RESPONSE=$(curl -s -X POST "http://localhost:3001/api/v1/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$EMAIL\",
    \"password\": \"testpass123\",
    \"first_name\": \"Test\",
    \"last_name\": \"User\",
    \"phone\": \"$PHONE\"
  }")

echo "Register response: $RESPONSE"

if echo "$RESPONSE" | jq -e '.access_token' > /dev/null; then
    TOKEN=$(echo "$RESPONSE" | jq -r '.access_token')
    echo "✅ User registered, token: ${TOKEN:0:20}..."
    
    echo ""
    echo "Creating order..."
    ORDER_RESPONSE=$(curl -s -X POST "http://localhost:3002/api/v1/orders" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $TOKEN" \
      -d "{
        \"type\": \"BUY\",
        \"currency_from\": \"BOB\",
        \"currency_to\": \"USD\",
        \"amount\": 100,
        \"rate\": 6.90,
        \"min_amount\": 10,
        \"max_amount\": 1000,
        \"payment_methods\": [\"BANK_TRANSFER\"]
      }")
    
    echo "Order response: $ORDER_RESPONSE"
    
    if echo "$ORDER_RESPONSE" | jq -e '.order' > /dev/null; then
        ORDER_ID=$(echo "$ORDER_RESPONSE" | jq -r '.order.id')
        ORDER_STATUS=$(echo "$ORDER_RESPONSE" | jq -r '.order.status')
        echo "✅ Order created: $ORDER_ID with status: $ORDER_STATUS"
    else
        echo "❌ Order creation failed"
    fi
else
    echo "❌ User registration failed"
fi