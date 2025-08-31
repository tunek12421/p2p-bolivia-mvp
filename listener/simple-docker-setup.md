# 🚀 Setup Rápido - Prueba con Celular Real

## PASO 1: Preparar el Backend con Docker

### 1.1 Crear estructura de carpetas
```bash
mkdir ~/p2p-bolivia
cd ~/p2p-bolivia
```

### 1.2 Crear `docker-compose.yml`
```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: p2p_bolivia
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres/p2p_bolivia
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis
    volumes:
      - ./:/app
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

volumes:
  postgres_data:
```

### 1.3 Crear `Dockerfile`
```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
```

### 1.4 Crear `requirements.txt`
```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
sqlalchemy==2.0.23
psycopg2-binary==2.9.9
redis==5.0.1
pydantic==2.5.0
```

### 1.5 Crear `main.py` (Backend simplificado)
```python
from fastapi import FastAPI, HTTPException
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

# Storage temporal (en producción usar DB)
notifications = []
transactions = []

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
    
    return {
        "status": "success",
        "message": "Notificación recibida",
        "notification_id": notification_dict['id']
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
    return {"message": "Notificaciones eliminadas"}
```

### 1.6 Obtener tu IP local
```bash
# Obtén tu IP local (la necesitarás para la app)
hostname -I | awk '{print $1}'
# Ejemplo: 192.168.1.100
```

### 1.7 Iniciar el backend
```bash
cd ~/p2p-bolivia
docker-compose up
```

## PASO 2: Crear App Android Minimalista

### 2.1 Crear nuevo proyecto en Android Studio
- Name: **BankListener**
- Package: **com.p2p.listener**
- Minimum SDK: **API 24**

### 2.2 Agregar permisos en `AndroidManifest.xml`
```xml
<uses-permission android:name="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" />
<uses-permission android:name="android.permission.INTERNET" />

<!-- Dentro de <application> agregar: -->
<service
    android:name=".NotificationService"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService" />
    </intent-filter>
</service>
```

### 2.3 Crear `NotificationService.kt` (Código mínimo funcional)
```kotlin
package com.p2p.listener

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class NotificationService : NotificationListenerService() {
    
    companion object {
        // CAMBIA ESTA IP POR LA DE TU COMPUTADORA
        const val SERVER_URL = "http://192.168.1.100:8000/api/notification"
        const val TAG = "BankListener"
        
        val BANK_APPS = setOf(
            "com.bnb.wallet",           // BNB
            "bo.com.bg.bgmovil",        // Banco Ganadero
            "com.bancounion.launcher",  // Banco Union
            "com.bcp.innovacxion",      // BCP
            "com.bancosol.sol.amigo",   // BancoSol
            // Agrega más según las apps que tengas
        )
    }
    
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        // Solo procesar notificaciones de apps bancarias
        if (sbn.packageName !in BANK_APPS) return
        
        val extras = sbn.notification.extras
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getString(Notification.EXTRA_TEXT) ?: ""
        val bigText = extras.getString(Notification.EXTRA_BIG_TEXT) ?: text
        
        val fullText = "$title $text $bigText"
        Log.d(TAG, "Notificación de ${sbn.packageName}: $fullText")
        
        // Extraer monto (patrón simple)
        val amount = extractAmount(fullText)
        val sender = extractSender(fullText)
        
        // Enviar al servidor
        GlobalScope.launch(Dispatchers.IO) {
            sendToServer(sbn.packageName, amount, sender, fullText)
        }
    }
    
    private fun extractAmount(text: String): Double? {
        // Buscar patrones como "Bs. 500" o "500.00 Bs"
        val regex = """(?:Bs\.?\s*|BOB\s*)(\d+(?:[.,]\d+)?)|\b(\d+(?:[.,]\d+)?)\s*(?:Bs\.?|BOB)""".toRegex()
        val match = regex.find(text)
        return match?.let {
            val amountStr = (it.groupValues[1] + it.groupValues[2])
                .replace(",", ".")
                .filter { it.isNotEmpty() }
            amountStr.firstOrNull()?.toDoubleOrNull()
        }
    }
    
    private fun extractSender(text: String): String? {
        // Patrones simples para extraer nombres
        val patterns = listOf(
            "de ([A-Z][A-Za-z\\s]+)".toRegex(),
            "desde ([A-Z][A-Za-z\\s]+)".toRegex(),
        )
        
        for (pattern in patterns) {
            pattern.find(text)?.let {
                return it.groupValues[1].trim()
            }
        }
        return null
    }
    
    private fun sendToServer(
        packageName: String,
        amount: Double?,
        sender: String?,
        rawText: String
    ) {
        try {
            val url = URL(SERVER_URL)
            val connection = url.openConnection() as HttpURLConnection
            
            connection.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
            }
            
            val json = JSONObject().apply {
                put("bank", getBankName(packageName))
                put("amount", amount ?: 0)
                put("sender_name", sender ?: "")
                put("transaction_type", "TRANSFER")
                put("raw_text", rawText)
                put("timestamp", System.currentTimeMillis())
            }
            
            connection.outputStream.use {
                it.write(json.toString().toByteArray())
            }
            
            val responseCode = connection.responseCode
            Log.d(TAG, "Respuesta del servidor: $responseCode")
            
        } catch (e: Exception) {
            Log.e(TAG, "Error enviando al servidor", e)
        }
    }
    
    private fun getBankName(packageName: String): String {
        return when (packageName) {
            "com.bnb.wallet" -> "BNB"
            "bo.com.bg.bgmovil" -> "Banco Ganadero"
            "com.bancounion.launcher" -> "Banco Union"
            "com.bcp.innovacxion" -> "BCP"
            else -> packageName
        }
    }
}
```

### 2.4 Crear `MainActivity.kt` (Simple)
```kotlin
package com.p2p.listener

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat

class MainActivity : AppCompatActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Layout simple
        val textView = TextView(this).apply {
            text = "Estado: Verificando permisos..."
            textSize = 18f
            setPadding(50, 50, 50, 50)
        }
        
        val button = Button(this).apply {
            text = "Abrir configuración de notificaciones"
            setOnClickListener {
                startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            }
        }
        
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            addView(textView)
            addView(button)
        }
        
        setContentView(layout)
        
        // Verificar permisos
        checkPermissions(textView)
    }
    
    private fun checkPermissions(textView: TextView) {
        val enabled = NotificationManagerCompat
            .getEnabledListenerPackages(this)
            .contains(packageName)
        
        textView.text = if (enabled) {
            "✅ Servicio activo\nEsperando notificaciones bancarias..."
        } else {
            "❌ Permiso necesario\nPresiona el botón para activar"
        }
    }
}
```

## PASO 3: Configurar y Probar con tu Celular

### 3.1 Preparar el celular
1. **Habilitar opciones de desarrollador:**
   - Settings → About phone → Tap "Build number" 7 veces
   - Settings → Developer options → Enable "USB debugging"

### 3.2 Conectar por USB o WiFi

**Opción A - USB:**
```bash
# Conecta tu celular por USB
adb devices
# Debe aparecer tu dispositivo
```

**Opción B - WiFi (mismo red):**
```bash
# Con el celular conectado por USB primero
adb tcpip 5555
adb connect [IP_DE_TU_CELULAR]:5555
# Ahora puedes desconectar el USB
```

### 3.3 Instalar la app
```bash
# En Android Studio: Run → Run 'app'
# O desde terminal:
./gradlew installDebug
```

### 3.4 Configurar permisos en el celular
1. Ve a **Settings → Apps → Special access**
2. Busca **Notification access**
3. Activa **BankListener**

### 3.5 Verificar que funciona
1. Abre la terminal donde está corriendo Docker
2. Deberías ver logs cuando lleguen notificaciones

## PASO 4: Hacer una Transferencia Real de Prueba

1. **Pide a alguien que te transfiera Bs. 1** (o el monto mínimo)
2. Cuando llegue la notificación al celular, verás en la terminal:
```
📱 Notificación recibida de BNB
   Monto: Bs. 1.0
   De: JUAN PEREZ
```

3. **Verificar en el navegador:**
```bash
# Abre en tu navegador
http://localhost:8000/api/notifications
```

## 📱 Tips Importantes

1. **Asegúrate que tu celular y computadora estén en la misma red WiFi**

2. **Si no funciona, verifica la IP:**
```bash
# En la computadora
ip addr show
# Busca la IP de wlan0 o eth0 (ej: 192.168.1.100)

# Actualiza SERVER_URL en NotificationService.kt
```

3. **Para ver logs del celular:**
```bash
adb logcat | grep BankListener
```

4. **Apps bancarias comunes en Bolivia:**
- BNB: `com.bnb.wallet`
- Banco Ganadero: `bo.com.bg.bgmovil`
- Banco Union: `com.bancounion.launcher`
- BCP: `com.bcp.innovacxion`

5. **Para encontrar el package name de una app:**
```bash
# Lista todas las apps instaladas
adb shell pm list packages | grep -i banco
```

## ¡Listo! 🎉

Con esto ya tienes un sistema funcional básico. Cuando recibas una transferencia real, la notificación se capturará y enviará a tu servidor local.