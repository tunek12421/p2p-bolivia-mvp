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