import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { p2pService } from '../services/api';

interface P2POrder {
  id: string;
  type: 'BUY' | 'SELL';
  currency_from: string;
  currency_to: string;
  amount: number;
  remaining_amount: number;
  rate: number;
  min_amount: number;
  max_amount: number;
  payment_methods: string[];
  user_id: string;
  status: string;
  created_at: string;
}

interface UserOrdersScreenProps {
  navigation: any;
}

export default function UserOrdersScreen({ navigation }: UserOrdersScreenProps) {
  const [userOrders, setUserOrders] = useState<P2POrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchUserOrders();
  }, []);

  const fetchUserOrders = async () => {
    try {
      setIsLoading(true);
      console.log('🔄 Fetching user orders...');
      
      const response = await p2pService.getMyOrders();
      console.log('📦 User orders response:', response);
      
      setUserOrders(response.orders || []);
    } catch (error: any) {
      console.error('❌ Error fetching user orders:', error);
      
      // Enhanced error logging like web console
      const errorDetails = {
        message: error?.message || 'Unknown error',
        status: error?.status || 'Unknown',
        statusText: error?.statusText || 'Unknown',
        data: error?.data || 'No data',
        url: error?.url || '/api/v1/user/orders',
        method: error?.method || 'GET',
        baseURL: error?.baseURL || 'Unknown',
        timeout: error?.timeout || 'Unknown',
        headers: error?.headers || 'Unknown',
        config: error?.config || 'No config',
        response: error?.response || 'No response'
      };
      
      console.log('📋 ERROR DETAILS:');
      console.log('  Message:', errorDetails.message);
      console.log('  Status:', errorDetails.status);
      console.log('  Status Text:', errorDetails.statusText);
      console.log('  Data:', JSON.stringify(errorDetails.data, null, 2));
      console.log('  URL:', errorDetails.url);
      console.log('  Method:', errorDetails.method);
      console.log('  Base URL:', errorDetails.baseURL);
      console.log('  Timeout:', errorDetails.timeout);
      console.log('  Headers:', JSON.stringify(errorDetails.headers, null, 2));
      console.log('  Full Error Object:', JSON.stringify(error, null, 2));
      
      // Show detailed error in Alert
      const errorMessage = `Error: ${errorDetails.status} ${errorDetails.statusText}\n\nMessage: ${errorDetails.message}\n\nData: ${JSON.stringify(errorDetails.data)}\n\nURL: ${errorDetails.url}`;
      
      Alert.alert(
        'Error Detallado', 
        errorMessage,
        [
          { text: 'Copiar Error', onPress: () => {
            // In a real app, you'd use Clipboard API
            console.log('Error to copy:', errorMessage);
          }},
          { text: 'OK', style: 'cancel' }
        ]
      );
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUserOrders();
    setRefreshing(false);
  };

  const handleCancelOrder = async (orderId: string) => {
    Alert.alert(
      'Cancelar Orden',
      '¿Estás seguro de que quieres cancelar esta orden?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, Cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              await p2pService.cancelOrder(orderId);
              Alert.alert('Éxito', 'Orden cancelada exitosamente');
              await fetchUserOrders();
            } catch (error: any) {
              console.error('❌ Error canceling order:', error);
              Alert.alert('Error', 'Error cancelando la orden');
            }
          }
        }
      ]
    );
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'PENDING': { 
        color: '#ff8c00', 
        bg: '#fff4e6',
        text: 'Esperando Cajero',
        animation: true
      },
      'MATCHED': { 
        color: '#0066cc', 
        bg: '#e6f3ff',
        text: 'Asignada',
        animation: false
      },
      'PROCESSING': { 
        color: '#8b5cf6', 
        bg: '#f3e8ff',
        text: 'En Proceso',
        animation: false
      },
      'COMPLETED': { 
        color: '#00a859', 
        bg: '#e6f7ed',
        text: 'Completada',
        animation: false
      },
      'CANCELLED': { 
        color: '#ff6b6b', 
        bg: '#ffe6e6',
        text: 'Cancelada',
        animation: false
      },
      'ACTIVE': { 
        color: '#0066cc', 
        bg: '#e6f3ff',
        text: 'Activa',
        animation: false
      }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['PENDING'];

    return (
      <View style={[styles.statusBadge, { backgroundColor: config.bg }]}>
        <Text style={[styles.statusText, { color: config.color }]}>
          {config.text}
        </Text>
      </View>
    );
  };

  const formatCurrency = (amount: number | string, currency: string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (currency === 'BOB') {
      return `Bs. ${numAmount.toFixed(2)}`;
    } else if (currency === 'USDT') {
      return `USDT ${numAmount.toFixed(4)}`;
    } else {
      return `$${numAmount.toFixed(4)}`;
    }
  };

  const canCancelOrder = (order: P2POrder) => {
    return order.status === 'PENDING' || order.status === 'MATCHED';
  };

  const canOpenChat = (order: P2POrder) => {
    return order.status === 'MATCHED' || order.status === 'PROCESSING';
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <Text>Cargando mis órdenes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Mis Órdenes</Text>
        <TouchableOpacity onPress={() => navigation.navigate('P2P')}>
          <Ionicons name="add-circle" size={24} color="#00a859" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {userOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No tienes órdenes</Text>
            <Text style={styles.emptySubtext}>
              Aún no has creado ninguna orden de trading
            </Text>
            <TouchableOpacity 
              style={styles.createFirstOrderButton} 
              onPress={() => navigation.navigate('P2P')}
            >
              <Ionicons name="add" size={20} color="white" />
              <Text style={styles.createFirstOrderText}>Crear Primera Orden</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.ordersList}>
            {userOrders.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderHeader}>
                  <View style={styles.orderTypeAndPair}>
                    <View style={[styles.typeTag, {
                      backgroundColor: order.type === 'BUY' ? '#00a859' : '#ff6b6b'
                    }]}>
                      <Text style={styles.typeText}>
                        {order.type === 'BUY' ? 'Compra' : 'Venta'}
                      </Text>
                    </View>
                    <Text style={styles.currencyPair}>
                      {order.currency_from}/{order.currency_to}
                    </Text>
                  </View>
                  {getStatusBadge(order.status)}
                </View>

                <View style={styles.orderDetails}>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Cantidad:</Text>
                    <View style={styles.infoValueContainer}>
                      <Text style={styles.infoValue}>
                        {formatCurrency(order.remaining_amount, order.currency_from)}
                      </Text>
                      <Text style={styles.infoSubtext}>
                        de {formatCurrency(order.amount, order.currency_from)}
                      </Text>
                    </View>
                  </View>
                  
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Tasa:</Text>
                    <Text style={styles.infoValue}>
                      {formatCurrency(order.rate, order.currency_to)}
                    </Text>
                  </View>
                  
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Límites:</Text>
                    <Text style={styles.infoValue}>
                      {formatCurrency(order.min_amount, order.currency_from)} - {formatCurrency(order.max_amount, order.currency_from)}
                    </Text>
                  </View>

                  <View style={styles.paymentMethods}>
                    <Text style={styles.infoLabel}>Métodos de pago:</Text>
                    <View style={styles.paymentMethodTags}>
                      {order.payment_methods.slice(0, 2).map((method, index) => (
                        <View key={index} style={styles.paymentMethodTag}>
                          <Text style={styles.paymentMethodText}>
                            {method.replace('_', ' ').toUpperCase()}
                          </Text>
                        </View>
                      ))}
                      {order.payment_methods.length > 2 && (
                        <View style={styles.paymentMethodTag}>
                          <Text style={styles.paymentMethodText}>
                            +{order.payment_methods.length - 2}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={styles.orderFooter}>
                    <Text style={styles.dateText}>
                      {new Date(order.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </Text>
                    
                    <View style={styles.actionButtons}>
                      {/* View Details Button */}
                      {['PENDING', 'MATCHED', 'PROCESSING', 'COMPLETED'].includes(order.status) && (
                        <TouchableOpacity
                          style={styles.viewButton}
                          onPress={() => {
                            Alert.alert('Ver Detalles', `Orden ID: ${order.id.slice(0, 8)}...`);
                          }}
                        >
                          <Ionicons name="eye" size={14} color="white" />
                          <Text style={styles.viewButtonText}>Ver</Text>
                        </TouchableOpacity>
                      )}
                      
                      {/* Chat Button */}
                      {canOpenChat(order) && (
                        <TouchableOpacity
                          style={styles.chatButton}
                          onPress={() => {
                            Alert.alert('Chat', 'Función de chat próximamente');
                          }}
                        >
                          <Ionicons name="chatbubbles" size={14} color="white" />
                          <Text style={styles.chatButtonText}>Chat</Text>
                        </TouchableOpacity>
                      )}
                      
                      {/* Cancel Button */}
                      {canCancelOrder(order) && (
                        <TouchableOpacity
                          style={styles.cancelButton}
                          onPress={() => handleCancelOrder(order.id)}
                        >
                          <Ionicons name="close" size={14} color="white" />
                          <Text style={styles.cancelButtonText}>Cancelar</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 50,
    backgroundColor: 'white',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  emptyState: {
    backgroundColor: 'white',
    margin: 16,
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  createFirstOrderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00a859',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  createFirstOrderText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 8,
  },
  ordersList: {
    margin: 16,
  },
  orderCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orderTypeAndPair: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typeTag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 12,
  },
  typeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  currencyPair: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  orderDetails: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  infoValueContainer: {
    alignItems: 'flex-end',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  infoSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  paymentMethods: {
    marginTop: 4,
  },
  paymentMethodTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  paymentMethodTag: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  paymentMethodText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  dateText: {
    fontSize: 12,
    color: '#999',
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0066cc',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 4,
  },
  viewButtonText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00a859',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 4,
  },
  chatButtonText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff6b6b',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 4,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
});