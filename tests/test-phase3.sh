#!/bin/bash

# Test Phase 3 Services
echo "🧪 Testing P2P Bolivia Phase 3 Services..."
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test service health endpoints
test_health() {
    local service=$1
    local port=$2
    local name=$3
    
    echo -e "${BLUE}Testing $name service health...${NC}"
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health)
    
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✅ $name service is healthy${NC}"
        return 0
    else
        echo -e "${RED}❌ $name service is not responding (HTTP $response)${NC}"
        return 1
    fi
}

# Get authentication token for testing
get_auth_token() {
    echo -e "${BLUE}Getting authentication token...${NC}"
    
    # Try to login with test user
    token_response=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
        -H "Content-Type: application/json" \
        -d '{
            "email": "admin@p2pbolivia.com",
            "password": "admin123"
        }')
    
    token=$(echo $token_response | grep -o '"token":"[^"]*' | cut -d'"' -f4)
    
    if [ -n "$token" ]; then
        echo -e "${GREEN}✅ Authentication successful${NC}"
        echo "$token"
    else
        echo -e "${RED}❌ Authentication failed${NC}"
        echo ""
    fi
}

# Test KYC service endpoints
test_kyc_service() {
    local token=$1
    echo -e "\n${BLUE}Testing KYC Service endpoints...${NC}"
    
    # Test get KYC levels
    echo "Testing GET /api/v1/kyc/levels..."
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/api/v1/kyc/levels)
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✅ KYC levels endpoint working${NC}"
    else
        echo -e "${RED}❌ KYC levels endpoint failed (HTTP $response)${NC}"
    fi
    
    # Test get KYC requirements
    echo "Testing GET /api/v1/kyc/requirements/1..."
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3005/api/v1/kyc/requirements/1)
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✅ KYC requirements endpoint working${NC}"
    else
        echo -e "${RED}❌ KYC requirements endpoint failed (HTTP $response)${NC}"
    fi
    
    if [ -n "$token" ]; then
        # Test authenticated endpoint
        echo "Testing GET /api/v1/kyc/status (authenticated)..."
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer $token" \
            http://localhost:3005/api/v1/kyc/status)
        if [ "$response" = "200" ] || [ "$response" = "404" ]; then
            echo -e "${GREEN}✅ KYC status endpoint accessible${NC}"
        else
            echo -e "${RED}❌ KYC status endpoint failed (HTTP $response)${NC}"
        fi
    fi
}

# Test Dispute service endpoints
test_dispute_service() {
    local token=$1
    echo -e "\n${BLUE}Testing Dispute Service endpoints...${NC}"
    
    if [ -n "$token" ]; then
        # Test get user disputes
        echo "Testing GET /api/v1/disputes (authenticated)..."
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer $token" \
            http://localhost:3006/api/v1/disputes)
        if [ "$response" = "200" ]; then
            echo -e "${GREEN}✅ Get disputes endpoint working${NC}"
        else
            echo -e "${RED}❌ Get disputes endpoint failed (HTTP $response)${NC}"
        fi
        
        # Test admin endpoint (if user is admin)
        echo "Testing GET /api/v1/disputes/stats (admin)..."
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer $token" \
            http://localhost:3006/api/v1/disputes/stats)
        if [ "$response" = "200" ] || [ "$response" = "403" ]; then
            echo -e "${GREEN}✅ Dispute stats endpoint accessible${NC}"
        else
            echo -e "${RED}❌ Dispute stats endpoint failed (HTTP $response)${NC}"
        fi
    fi
}

# Test Chat service endpoints
test_chat_service() {
    local token=$1
    echo -e "\n${BLUE}Testing Chat Service endpoints...${NC}"
    
    if [ -n "$token" ]; then
        # Test get user rooms
        echo "Testing GET /api/v1/rooms (authenticated)..."
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer $token" \
            http://localhost:3007/api/v1/rooms)
        if [ "$response" = "200" ]; then
            echo -e "${GREEN}✅ Get rooms endpoint working${NC}"
        else
            echo -e "${RED}❌ Get rooms endpoint failed (HTTP $response)${NC}"
        fi
        
        # Test WebSocket endpoint (just check if it responds to HTTP request)
        echo "Testing WebSocket endpoint accessibility..."
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            "http://localhost:3007/api/v1/ws?user_id=test-user")
        if [ "$response" = "400" ] || [ "$response" = "401" ]; then
            echo -e "${GREEN}✅ WebSocket endpoint accessible${NC}"
        else
            echo -e "${YELLOW}⚠️ WebSocket endpoint response: HTTP $response${NC}"
        fi
    fi
}

# Test Analytics service endpoints
test_analytics_service() {
    local token=$1
    echo -e "\n${BLUE}Testing Analytics Service endpoints...${NC}"
    
    if [ -n "$token" ]; then
        # Test overview endpoint
        echo "Testing GET /api/v1/analytics/overview (admin)..."
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer $token" \
            http://localhost:3008/api/v1/analytics/overview)
        if [ "$response" = "200" ] || [ "$response" = "403" ]; then
            echo -e "${GREEN}✅ Analytics overview endpoint accessible${NC}"
        else
            echo -e "${RED}❌ Analytics overview endpoint failed (HTTP $response)${NC}"
        fi
        
        # Test transaction stats
        echo "Testing GET /api/v1/analytics/transactions (admin)..."
        response=$(curl -s -o /dev/null -w "%{http_code}" \
            -H "Authorization: Bearer $token" \
            http://localhost:3008/api/v1/analytics/transactions)
        if [ "$response" = "200" ] || [ "$response" = "403" ]; then
            echo -e "${GREEN}✅ Analytics transactions endpoint accessible${NC}"
        else
            echo -e "${RED}❌ Analytics transactions endpoint failed (HTTP $response)${NC}"
        fi
    fi
}

# Test MinIO service
test_minio_service() {
    echo -e "\n${BLUE}Testing MinIO service...${NC}"
    
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9001/minio/health/live)
    if [ "$response" = "200" ] || [ "$response" = "403" ]; then
        echo -e "${GREEN}✅ MinIO service is accessible${NC}"
    else
        echo -e "${YELLOW}⚠️ MinIO health check response: HTTP $response${NC}"
    fi
    
    # Check if MinIO console is accessible
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9001/)
    if [ "$response" = "200" ] || [ "$response" = "307" ]; then
        echo -e "${GREEN}✅ MinIO console is accessible at http://localhost:9001${NC}"
    else
        echo -e "${YELLOW}⚠️ MinIO console response: HTTP $response${NC}"
    fi
}

# Main testing flow
main() {
    echo -e "${YELLOW}Starting Phase 3 service tests...${NC}\n"
    
    # Test all service health endpoints
    test_health "kyc-service" 3005 "KYC"
    test_health "dispute-service" 3006 "Dispute"
    test_health "chat-service" 3007 "Chat"
    test_health "analytics-service" 3008 "Analytics"
    
    # Test MinIO
    test_minio_service
    
    # Get authentication token
    echo ""
    auth_token=$(get_auth_token)
    
    # Test individual services
    test_kyc_service "$auth_token"
    test_dispute_service "$auth_token"
    test_chat_service "$auth_token"
    test_analytics_service "$auth_token"
    
    echo -e "\n${YELLOW}Phase 3 testing completed!${NC}"
    echo -e "\n${BLUE}Service URLs:${NC}"
    echo -e "KYC Service: http://localhost:3005"
    echo -e "Dispute Service: http://localhost:3006"
    echo -e "Chat Service: http://localhost:3007"
    echo -e "Analytics Service: http://localhost:3008"
    echo -e "MinIO Console: http://localhost:9001 (minioadmin/minioadmin)"
    echo -e "\n${BLUE}To run Phase 3 services:${NC}"
    echo -e "docker-compose -f docker-compose.yml -f docker-compose.phase3.yml up -d"
}

main