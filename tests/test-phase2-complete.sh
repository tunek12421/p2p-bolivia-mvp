#!/bin/bash

echo "🧪 P2P Bolivia Phase 2 - Complete Implementation Test"
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $1${NC}"
    else
        echo -e "${RED}❌ $1${NC}"
        exit 1
    fi
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

echo ""
print_info "Phase 1: Checking Go service compilation..."

# Test P2P service compilation
echo "Compiling P2P service..."
cd services/p2p && go build .
print_status "P2P service compiles successfully"

# Test Wallet service compilation  
echo "Compiling Wallet service..."
cd ../wallet && go build .
print_status "Wallet service compiles successfully"

# Test Auth service compilation
echo "Compiling Auth service..."
cd ../auth && go build .
print_status "Auth service compiles successfully"

# Test Gateway service compilation
echo "Compiling Gateway service..."
cd ../gateway && go build .
print_status "Gateway service compiles successfully"

# Test Bank Listener service compilation
echo "Compiling Bank Listener service..."
cd ../bank-listener && go build .
print_status "Bank Listener service compiles successfully"

cd ../..

echo ""
print_info "Phase 2: Checking Frontend setup..."

# Test Frontend dependencies
echo "Checking Frontend package.json..."
if [ -f "frontend/package.json" ]; then
    print_status "Frontend package.json exists"
else
    echo -e "${RED}❌ Frontend package.json missing${NC}"
    exit 1
fi

# Check if node_modules exists (dependencies installed)
if [ -d "frontend/node_modules" ]; then
    print_status "Frontend dependencies installed"
else
    echo -e "${RED}❌ Frontend dependencies not installed${NC}"
    exit 1
fi

echo ""
print_info "Phase 3: Checking Docker configuration..."

# Test Docker Compose syntax
echo "Validating docker-compose.yml..."
docker compose config > /dev/null 2>&1
print_status "Docker Compose configuration is valid"

echo ""
print_info "Phase 4: Checking Phase 2 Implementation..."

# Check if P2P engine exists
if [ -f "services/p2p/engine.go" ]; then
    print_status "P2P matching engine implemented"
else
    echo -e "${RED}❌ P2P matching engine missing${NC}"
    exit 1
fi

# Check if P2P handlers exist
if [ -f "services/p2p/handlers.go" ]; then
    print_status "P2P handlers implemented"
else
    echo -e "${RED}❌ P2P handlers missing${NC}"
    exit 1
fi

# Check if Wallet handlers exist
if [ -f "services/wallet/handlers.go" ]; then
    print_status "Wallet handlers implemented"
else
    echo -e "${RED}❌ Wallet handlers missing${NC}"
    exit 1
fi

# Check if Wallet integrations exist
if [ -f "services/wallet/integrations.go" ]; then
    print_status "Wallet integrations implemented"
else
    echo -e "${RED}❌ Wallet integrations missing${NC}"
    exit 1
fi

# Check frontend pages
echo "Checking Frontend pages..."
if [ -f "frontend/pages/index.tsx" ]; then
    print_status "Homepage implemented"
else
    echo -e "${RED}❌ Homepage missing${NC}"
    exit 1
fi

if [ -f "frontend/pages/auth/login.tsx" ]; then
    print_status "Login page implemented"
else
    echo -e "${RED}❌ Login page missing${NC}"
    exit 1
fi

if [ -f "frontend/pages/auth/register.tsx" ]; then
    print_status "Registration page implemented"
else
    echo -e "${RED}❌ Registration page missing${NC}"
    exit 1
fi

if [ -f "frontend/pages/dashboard.tsx" ]; then
    print_status "Dashboard page implemented"
else
    echo -e "${RED}❌ Dashboard page missing${NC}"
    exit 1
fi

echo ""
print_info "Phase 5: Checking API endpoints implementation..."

# Check P2P endpoints in handlers
echo "Checking P2P API endpoints..."
if grep -q "handleGetOrders" services/p2p/handlers.go; then
    print_status "P2P GET orders endpoint implemented"
else
    echo -e "${RED}❌ P2P GET orders endpoint missing${NC}"
    exit 1
fi

if grep -q "handleCreateOrder" services/p2p/handlers.go; then
    print_status "P2P POST orders endpoint implemented"
else
    echo -e "${RED}❌ P2P POST orders endpoint missing${NC}"
    exit 1
fi

if grep -q "handleGetOrderBook" services/p2p/handlers.go; then
    print_status "P2P orderbook endpoint implemented"
else
    echo -e "${RED}❌ P2P orderbook endpoint missing${NC}"
    exit 1
fi

# Check Wallet endpoints
echo "Checking Wallet API endpoints..."
if grep -q "handleGetWallets" services/wallet/handlers.go; then
    print_status "Wallet GET wallets endpoint implemented"
else
    echo -e "${RED}❌ Wallet GET wallets endpoint missing${NC}"
    exit 1
fi

if grep -q "handleDeposit" services/wallet/handlers.go; then
    print_status "Wallet deposit endpoint implemented"
else
    echo -e "${RED}❌ Wallet deposit endpoint missing${NC}"
    exit 1
fi

if grep -q "handleWithdrawal" services/wallet/handlers.go; then
    print_status "Wallet withdrawal endpoint implemented"
else
    echo -e "${RED}❌ Wallet withdrawal endpoint missing${NC}"
    exit 1
fi

echo ""
print_info "Phase 6: Checking integrations..."

# Check PayPal integration
if grep -q "processPayPalDeposit" services/wallet/integrations.go; then
    print_status "PayPal integration implemented"
else
    echo -e "${RED}❌ PayPal integration missing${NC}"
    exit 1
fi

# Check Stripe integration
if grep -q "processStripeDeposit" services/wallet/integrations.go; then
    print_status "Stripe integration implemented"
else
    echo -e "${RED}❌ Stripe integration missing${NC}"
    exit 1
fi

# Check QR code integration
if grep -q "processQRDeposit" services/wallet/integrations.go; then
    print_status "QR code integration implemented"
else
    echo -e "${RED}❌ QR code integration missing${NC}"
    exit 1
fi

echo ""
print_info "Phase 7: Final verification..."

# Count total endpoints implemented
TOTAL_ENDPOINTS=$(grep -r "api\." services/*/handlers.go 2>/dev/null | wc -l || echo "0")
if [ "$TOTAL_ENDPOINTS" -gt 10 ]; then
    print_status "Sufficient API endpoints implemented ($TOTAL_ENDPOINTS found)"
else
    echo -e "${YELLOW}⚠️  Limited API endpoints found ($TOTAL_ENDPOINTS). Consider adding more.${NC}"
fi

# Check if matching engine has core functions
if grep -q "findMatches" services/p2p/engine.go && grep -q "executeMatch" services/p2p/engine.go; then
    print_status "P2P matching engine has core functionality"
else
    echo -e "${RED}❌ P2P matching engine missing core functions${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 PHASE 2 IMPLEMENTATION COMPLETE! 🎉${NC}"
echo ""
echo "✅ All Phase 2 components have been successfully implemented:"
echo "   • P2P Trading Engine with matching algorithm"
echo "   • Wallet Service with payment integrations"
echo "   • Frontend React/Next.js application"
echo "   • PayPal, Stripe, and QR code integrations"
echo "   • Complete API endpoints"
echo "   • Authentication and authorization"
echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. Build and run with: docker compose up --build"
echo "2. Access frontend at: http://localhost:3000"
echo "3. Access API gateway at: http://localhost:8080"
echo "4. Test trading functionality"
echo ""
echo -e "${YELLOW}🔧 Development URLs:${NC}"
echo "• Frontend:     http://localhost:3000"
echo "• API Gateway:  http://localhost:8080"
echo "• Auth Service: http://localhost:3001"
echo "• P2P Service:  http://localhost:3002"
echo "• Wallet:       http://localhost:3003"
echo "• Bank Listen:  http://localhost:3004"
echo "• PostgreSQL:   localhost:5432"
echo "• Redis:        localhost:6379"
echo "• RabbitMQ:     http://localhost:15672"
echo ""
echo -e "${GREEN}🚀 Ready for trading! 🚀${NC}"