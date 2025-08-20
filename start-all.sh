#!/bin/bash

echo "🚀 Iniciando P2P Bolivia - Plataforma Completa"
echo "=============================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Stop any existing containers
echo -e "${BLUE}📦 Deteniendo contenedores existentes...${NC}"
docker compose down

# Build and start all services
echo -e "${BLUE}🏗️  Construyendo y levantando todos los servicios...${NC}"
docker compose up -d --build

# Wait for database to be ready
echo -e "${BLUE}⏳ Esperando que la base de datos esté lista...${NC}"
sleep 10

# Apply all migrations
echo -e "${BLUE}📊 Aplicando migraciones de base de datos...${NC}"

echo "   → Aplicando migración inicial (Fase 1)..."
docker compose exec -T postgres psql -U p2padmin -d p2p_bolivia < migrations/001_initial_schema.sql > /dev/null 2>&1

echo "   → Aplicando datos de prueba (Fase 2)..."
docker compose exec -T postgres psql -U p2padmin -d p2p_bolivia < migrations/002_seed_data.sql > /dev/null 2>&1

echo "   → Aplicando esquema de Fase 3 (KYC, Disputas, Chat, Analytics)..."
docker compose exec -T postgres psql -U p2padmin -d p2p_bolivia < migrations/003_phase3_schema.sql > /dev/null 2>&1

# Wait for all services to be healthy
echo -e "${BLUE}🔍 Verificando estado de los servicios...${NC}"
sleep 5

# Check service health
echo -e "\n${YELLOW}📋 Estado de los servicios:${NC}"

check_service() {
    local service_name=$1
    local port=$2
    local response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health 2>/dev/null)
    if [ "$response" = "200" ]; then
        echo -e "   ${GREEN}✅ $service_name (puerto $port)${NC}"
    else
        echo -e "   ❌ $service_name (puerto $port) - HTTP $response"
    fi
}

# Core services
check_service "Auth Service" 3001
check_service "P2P Engine" 3002
check_service "Wallet Service" 3003
check_service "Bank Listener" 3004

# Phase 3 services
check_service "KYC Service" 3005
check_service "Dispute Service" 3006
check_service "Chat Service" 3007
check_service "Analytics Service" 3008

# Check MinIO
minio_response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9001/ 2>/dev/null)
if [ "$minio_response" = "200" ] || [ "$minio_response" = "307" ]; then
    echo -e "   ${GREEN}✅ MinIO Storage (puerto 9001)${NC}"
else
    echo -e "   ❌ MinIO Storage (puerto 9001) - HTTP $minio_response"
fi

echo -e "\n${GREEN}🎉 ¡P2P Bolivia está listo!${NC}"
echo -e "\n${BLUE}📱 URLs de acceso:${NC}"
echo "   🌐 Frontend Web: http://localhost:3000"
echo "   🔐 Gateway API: http://localhost:8080"
echo "   📊 RabbitMQ Admin: http://localhost:15672 (admin/admin)"
echo "   📁 MinIO Console: http://localhost:9001 (minioadmin/minioadmin)"
echo ""
echo -e "${BLUE}🔧 APIs de servicios:${NC}"
echo "   Auth: http://localhost:3001"
echo "   P2P: http://localhost:3002"
echo "   Wallet: http://localhost:3003"
echo "   Bank Listener: http://localhost:3004"
echo "   KYC: http://localhost:3005"
echo "   Disputes: http://localhost:3006"
echo "   Chat: http://localhost:3007"
echo "   Analytics: http://localhost:3008"
echo ""
echo -e "${YELLOW}💡 Para probar la API completa, ejecuta: ./test-complete.sh${NC}"
echo -e "${YELLOW}💡 Para ver logs: docker compose logs -f [service-name]${NC}"
echo -e "${YELLOW}💡 Para detener: docker compose down${NC}"