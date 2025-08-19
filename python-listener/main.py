#!/usr/bin/env python3
"""
P2P Bolivia - Python Bank Listener
FastAPI service para recibir notificaciones bancarias del Android
"""

import json
import uuid
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn


# Modelos de datos
class BankNotification(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    transaction_id: str
    amount: float
    currency: str = "BOB"
    sender_name: str
    sender_account: Optional[str] = None
    bank_name: str
    reference: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    status: str = "COMPLETED"
    processed: bool = False
    raw_data: Optional[Dict[str, Any]] = None


class NotificationResponse(BaseModel):
    status: str
    count: int
    notifications: List[BankNotification]


class AcknowledgeRequest(BaseModel):
    notification_id: str


# Configuración
app = FastAPI(
    title="P2P Bolivia Bank Listener",
    description="Servicio Python para recibir notificaciones bancarias",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage para notificaciones
NOTIFICATIONS_FILE = "notifications.json"
notifications_storage: List[Dict[str, Any]] = []


def load_notifications():
    """Cargar notificaciones desde archivo"""
    global notifications_storage
    if os.path.exists(NOTIFICATIONS_FILE):
        try:
            with open(NOTIFICATIONS_FILE, 'r') as f:
                notifications_storage = json.load(f)
        except Exception as e:
            print(f"Error cargando notificaciones: {e}")
            notifications_storage = []
    else:
        notifications_storage = []


def save_notifications():
    """Guardar notificaciones a archivo"""
    try:
        with open(NOTIFICATIONS_FILE, 'w') as f:
            json.dump(notifications_storage, f, indent=2, default=str)
    except Exception as e:
        print(f"Error guardando notificaciones: {e}")


@app.on_event("startup")
async def startup():
    """Cargar datos al iniciar"""
    load_notifications()
    print("🐍 Python Bank Listener iniciado")
    print(f"📁 Archivo de notificaciones: {NOTIFICATIONS_FILE}")


@app.get("/")
async def root():
    """Endpoint raíz"""
    return {
        "service": "P2P Bolivia Bank Listener",
        "status": "running",
        "version": "1.0.0",
        "notifications_count": len(notifications_storage)
    }


@app.get("/health")
async def health():
    """Health check"""
    return {
        "status": "healthy",
        "service": "python-bank-listener",
        "notifications_count": len(notifications_storage)
    }


@app.get("/api/notifications", response_model=NotificationResponse)
async def get_notifications(
    limit: int = 100,
    processed: Optional[bool] = None
):
    """Obtener notificaciones bancarias"""
    filtered_notifications = notifications_storage.copy()
    
    # Filtrar por estado procesado
    if processed is not None:
        filtered_notifications = [
            n for n in filtered_notifications 
            if n.get('processed', False) == processed
        ]
    
    # Ordenar por timestamp (más recientes primero)
    filtered_notifications.sort(
        key=lambda x: x.get('timestamp', ''), 
        reverse=True
    )
    
    # Aplicar límite
    limited_notifications = filtered_notifications[:limit]
    
    # Convertir a modelos Pydantic
    notifications = []
    for notif_data in limited_notifications:
        try:
            # Asegurar que timestamp sea un string ISO
            if isinstance(notif_data.get('timestamp'), str):
                timestamp_str = notif_data['timestamp']
            else:
                timestamp_str = datetime.now(timezone.utc).isoformat()
            
            notification = BankNotification(
                id=notif_data.get('id', str(uuid.uuid4())),
                transaction_id=notif_data.get('transaction_id', ''),
                amount=float(notif_data.get('amount', 0)),
                currency=notif_data.get('currency', 'BOB'),
                sender_name=notif_data.get('sender_name', ''),
                sender_account=notif_data.get('sender_account'),
                bank_name=notif_data.get('bank_name', ''),
                reference=notif_data.get('reference'),
                timestamp=datetime.fromisoformat(timestamp_str.replace('Z', '+00:00')),
                status=notif_data.get('status', 'COMPLETED'),
                processed=notif_data.get('processed', False),
                raw_data=notif_data.get('raw_data')
            )
            notifications.append(notification)
        except Exception as e:
            print(f"Error procesando notificación: {e}")
            continue
    
    return NotificationResponse(
        status="success",
        count=len(notifications),
        notifications=notifications
    )


@app.post("/api/notifications")
async def create_notification(
    notification_data: Dict[str, Any],
    background_tasks: BackgroundTasks
):
    """Recibir nueva notificación bancaria desde Android"""
    try:
        # Generar ID único
        notif_id = str(uuid.uuid4())
        
        # Crear notificación
        notification = {
            "id": notif_id,
            "transaction_id": notification_data.get("transaction_id", f"tx_{notif_id[:8]}"),
            "amount": float(notification_data.get("amount", 0)),
            "currency": notification_data.get("currency", "BOB"),
            "sender_name": notification_data.get("sender_name", ""),
            "sender_account": notification_data.get("sender_account"),
            "bank_name": notification_data.get("bank_name", ""),
            "reference": notification_data.get("reference"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": notification_data.get("status", "COMPLETED"),
            "processed": False,
            "raw_data": notification_data
        }
        
        # Agregar a storage
        notifications_storage.append(notification)
        
        # Guardar en background
        background_tasks.add_task(save_notifications)
        
        print(f"📱 Nueva notificación bancaria: {notification['bank_name']} - {notification['amount']} {notification['currency']}")
        
        return {
            "status": "success",
            "notification_id": notif_id,
            "message": "Notificación recibida correctamente"
        }
        
    except Exception as e:
        print(f"Error procesando notificación: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/acknowledge")
async def acknowledge_notification(
    request: AcknowledgeRequest,
    background_tasks: BackgroundTasks
):
    """Marcar notificación como procesada"""
    notification_id = request.notification_id
    
    # Buscar y marcar como procesada
    for notification in notifications_storage:
        if notification.get('id') == notification_id:
            notification['processed'] = True
            notification['processed_at'] = datetime.now(timezone.utc).isoformat()
            
            # Guardar en background
            background_tasks.add_task(save_notifications)
            
            print(f"✅ Notificación marcada como procesada: {notification_id}")
            
            return {
                "status": "acknowledged",
                "notification_id": notification_id
            }
    
    raise HTTPException(status_code=404, detail="Notificación no encontrada")


@app.get("/api/stats")
async def get_stats():
    """Estadísticas del listener"""
    total_notifications = len(notifications_storage)
    processed_count = sum(1 for n in notifications_storage if n.get('processed', False))
    pending_count = total_notifications - processed_count
    
    # Agrupar por banco
    banks = {}
    for notif in notifications_storage:
        bank = notif.get('bank_name', 'Unknown')
        if bank not in banks:
            banks[bank] = 0
        banks[bank] += 1
    
    return {
        "total_notifications": total_notifications,
        "processed": processed_count,
        "pending": pending_count,
        "banks": banks,
        "uptime": "running"
    }


@app.delete("/api/notifications/{notification_id}")
async def delete_notification(
    notification_id: str,
    background_tasks: BackgroundTasks
):
    """Eliminar notificación"""
    global notifications_storage
    
    original_count = len(notifications_storage)
    notifications_storage = [
        n for n in notifications_storage 
        if n.get('id') != notification_id
    ]
    
    if len(notifications_storage) < original_count:
        background_tasks.add_task(save_notifications)
        return {"status": "deleted", "notification_id": notification_id}
    
    raise HTTPException(status_code=404, detail="Notificación no encontrada")


# Endpoint para testing
@app.post("/api/test-notification")
async def create_test_notification(background_tasks: BackgroundTasks):
    """Crear notificación de prueba"""
    test_notification = {
        "transaction_id": f"test_tx_{int(datetime.now().timestamp())}",
        "amount": 150.75,
        "currency": "BOB",
        "sender_name": "Juan Pérez",
        "sender_account": "1234567890",
        "bank_name": "Banco de Crédito de Bolivia",
        "reference": "DEPOSIT-550e8400-e29b-41d4-a716-446655440000",
        "status": "COMPLETED"
    }
    
    return await create_notification(test_notification, background_tasks)


if __name__ == "__main__":
    # Configuración del servidor
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    
    print(f"🚀 Iniciando Python Bank Listener en {host}:{port}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )