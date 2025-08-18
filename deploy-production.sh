#!/bin/bash
# ==========================================
# SCRIPT DE DEPLOYMENT PARA PRODUCCIÓN
# P2P Bolivia - Automated Deployment
# ==========================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"
BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"

# Banner
echo "
 ██████╗ ██████╗ ██████╗     ██████╗  ██████╗ ██╗     ██╗██╗   ██╗██╗ █████╗ 
██╔══██╗╚════██╗██╔══██╗    ██╔══██╗██╔═══██╗██║     ██║██║   ██║██║██╔══██╗
██████╔╝ █████╔╝██████╔╝    ██████╔╝██║   ██║██║     ██║██║   ██║██║███████║
██╔═══╝ ██╔═══╝ ██╔═══╝     ██╔══██╗██║   ██║██║     ██║╚██╗ ██╔╝██║██╔══██║
██║     ███████╗██║         ██████╔╝╚██████╔╝███████╗██║ ╚████╔╝ ██║██║  ██║
╚═╝     ╚══════╝╚═╝         ╚═════╝  ╚═════╝ ╚══════╝╚═╝  ╚═══╝  ╚═╝╚═╝  ╚═╝
                                                                            
🚀 Production Deployment Script v1.0
"

# Check prerequisites
log_info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    log_error "Docker Compose is not installed"
    exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
    log_error "Production compose file not found: $COMPOSE_FILE"
    exit 1
fi

log_success "Prerequisites check passed"

# Create environment file if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
    log_info "Creating production environment file..."
    cat > "$ENV_FILE" << EOF
# P2P Bolivia Production Environment

# JWT Configuration
JWT_SECRET=$(openssl rand -base64 32)

# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_USER=p2p_user
DB_PASSWORD=$(openssl rand -base64 16)
DB_NAME=p2p_bolivia

# Redis Configuration
REDIS_ADDR=redis:6379
REDIS_PASSWORD=

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8080

# Security
NGINX_RATE_LIMIT=10r/s
ENABLE_SSL=false

# Monitoring
ENABLE_HEALTH_CHECKS=true
LOG_LEVEL=info
EOF
    log_success "Environment file created: $ENV_FILE"
else
    log_info "Using existing environment file: $ENV_FILE"
fi

# Create backup directory
log_info "Creating backup directory..."
mkdir -p "$BACKUP_DIR"

# Backup existing data if services are running
if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
    log_info "Backing up existing data..."
    
    # Backup database
    log_info "Backing up PostgreSQL database..."
    docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U p2p_user p2p_bolivia > "$BACKUP_DIR/database.sql" || log_warning "Database backup failed"
    
    # Backup Redis data
    log_info "Backing up Redis data..."
    docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli BGSAVE || log_warning "Redis backup failed"
    
    log_success "Backup completed: $BACKUP_DIR"
else
    log_info "No running services found, skipping backup"
fi

# Pull latest images
log_info "Pulling latest images..."
docker-compose -f "$COMPOSE_FILE" pull

# Build custom images
log_info "Building application images..."
docker-compose -f "$COMPOSE_FILE" build --no-cache

# Stop existing services
if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
    log_info "Stopping existing services..."
    docker-compose -f "$COMPOSE_FILE" down --remove-orphans
fi

# Start services
log_info "Starting production services..."
docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# Wait for services to be healthy
log_info "Waiting for services to be healthy..."
sleep 30

# Health check
log_info "Performing health checks..."
services=("nginx" "frontend" "gateway" "auth" "p2p" "wallet" "postgres" "redis")
failed_services=()

for service in "${services[@]}"; do
    log_info "Checking $service..."
    if docker-compose -f "$COMPOSE_FILE" ps "$service" | grep -q "Up (healthy)"; then
        log_success "$service is healthy"
    else
        log_error "$service is not healthy"
        failed_services+=("$service")
    fi
done

# Show deployment status
if [ ${#failed_services[@]} -eq 0 ]; then
    log_success "🎉 Deployment completed successfully!"
    echo ""
    log_info "Services Status:"
    docker-compose -f "$COMPOSE_FILE" ps
    echo ""
    log_info "Access URLs:"
    echo "  🌐 Frontend: http://localhost"
    echo "  🔌 API Gateway: http://localhost:8080"
    echo "  📊 Database: postgresql://localhost:5432/p2p_bolivia"
    echo "  🔴 Redis: redis://localhost:6379"
    echo ""
    log_info "Useful Commands:"
    echo "  📋 View logs: docker-compose -f $COMPOSE_FILE logs -f [service]"
    echo "  📊 View status: docker-compose -f $COMPOSE_FILE ps"
    echo "  🛑 Stop services: docker-compose -f $COMPOSE_FILE down"
    echo "  🔄 Restart service: docker-compose -f $COMPOSE_FILE restart [service]"
else
    log_error "⚠️ Deployment completed with errors!"
    log_error "Failed services: ${failed_services[*]}"
    echo ""
    log_info "Troubleshooting:"
    echo "  📋 Check logs: docker-compose -f $COMPOSE_FILE logs [service]"
    echo "  🔍 Check status: docker-compose -f $COMPOSE_FILE ps"
    echo "  🚀 Restart: docker-compose -f $COMPOSE_FILE restart [service]"
    exit 1
fi

# Show performance metrics
log_info "Performance Metrics:"
echo "  💾 Memory Usage:"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}" | grep p2p-

echo ""
log_info "🔐 Security Reminders:"
echo "  ⚠️  Change default passwords in production"
echo "  🔒 Enable HTTPS/SSL certificates"
echo "  🛡️  Configure firewall rules"
echo "  📝 Set up log monitoring"
echo "  💾 Schedule regular backups"

log_success "Deployment script completed! 🚀"