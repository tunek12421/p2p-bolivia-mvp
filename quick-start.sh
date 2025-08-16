#!/bin/bash
# quick-start.sh

echo "🚀 Starting P2P Bolivia MVP - Phase 1"

# Check requirements
command -v docker >/dev/null 2>&1 || { echo "❌ Docker is required"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "❌ Docker Compose is required"; exit 1; }

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << 'EOF'
DB_HOST=postgres
DB_PORT=5432
DB_USER=p2padmin
DB_PASSWORD=p2psecure123
DB_NAME=p2p_bolivia
REDIS_HOST=redis
REDIS_PORT=6379
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=168h
EOF
fi

# Build images
echo "Building Docker images..."
docker compose build

# Start services
echo "Starting services..."
docker compose up -d

# Wait for PostgreSQL
echo "Waiting for PostgreSQL to be ready..."
sleep 10

# Run migrations
echo "Running database migrations..."
docker compose exec -T postgres psql -U p2padmin -d p2p_bolivia < migrations/001_initial_schema.sql

echo "✅ P2P Bolivia MVP is running!"
echo ""
echo "Services:"
echo "  Gateway:  http://localhost:8080"
echo "  Auth:     http://localhost:3001"
echo "  P2P:      http://localhost:3002"
echo "  Wallet:   http://localhost:3003"
echo "  RabbitMQ: http://localhost:15672 (admin/admin)"
echo ""
echo "Test the API:"
echo "  curl http://localhost:8080/health"
echo ""
echo "View logs:"
echo "  docker-compose logs -f"