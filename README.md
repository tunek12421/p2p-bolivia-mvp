# P2P Bolivia

[![Demo](https://img.shields.io/badge/Demo-YouTube-red.svg)](https://www.youtube.com/watch?v=wyg0lBBqoUc)
[![Go](https://img.shields.io/badge/Go-1.21-blue.svg)](https://golang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black.svg)](https://nextjs.org/)
[![React Native](https://img.shields.io/badge/React%20Native-latest-blue.svg)](https://reactnative.dev/)

Plataforma P2P para intercambio de divisas (BOB/USD/USDT) con validación bancaria automática y chat en tiempo real.

**Stack:** Go microservices, Next.js web, React Native mobile, PostgreSQL, Redis, WebSockets

## Características

- **Motor P2P** - Matching automático de órdenes compra/venta
- **Multi-billeteras** - BOB, USD, USDT generadas automáticamente  
- **Validación bancaria** - Detección automática de pagos via notificaciones
- **Chat temporal** - WebSocket entre comprador y cajero
- **Híbrido** - Web (Next.js) + Mobile (React Native)
- **Tasas en vivo** - Integración con API Binance

## Flujo de Usuario

1. **Registro** → Billeteras BOB/USD/USDT creadas automáticamente
2. **Depósito** → Pago con QR → Validación automática via notificaciones bancarias  
3. **Trading** → Crear orden compra/venta → Match automático con cajeros
4. **Chat** → Comunicación WebSocket temporal entre partes
5. **Confirmación** → Transferencia instantánea de fondos

## Inicio Rápido

```bash
# Clonar y ejecutar
git clone <repo>
cd p2p-bolivia-mvp
./quick-start.sh

# Verificar
./test-phase2.sh
```

## Servicios

| Puerto | Servicio | Función |
|--------|----------|---------|
| 8080 | Gateway | API principal |
| 3002 | P2P Engine | Motor de matching |
| 3003 | Wallet | Gestión de billeteras |
| 3004 | Bank Listener | Validación de pagos |

## API Principal

```bash
POST /api/v1/register    # Registro
POST /api/v1/login       # Login
GET  /api/v1/orders      # Órdenes
POST /api/v1/orders      # Crear orden
GET  /api/v1/wallets     # Billeteras
POST /api/v1/deposit     # Depósito
```

## Desarrollo

```bash
# Ver logs
docker compose logs -f

# Rebuildar
docker compose build

# Base de datos
docker exec -it p2p-postgres psql -U p2padmin -d p2p_bolivia
```

**Estructura:** `services/` (Go microservices), `frontend/` (Next.js), `migrations/` (SQL)

---

**🎥 [Ver Demo](https://www.youtube.com/watch?v=wyg0lBBqoUc)** | **Desarrollado para Bolivia** 🇧🇴