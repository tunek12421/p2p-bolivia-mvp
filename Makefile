# Makefile
.PHONY: help dev build test clean migrate seed logs

help:
	@echo "Available commands:"
	@echo "  make dev      - Start development environment"
	@echo "  make build    - Build all Docker images"
	@echo "  make test     - Run tests"
	@echo "  make migrate  - Run database migrations"
	@echo "  make seed     - Seed database with test data"
	@echo "  make logs     - Show logs from all services"
	@echo "  make clean    - Stop and remove all containers"

dev:
	docker compose up -d
	@echo "✅ Services running:"
	@echo "   Gateway:  http://localhost:8080"
	@echo "   Auth:     http://localhost:3001"
	@echo "   P2P:      http://localhost:3002"
	@echo "   Wallet:   http://localhost:3003"
	@echo "   RabbitMQ: http://localhost:15672 (admin/admin)"

build:
	docker compose build --no-cache

test:
	go test ./services/... -v

migrate:
	docker compose exec postgres psql -U p2padmin -d p2p_bolivia -f /docker-entrypoint-initdb.d/001_initial_schema.sql

seed:
	@echo "Seeding database..."
	docker compose exec postgres psql -U p2padmin -d p2p_bolivia -f /docker-entrypoint-initdb.d/002_seed_data.sql

logs:
	docker compose logs -f

logs-auth:
	docker compose logs -f auth

logs-gateway:
	docker compose logs -f gateway

clean:
	docker compose down -v
	rm -rf data/

restart:
	docker compose restart

ps:
	docker compose ps

db-shell:
	docker compose exec postgres psql -U p2padmin -d p2p_bolivia