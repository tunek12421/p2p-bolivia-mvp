from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import json
import logging

app = FastAPI()

# Permitir CORS desde cualquier origen (solo para desarrollo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Storage temporal en archivo local
NOTIFICATIONS_FILE = "notifications.json"

class BankNotification(BaseModel):
    bank: str
    amount: Optional[float]
    sender_name: Optional[str]
    transaction_type: str
    raw_text: str
    timestamp: int

def load_notifications():
    try:
        with open(NOTIFICATIONS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def save_notifications(notifications):
    with open(NOTIFICATIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(notifications, f, indent=2, ensure_ascii=False)

@app.get("/")
def read_root():
    return {"status": "API P2P Bolivia Online", "ip": "192.168.137.137"}

@app.post("/api/notification")
async def receive_notification(notification: BankNotification):
    """Recibe notificaciones de la app Android"""
    logger.info(f"📱 Notificación recibida de {notification.bank}")
    logger.info(f"   Monto: Bs. {notification.amount}")
    logger.info(f"   De: {notification.sender_name}")
    logger.info(f"   Texto: {notification.raw_text}")
    
    # Cargar notificaciones existentes
    notifications = load_notifications()
    
    # Agregar nueva notificación
    notification_dict = notification.dict()
    notification_dict['id'] = len(notifications) + 1
    notification_dict['received_at'] = datetime.now().isoformat()
    notifications.append(notification_dict)
    
    # Guardar en archivo
    save_notifications(notifications)
    
    print(f"\n🎉 NUEVA TRANSFERENCIA DETECTADA!")
    print(f"   Banco: {notification.bank}")
    print(f"   Monto: Bs. {notification.amount}")
    print(f"   De: {notification.sender_name}")
    print(f"   Hora: {datetime.now().strftime('%H:%M:%S')}")
    print("="*50)
    
    return {
        "status": "success",
        "message": "Notificación recibida",
        "notification_id": notification_dict['id']
    }

@app.get("/api/notifications")
def get_notifications():
    """Lista todas las notificaciones recibidas"""
    notifications = load_notifications()
    return {
        "total": len(notifications),
        "notifications": notifications[-10:]  # Últimas 10
    }

@app.delete("/api/notifications")
def clear_notifications():
    """Limpia todas las notificaciones (para testing)"""
    save_notifications([])
    return {"message": "Notificaciones eliminadas"}

if __name__ == "__main__":
    import uvicorn
    print("🚀 Iniciando servidor en http://192.168.137.137:8000")
    print("📱 IP para configurar en Android: 192.168.137.137")
    uvicorn.run(app, host="0.0.0.0", port=8000)