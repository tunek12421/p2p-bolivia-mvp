from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import json
import logging
import os
import sqlalchemy
from sqlalchemy import create_engine, text
from decimal import Decimal

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

# Database connection
DB_URL = "postgresql://p2padmin:p2psecure123@postgres:5432/p2p_bolivia"
engine = create_engine(DB_URL)

# Storage temporal (en producción usar DB)
NOTIFICATIONS_FILE = "notifications.json"

# Cargar notificaciones existentes
def load_notifications():
    if os.path.exists(NOTIFICATIONS_FILE):
        try:
            with open(NOTIFICATIONS_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                return json.loads(content) if content else []
        except (json.JSONDecodeError, FileNotFoundError):
            return []
    return []

# Guardar notificaciones al archivo
def save_notifications(notifications_list):
    with open(NOTIFICATIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(notifications_list, f, indent=2, ensure_ascii=False)

notifications = load_notifications()
transactions = []

def normalize_name(name: str) -> str:
    """Normaliza nombres para comparación"""
    if not name:
        return ""
    return name.upper().strip()

def find_matching_deposit(sender_name: str, amount: float) -> dict:
    """Busca un depósito pendiente que coincida con la notificación"""
    try:
        with engine.connect() as conn:
            # Buscar depósitos pendientes de las últimas 24 horas
            query = text("""
                SELECT id, user_id, currency, amount, first_name, last_name, created_at
                FROM deposit_attempts 
                WHERE status = 'pending' 
                AND created_at >= NOW() - INTERVAL '24 hours'
                ORDER BY created_at DESC
            """)
            
            result = conn.execute(query)
            deposits = result.fetchall()
            
            sender_normalized = normalize_name(sender_name)
            logger.info(f"🔍 Buscando coincidencia para: '{sender_normalized}' monto: {amount}")
            logger.info(f"📋 Depósitos pendientes encontrados: {len(deposits)}")
            
            for deposit in deposits:
                # Construir nombre completo del depósito
                full_name = f"{normalize_name(deposit.first_name)} {normalize_name(deposit.last_name)}"
                deposit_amount = float(deposit.amount)
                
                logger.info(f"   💰 Comparando: '{full_name}' ({deposit_amount}) con '{sender_normalized}' ({amount})")
                
                # Validar coincidencia exacta de nombre y monto
                if full_name == sender_normalized and abs(deposit_amount - amount) < 0.01:
                    logger.info(f"✅ ¡COINCIDENCIA ENCONTRADA! Deposit ID: {deposit.id}")
                    return {
                        'id': str(deposit.id),
                        'user_id': str(deposit.user_id),
                        'currency': deposit.currency,
                        'amount': deposit_amount,
                        'full_name': full_name
                    }
                    
            logger.info("❌ No se encontró coincidencia exacta")
            return None
            
    except Exception as e:
        logger.error(f"❌ Error buscando depósito: {e}")
        return None

def process_deposit(deposit_info: dict, notification_data: dict) -> bool:
    """Procesa el depósito: actualiza billetera y marca como procesado"""
    try:
        with engine.connect() as conn:
            with conn.begin():  # Transacción para asegurar consistencia
                
                # 1. Actualizar balance de la billetera
                update_wallet_query = text("""
                    UPDATE wallets 
                    SET balance = balance + :amount,
                        updated_at = NOW()
                    WHERE user_id = :user_id AND currency = :currency
                """)
                
                conn.execute(update_wallet_query, {
                    'amount': deposit_info['amount'],
                    'user_id': str(deposit_info['user_id']),
                    'currency': deposit_info['currency']
                })
                
                # 2. Marcar depósito como procesado
                update_deposit_query = text("""
                    UPDATE deposit_attempts 
                    SET status = 'completed',
                        processed_at = NOW(),
                        notification_data = :notification_data
                    WHERE id = :deposit_id
                """)
                
                conn.execute(update_deposit_query, {
                    'deposit_id': str(deposit_info['id']),
                    'notification_data': json.dumps(notification_data)
                })
                
                # 3. Actualizar transacciones existentes del usuario a COMPLETED
                update_transaction_query = text("""
                    UPDATE transactions 
                    SET status = 'COMPLETED',
                        completed_at = NOW()
                    WHERE user_id = :user_id 
                    AND type = 'DEPOSIT' 
                    AND currency = :currency 
                    AND amount = :amount
                    AND status = 'PENDING'
                    AND created_at >= NOW() - INTERVAL '1 hour'
                """)
                
                metadata = {
                    'bank': notification_data.get('bank'),
                    'sender_name': notification_data.get('sender_name'),
                    'deposit_attempt_id': str(deposit_info['id']),
                    'notification_id': notification_data.get('id')
                }
                
                # Ejecutar la actualización de transacciones
                result = conn.execute(update_transaction_query, {
                    'user_id': str(deposit_info['user_id']),
                    'currency': deposit_info['currency'],
                    'amount': deposit_info['amount']
                })
                
                updated_count = result.rowcount
                logger.info(f"📊 Transacciones actualizadas: {updated_count}")
                
                logger.info(f"✅ Depósito procesado exitosamente:")
                logger.info(f"   👤 Usuario: {deposit_info['user_id']}")
                logger.info(f"   💰 Monto: {deposit_info['amount']} {deposit_info['currency']}")
                logger.info(f"   🏦 Banco: {notification_data.get('bank')}")
                
                return True
                
    except Exception as e:
        logger.error(f"❌ Error procesando depósito: {e}")
        return False

class BankNotification(BaseModel):
    bank: str
    amount: Optional[float]
    sender_name: Optional[str]
    transaction_type: str
    raw_text: str
    timestamp: int

@app.get("/")
def read_root():
    return {"status": "API P2P Bolivia Online"}

@app.post("/api/notification")
async def receive_notification(notification: BankNotification):
    """Recibe notificaciones de la app Android"""
    logger.info(f"📱 Notificación recibida de {notification.bank}")
    logger.info(f"   Monto: Bs. {notification.amount}")
    logger.info(f"   De: {notification.sender_name}")
    logger.info(f"   Texto: {notification.raw_text}")
    
    # Guardar notificación
    notification_dict = notification.dict()
    notification_dict['id'] = len(notifications) + 1
    notification_dict['received_at'] = datetime.now().isoformat()
    notifications.append(notification_dict)
    
    # Persistir al archivo JSON
    save_notifications(notifications)
    
    # NUEVA FUNCIONALIDAD: Validación automática y procesamiento
    validation_result = {"validated": False, "processed": False}
    
    if notification.amount and notification.amount > 0 and notification.sender_name:
        logger.info("🔍 Iniciando validación automática...")
        
        # Buscar depósito coincidente
        matching_deposit = find_matching_deposit(notification.sender_name, notification.amount)
        
        if matching_deposit:
            logger.info("✅ Depósito coincidente encontrado, procesando...")
            
            # Procesar el depósito automáticamente
            success = process_deposit(matching_deposit, notification_dict)
            
            validation_result = {
                "validated": True,
                "processed": success,
                "deposit_id": matching_deposit['id'],
                "user_id": matching_deposit['user_id'],
                "amount": matching_deposit['amount'],
                "currency": matching_deposit['currency']
            }
            
            if success:
                logger.info("🎉 ¡DEPÓSITO PROCESADO AUTOMÁTICAMENTE!")
            else:
                logger.error("❌ Error procesando el depósito automáticamente")
        else:
            logger.info("⚠️  No se encontró depósito coincidente")
            validation_result["reason"] = "No matching deposit found"
    else:
        logger.info("⚠️  Notificación sin datos válidos para procesamiento automático")
        validation_result["reason"] = "Invalid notification data"
    
    return {
        "status": "success",
        "message": "Notificación recibida",
        "notification_id": notification_dict['id'],
        "validation": validation_result
    }

@app.get("/api/notifications")
def get_notifications():
    """Lista todas las notificaciones recibidas"""
    return {
        "total": len(notifications),
        "notifications": notifications[-10:]  # Últimas 10
    }

@app.delete("/api/notifications")
def clear_notifications():
    """Limpia todas las notificaciones (para testing)"""
    notifications.clear()
    save_notifications(notifications)
    return {"message": "Notificaciones eliminadas"}