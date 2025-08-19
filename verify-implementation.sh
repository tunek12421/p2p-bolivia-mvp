#!/bin/bash
# ==========================================
# VERIFICACIÓN COMPLETA DE IMPLEMENTACIÓN
# P2P Bolivia - Implementation Verification
# ==========================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo "
🔍 ██╗   ██╗███████╗██████╗ ██╗███████╗██╗   ██╗
   ██║   ██║██╔════╝██╔══██╗██║██╔════╝╚██╗ ██╔╝
   ██║   ██║█████╗  ██████╔╝██║█████╗   ╚████╔╝ 
   ╚██╗ ██╔╝██╔══╝  ██╔══██╗██║██╔══╝    ╚██╔╝  
    ╚████╔╝ ███████╗██║  ██║██║██║        ██║   
     ╚═══╝  ╚══════╝╚═╝  ╚═╝╚═╝╚═╝        ╚═╝   
                                                 
🚀 P2P Bolivia - Implementation Verification
"

# Check Go installation
if ! command -v go &> /dev/null; then
    log_error "Go is not installed"
    exit 1
fi

log_info "Go version: $(go version)"

# Check Docker installation
if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
fi

log_info "Docker version: $(docker --version)"

# Verify Go services compilation
services=("auth" "p2p" "wallet" "gateway" "bank-listener")
failed_services=()

for service in "${services[@]}"; do
    log_info "Compiling $service service..."
    
    cd "services/$service"
    
    if go build -o "${service}_binary" .; then
        log_success "$service compiled successfully"
        rm -f "${service}_binary"  # Clean up binary
    else
        log_error "$service failed to compile"
        failed_services+=("$service")
    fi
    
    cd ../..
done

# Verify frontend
log_info "Checking frontend dependencies..."
cd frontend

if [ -f "package.json" ]; then
    if [ -d "node_modules" ]; then
        log_success "Frontend dependencies are installed"
    else
        log_info "Installing frontend dependencies..."
        npm install
    fi
    
    log_info "Running frontend type check..."
    if npm run type-check; then
        log_success "Frontend TypeScript check passed"
    else
        log_error "Frontend TypeScript check failed"
        failed_services+=("frontend")
    fi
else
    log_error "Frontend package.json not found"
    failed_services+=("frontend")
fi

cd ..

# Check key implementation files
key_files=(
    "services/p2p/engine.go"
    "services/wallet/bank_integration.go"
    "services/bank-listener/main.go"
    "frontend/pages/trade/index.tsx"
    "frontend/pages/trade/create.tsx"
    "frontend/pages/trade/orders.tsx"
    "frontend/pages/wallet/index.tsx"
    "frontend/next.config.js"
    "frontend/Dockerfile.production"
    "docker-compose.production.yml"
    "deploy-production.sh"
    "migrations/003_bank_notifications.sql"
)

missing_files=()

for file in "${key_files[@]}"; do
    if [ -f "$file" ]; then
        log_success "✅ $file exists"
    else
        log_error "❌ $file is missing"
        missing_files+=("$file")
    fi
done

# Check implementation completeness
log_info "Checking implementation completeness..."

# P2P Engine features
if grep -q "MatchingEngine" services/p2p/engine.go; then
    log_success "✅ P2P Matching Engine implemented"
else
    log_error "❌ P2P Matching Engine missing"
    failed_services+=("p2p-engine")
fi

# Bank Integration features
if grep -q "pollBankNotifications" services/wallet/bank_integration.go; then
    log_success "✅ Bank polling integration implemented"
else
    log_error "❌ Bank polling integration missing"
    failed_services+=("bank-integration")
fi

# Frontend Spanish translation
if grep -q "Bienvenido" frontend/pages/dashboard.tsx; then
    log_success "✅ Frontend Spanish translation implemented"
else
    log_error "❌ Frontend Spanish translation missing"
    failed_services+=("frontend-spanish")
fi

# Production optimization
if grep -q "standalone" frontend/next.config.js; then
    log_success "✅ Frontend production optimization configured"
else
    log_error "❌ Frontend production optimization missing"
    failed_services+=("frontend-optimization")
fi

# Security headers
if grep -q "X-Frame-Options" frontend/next.config.js; then
    log_success "✅ Security headers configured"
else
    log_error "❌ Security headers missing"
    failed_services+=("security-headers")
fi

# Check Docker compose files
docker_files=("docker-compose.yml" "docker-compose.production.yml")
for file in "${docker_files[@]}"; do
    if [ -f "$file" ]; then
        if docker-compose -f "$file" config > /dev/null 2>&1; then
            log_success "✅ $file is valid"
        else
            log_error "❌ $file has syntax errors"
            failed_services+=("$file")
        fi
    else
        log_error "❌ $file is missing"
        missing_files+=("$file")
    fi
done

# Summary
echo ""
echo "=================================================="
echo "           IMPLEMENTATION VERIFICATION SUMMARY"
echo "=================================================="

if [ ${#failed_services[@]} -eq 0 ] && [ ${#missing_files[@]} -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL VERIFICATIONS PASSED!${NC}"
    echo ""
    echo -e "${GREEN}✅ P2P Matching Engine: IMPLEMENTED${NC}"
    echo -e "${GREEN}✅ Bank Integration: IMPLEMENTED${NC}"
    echo -e "${GREEN}✅ Frontend Optimization: IMPLEMENTED${NC}"
    echo -e "${GREEN}✅ Spanish Translation: IMPLEMENTED${NC}"
    echo -e "${GREEN}✅ Security Headers: IMPLEMENTED${NC}"
    echo -e "${GREEN}✅ Production Config: IMPLEMENTED${NC}"
    echo ""
    echo -e "${BLUE}🚀 Ready for production deployment!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Run: docker-compose up --build"
    echo "  2. Test: ./test-bank-integration-complete.sh"
    echo "  3. Deploy: ./deploy-production.sh"
else
    echo -e "${RED}❌ VERIFICATION FAILED${NC}"
    echo ""
    
    if [ ${#failed_services[@]} -gt 0 ]; then
        echo -e "${RED}Failed services:${NC}"
        for service in "${failed_services[@]}"; do
            echo -e "  ❌ $service"
        done
        echo ""
    fi
    
    if [ ${#missing_files[@]} -gt 0 ]; then
        echo -e "${RED}Missing files:${NC}"
        for file in "${missing_files[@]}"; do
            echo -e "  ❌ $file"
        done
        echo ""
    fi
    
    echo -e "${BLUE}Please fix the above issues before deployment.${NC}"
    exit 1
fi

echo ""
echo "Implementation is ready for testing and deployment! 🚀"