#!/bin/bash
# test-api.sh

API_URL="http://localhost:8080/api/v1"

echo "🧪 Testing P2P Bolivia API"

# Test health
echo "1. Testing health endpoint..."
curl -s ${API_URL%/api/v1}/health | jq .

# Register a test user
echo -e "\n2. Registering test user..."
REGISTER_RESPONSE=$(curl -s -X POST $API_URL/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "phone": "70000000",
    "password": "Test123456"
  }')

echo $REGISTER_RESPONSE | jq .

# Extract token
ACCESS_TOKEN=$(echo $REGISTER_RESPONSE | jq -r .access_token)
USER_ID=$(echo $REGISTER_RESPONSE | jq -r .user_id)

# Test login
echo -e "\n3. Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST $API_URL/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test@example.com",
    "password": "Test123456"
  }')

echo $LOGIN_RESPONSE | jq .

# Get profile
echo -e "\n4. Getting user profile..."
curl -s $API_URL/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" | jq .

# Update profile
echo -e "\n5. Updating profile..."
curl -s -X PUT $API_URL/profile \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Juan",
    "last_name": "Pérez",
    "city": "La Paz"
  }' | jq .

echo -e "\n✅ API tests completed!"