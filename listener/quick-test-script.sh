#!/bin/bash

# test.sh - Script para probar que el sistema funciona

echo "🧪 Test del Sistema P2P Bolivia"
echo "================================"

# 1. Verificar que el backend está corriendo
echo -n "1. Verificando backend... "
if curl -s http://localhost:8000 > /dev/null; then
    echo "✅ OK"
else
    echo "❌ FALLO - Ejecuta: docker-compose up"
    exit 1
fi

# 2. Enviar notificación de prueba
echo -n "2. Enviando notificación de prueba... "
curl -s -X POST http://localhost:8000/api/notification \
  -H "Content-Type: application/json" \
  -d '{
    "bank": "BNB",
    "amount": 100.50,
    "sender_name": "TEST USER",
    "transaction_type": "TRANSFER",
    "raw_text": "Has recibido Bs. 100.50 de TEST USER",
    "timestamp": 1234567890
  }' > /dev/null

if [ $? -eq 0 ]; then
    echo "✅ OK"
else
    echo "❌ FALLO"
    exit 1
fi

# 3. Verificar que se guardó
echo -n "3. Verificando que se guardó... "
RESPONSE=$(curl -s http://localhost:8000/api/notifications)
if echo "$RESPONSE" | grep -q "TEST USER"; then
    echo "✅ OK"
else
    echo "❌ FALLO"
    exit 1
fi

echo ""
echo "✅ Sistema funcionando correctamente!"
echo ""
echo "📱 Ahora verifica en tu celular:"
echo "   1. Abre la app BankListener"
echo "   2. Debe decir 'Servicio activo'"
echo "   3. Cuando recibas una notificación bancaria real,"
echo "      aparecerá aquí automáticamente"
echo ""
echo "🔍 Para monitorear en tiempo real:"
echo "   watch -n 1 'curl -s http://localhost:8000/api/notifications | python3 -m json.tool'"