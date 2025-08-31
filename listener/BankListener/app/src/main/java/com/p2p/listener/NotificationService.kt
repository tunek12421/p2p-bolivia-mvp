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
        const val SERVER_URL = "http://192.168.1.77:8000/api/notification"
        const val TAG = "BankListener"
        
        val BANK_APPS = setOf(
            "com.bnb.wallet",
            "bo.com.bg.bgmovil",
            "com.bancounion.launcher",
            "com.bcp.innovacxion",
            "com.bancosol.sol.amigo",
            "bo.com.bisa.bisanet",
            "com.fie.app",
            "com.bcp.bo.wallet"
        )
    }
    
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        
        // Log TODOS los extras disponibles para notificaciones bancarias
        if (sbn.packageName in BANK_APPS) {
            Log.d(TAG, "=== NOTIFICACIÓN BANCARIA DE ${sbn.packageName} ===")
            
            // Datos del StatusBarNotification
            Log.d(TAG, "PostTime: ${sbn.postTime}")
            Log.d(TAG, "ID: ${sbn.id}")
            Log.d(TAG, "Tag: ${sbn.tag}")
            Log.d(TAG, "Key: ${sbn.key}")
            Log.d(TAG, "GroupKey: ${sbn.groupKey}")
            Log.d(TAG, "OverrideGroupKey: ${sbn.overrideGroupKey}")
            
            // Datos de la Notification
            val notification = sbn.notification
            Log.d(TAG, "Category: ${notification.category}")
            Log.d(TAG, "Priority: ${notification.priority}")
            Log.d(TAG, "Flags: ${notification.flags}")
            Log.d(TAG, "When: ${notification.`when`}")
            Log.d(TAG, "Group: ${notification.group}")
            Log.d(TAG, "SortKey: ${notification.sortKey}")
            
            // Todos los extras
            Log.d(TAG, "--- EXTRAS ---")
            for (key in extras.keySet()) {
                val value = extras.get(key)
                Log.d(TAG, "Extra: $key = $value")
            }
            Log.d(TAG, "=================================")
        } else {
            // Para no bancarias, solo log básico
            Log.d(TAG, "NOTIF NO BANCARIA: ${sbn.packageName}")
        }
        
        if (sbn.packageName !in BANK_APPS) return
        
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getString(Notification.EXTRA_TEXT) ?: ""
        val bigText = extras.getString(Notification.EXTRA_BIG_TEXT) ?: text
        
        val fullText = "$title $text $bigText"
        
        Log.d(TAG, "Notificación BANCARIA de ${sbn.packageName}: $fullText")
        
        val amount = extractAmount(fullText)
        val sender = extractSender(fullText)
        
        CoroutineScope(Dispatchers.IO).launch {
            sendToServer(sbn.packageName, amount, sender, fullText)
        }
    }
    
    private fun extractAmount(text: String): Double? {
        val regex = """(?:Bs\.?\s*|BOB\s*)(\d+(?:[.,]\d+)?)|\b(\d+(?:[.,]\d+)?)\s*(?:Bs\.?|BOB)""".toRegex()
        return regex.find(text)?.let {
            val amountStr = (it.groupValues[1] + it.groupValues[2]).replace(",", ".")
            amountStr.toDoubleOrNull()
        }
    }
    
    private fun extractSender(text: String): String? {
        val patterns = listOf(
            "QR DE ([A-Z][A-Za-z\\s]+?)\\s+te\\s+envi".toRegex(),
            "de ([A-Z][A-Za-z\\s]+)".toRegex(),
            "desde ([A-Z][A-Za-z\\s]+)".toRegex()
        )
        
        patterns.forEach { pattern ->
            pattern.find(text)?.let {
                return it.groupValues[1].trim()
            }
        }
        return null
    }
    
    private suspend fun sendToServer(packageName: String, amount: Double?, sender: String?, rawText: String) {
        try {
            val url = URL(SERVER_URL)
            val connection = url.openConnection() as HttpURLConnection
            
            connection.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
                connectTimeout = 5000
                readTimeout = 5000
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
            "com.bancosol.sol.amigo" -> "BancoSol"
            "bo.com.bisa.bisanet" -> "BISA"
            "com.fie.app" -> "FIE"
            "com.bcp.bo.wallet" -> "Yape"
            else -> packageName
        }
    }
}