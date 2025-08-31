package com.p2p.listener

import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
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
        
        val testButton = Button(this).apply {
            text = "Probar conexión al servidor 3"
            setOnClickListener {
                testServerConnection()
            }
        }
        
        val layout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            addView(textView)
            addView(button)
            addView(testButton)
        }
        
        setContentView(layout)
        checkPermissions(textView)
    }
    
    override fun onResume() {
        super.onResume()
        val textView = findViewById<TextView>(android.R.id.text1) ?: return
        checkPermissions(textView)
    }
    
    private fun checkPermissions(textView: TextView) {
        val enabled = NotificationManagerCompat
            .getEnabledListenerPackages(this)
            .contains(packageName)
        
        textView.text = if (enabled) {
            "✅ Servicio activo\nIP: 192.168.1.77:8000\nEsperando notificaciones bancarias..."
        } else {
            "❌ Permiso necesario\nPresiona el botón para activar"
        }
    }
    
    private fun testServerConnection() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL("http://192.168.1.77:8000/api/notification")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    connectTimeout = 5000
                    readTimeout = 5000
                }
                
                val json = JSONObject().apply {
                    put("bank", "TEST")
                    put("amount", 99.99)
                    put("sender_name", "PRUEBA CONECTIVIDAD")
                    put("transaction_type", "TEST")
                    put("raw_text", "Prueba de conectividad desde app Android")
                    put("timestamp", System.currentTimeMillis())
                }
                
                connection.outputStream.use {
                    it.write(json.toString().toByteArray())
                }
                
                val responseCode = connection.responseCode
                
                withContext(Dispatchers.Main) {
                    if (responseCode == 200) {
                        Toast.makeText(this@MainActivity, "✅ Conectado al servidor!", Toast.LENGTH_LONG).show()
                    } else {
                        Toast.makeText(this@MainActivity, "❌ Error: $responseCode", Toast.LENGTH_LONG).show()
                    }
                }
                
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@MainActivity, "❌ Error: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }
    }
}