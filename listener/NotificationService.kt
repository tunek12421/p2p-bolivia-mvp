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
        const val SERVER_URL = "http://172.20.10.3:8000/api/notification"
        const val TAG = "BankListener"
        
        val BANK_APPS = setOf(
            "com.bnb.wallet",           // BNB
            "bo.com.bg.bgmovil",        // Banco Ganadero
            "com.bg.ganamovil",         // Banco Ganadero (GanaMovil)
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
            "com.bg.ganamovil" -> "Banco Ganadero"
            "com.bancounion.launcher" -> "Banco Union"
            "com.bcp.innovacxion" -> "BCP"
            else -> packageName
        }
    }
}