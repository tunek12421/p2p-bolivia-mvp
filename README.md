# 🚀 P2P Bolivia - Sistema de Intercambio de Divisas

[![Go](https://img.shields.io/badge/Go-1.21-blue.svg)](https://golang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue.svg)](https://docker.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue.svg)](https://postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-red.svg)](https://redis.io/)

> Sistema P2P completo para intercambio de divisas en Bolivia con motor de matching en tiempo real, gestión de wallets y integración bancaria.

## 🎯 **Descripción**

P2P Bolivia es una plataforma moderna de intercambio de divisas que permite a usuarios comprar y vender USD, BOB y USDT de forma segura y eficiente. El sistema incluye un motor de matching automático, gestión de wallets multi-moneda y sistema de pagos integrado.

## ✨ **Características Principales**

- 🔄 **Motor P2P en tiempo real** - Matching automático de órdenes
- 💰 **Multi-moneda** - Soporte para BOB, USD, USDT
- 🔐 **Autenticación segura** - JWT tokens y 2FA
- 🏦 **Integración bancaria** - Notificaciones automáticas
- 📱 **API REST completa** - Documentada y lista para frontend
- 🐳 **Dockerizado** - Fácil deployment y escalabilidad
- 📊 **Monitoreo** - Redis, RabbitMQ, PostgreSQL

## 🏗️ **Arquitectura**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway   │    │   Auth Service  │
│   (Next.js)     │◄──►│   (Go/Gin)      │◄──►│   (Go/Gin)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                 ▲
                                 ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   P2P Engine    │    │ Wallet Service  │    │ Bank Listener   │
│   (Go/Gin)      │◄──►│   (Go/Gin)      │◄──►│   (Go/Gin)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                       ▲                       ▲
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │     Redis       │    │   RabbitMQ      │
│   (Database)    │    │    (Cache)      │    │   (Queue)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🚀 **Inicio Rápido**

### Prerrequisitos
- Docker & Docker Compose
- Git

### 1. Clonar el repositorio
```bash
git clone <tu-repositorio>
cd airtm
```

### 2. Levantar el sistema
```bash
cd p2p-bolivia-mvp
./quick-start.sh
```

### 3. Verificar que funciona
```bash
cd ..
./test-phase2.sh
```

## 🔧 **Servicios Disponibles**

| Servicio | Puerto | Descripción |
|----------|--------|-------------|
| **Gateway** | 8080 | API Gateway principal |
| **Auth** | 3001 | Autenticación y usuarios |
| **P2P Engine** | 3002 | Motor de matching |
| **Wallet** | 3003 | Gestión de wallets |
| **Bank Listener** | 3004 | Notificaciones bancarias |
| **PostgreSQL** | 5432 | Base de datos |
| **Redis** | 6379 | Cache y sesiones |
| **RabbitMQ** | 15672 | Colas de mensajes |

## 📚 **API Endpoints**

### Autenticación
```bash
POST /api/v1/register    # Registro de usuario
POST /api/v1/login       # Login
```

### P2P Trading
```bash
GET  /api/v1/orders      # Listar órdenes
POST /api/v1/orders      # Crear orden
GET  /api/v1/orderbook   # Libro de órdenes
GET  /api/v1/rates       # Tipos de cambio
```

### Wallets
```bash
GET  /api/v1/wallets     # Obtener wallets
POST /api/v1/deposit     # Depositar
POST /api/v1/withdraw    # Retirar
```

## 🧪 **Testing**

```bash
# Test completo del sistema
./test-phase2.sh

# Health checks individuales
curl http://localhost:8080/health
curl http://localhost:3002/health

# Ver logs en tiempo real
cd p2p-bolivia-mvp
docker compose logs -f
```

## 🛠️ **Desarrollo**

### Estructura del Proyecto
```
p2p-bolivia-mvp/
├── services/           # Microservicios backend
│   ├── auth/          # Servicio de autenticación  
│   ├── p2p/           # Motor P2P (Fase 2)
│   ├── wallet/        # Gestión de wallets
│   ├── gateway/       # API Gateway
│   └── bank-listener/ # Listener bancario
├── frontend/          # Frontend Next.js
├── migrations/        # Migraciones de DB
└── docker-compose.yml # Configuración Docker
```

### Comandos Útiles
```bash
# Rebuildar servicios
docker compose build

# Ver estado de servicios  
docker compose ps

# Reiniciar un servicio específico
docker compose restart p2p

# Acceder a la base de datos
docker exec -it p2p-postgres psql -U p2padmin -d p2p_bolivia
```

## 📊 **Monitoreo**

- **RabbitMQ Management**: http://localhost:15672 (admin/admin)
- **Database**: Acceso via psql o pgAdmin
- **Logs**: `docker compose logs -f [servicio]`

## 🔐 **Seguridad**

- ✅ JWT authentication con refresh tokens
- ✅ Validación de entrada en todos los endpoints
- ✅ Rate limiting (a implementar)
- ✅ Encriptación de contraseñas con bcrypt
- ✅ Variables de entorno para secretos

## 🚧 **Roadmap**

### ✅ Fase 1 - MVP Básico
- Sistema de usuarios y auth
- Base de datos y migraciones
- Dockerización completa

### ✅ Fase 2 - Motor P2P (Actual)
- Motor de matching en tiempo real
- Sistema de órdenes buy/sell
- API REST completa
- Testing automatizado

### 🔄 Fase 3 - Próxima
- [ ] Sistema KYC completo
- [ ] Sistema de disputas
- [ ] Chat entre usuarios
- [ ] Mobile app (React Native)
- [ ] Optimizaciones de performance

## 🤝 **Contribuir**

1. Fork el proyecto
2. Crea una rama feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 **Licencia**

Este proyecto está bajo la Licencia MIT. Ver `LICENSE` para más detalles.

## 📞 **Soporte**

- 📧 Email: [tu-email]
- 💬 Issues: [GitHub Issues]
- 📖 Docs: Ver `README-FASE2.md` para detalles técnicos

---

**Desarrollado con ❤️ para Bolivia** 🇧🇴