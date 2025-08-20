import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { p2pService } from '../services/api';

interface P2POrder {
  id: string;
  type: 'BUY' | 'SELL';
  crypto_currency: string;
  fiat_currency: string;
  amount: number;
  price: number;
  payment_method: string;
  user_email: string;
  status: string;
}

export default function P2PMarketScreen({ navigation }: any) {
  const [orders, setOrders] = useState<P2POrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newOrder, setNewOrder] = useState({
    type: 'BUY' as 'BUY' | 'SELL',
    crypto_currency: 'USDT',
    fiat_currency: 'BOB',
    amount: '',
    price: '',
    payment_method: 'BANK_TRANSFER',
    terms: '',
  });

  const fetchOrders = async () => {
    try {
      const response = await p2pService.getOrders(filter === 'ALL' ? undefined : filter);
      setOrders(response.orders || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [filter]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchOrders();
    setRefreshing(false);
  };

  const handleCreateOrder = async () => {
    if (!newOrder.amount || !newOrder.price) {
      Alert.alert('Error', 'Por favor completa todos los campos requeridos');
      return;
    }

    try {
      await p2pService.createOrder({
        ...newOrder,
        amount: parseFloat(newOrder.amount),
        price: parseFloat(newOrder.price),
      });

      setShowCreateModal(false);
      setNewOrder({
        type: 'BUY',
        crypto_currency: 'USDT',
        fiat_currency: 'BOB',
        amount: '',
        price: '',
        payment_method: 'BANK_TRANSFER',
        terms: '',
      });
      
      Alert.alert('Éxito', 'Orden creada exitosamente');
      await fetchOrders();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Error al crear la orden');
    }
  };

  const handleExecuteOrder = (order: P2POrder) => {
    Alert.alert(
      'Ejecutar Orden',
      `¿Quieres ${order.type === 'BUY' ? 'vender' : 'comprar'} ${order.crypto_currency} por ${order.price} ${order.fiat_currency}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Confirmar', 
          onPress: async () => {
            try {
              await p2pService.executeOrder(order.id, order.amount);
              Alert.alert('Éxito', 'Orden ejecutada. Se ha creado una transacción.');
              await fetchOrders();
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Error al ejecutar la orden');
            }
          }
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Cargando órdenes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Mercado P2P</Text>
        <TouchableOpacity onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add-circle" size={32} color="#00a859" />
        </TouchableOpacity>
      </View>

      {/* Filter Buttons */}
      <View style={styles.filterContainer}>
        {['ALL', 'BUY', 'SELL'].map((filterType) => (
          <TouchableOpacity
            key={filterType}
            style={[
              styles.filterButton,
              filter === filterType && styles.filterButtonActive
            ]}
            onPress={() => setFilter(filterType as any)}
          >
            <Text style={[
              styles.filterText,
              filter === filterType && styles.filterTextActive
            ]}>
              {filterType === 'ALL' ? 'Todas' : filterType === 'BUY' ? 'Compra' : 'Venta'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.ordersList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {orders.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No hay órdenes disponibles</Text>
          </View>
        ) : (
          orders.map((order) => (
            <View key={order.id} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <View style={[
                  styles.typeTag,
                  { backgroundColor: order.type === 'BUY' ? '#4CAF50' : '#FF5722' }
                ]}>
                  <Text style={styles.typeText}>{order.type}</Text>
                </View>
                <Text style={styles.orderUser}>{order.user_email}</Text>
              </View>

              <View style={styles.orderDetails}>
                <Text style={styles.orderCurrency}>
                  {order.crypto_currency}/{order.fiat_currency}
                </Text>
                <Text style={styles.orderAmount}>
                  Cantidad: {order.amount} {order.crypto_currency}
                </Text>
                <Text style={styles.orderPrice}>
                  Precio: {order.price} {order.fiat_currency}
                </Text>
                <Text style={styles.orderPayment}>
                  Método: {order.payment_method}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.executeButton}
                onPress={() => handleExecuteOrder(order)}
              >
                <Text style={styles.executeButtonText}>
                  {order.type === 'BUY' ? 'Vender' : 'Comprar'}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      {/* Create Order Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Crear Nueva Orden</Text>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Tipo de Orden</Text>
              <View style={styles.toggleContainer}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    newOrder.type === 'BUY' && styles.toggleButtonActive
                  ]}
                  onPress={() => setNewOrder(prev => ({ ...prev, type: 'BUY' }))}
                >
                  <Text style={[
                    styles.toggleText,
                    newOrder.type === 'BUY' && styles.toggleTextActive
                  ]}>Comprar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    newOrder.type === 'SELL' && styles.toggleButtonActive
                  ]}
                  onPress={() => setNewOrder(prev => ({ ...prev, type: 'SELL' }))}
                >
                  <Text style={[
                    styles.toggleText,
                    newOrder.type === 'SELL' && styles.toggleTextActive
                  ]}>Vender</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Cantidad (USDT)"
              value={newOrder.amount}
              onChangeText={(value) => setNewOrder(prev => ({ ...prev, amount: value }))}
              keyboardType="numeric"
            />

            <TextInput
              style={styles.input}
              placeholder="Precio por USDT (BOB)"
              value={newOrder.price}
              onChangeText={(value) => setNewOrder(prev => ({ ...prev, price: value }))}
              keyboardType="numeric"
            />

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Términos y condiciones (opcional)"
              value={newOrder.terms}
              onChangeText={(value) => setNewOrder(prev => ({ ...prev, terms: value }))}
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity style={styles.createButton} onPress={handleCreateOrder}>
              <Text style={styles.createButtonText}>Crear Orden</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    backgroundColor: 'white',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: 'white',
    marginBottom: 8,
  },
  filterButton: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: '#f0f0f0',
  },
  filterButtonActive: {
    backgroundColor: '#00a859',
  },
  filterText: {
    color: '#666',
    fontWeight: '600',
  },
  filterTextActive: {
    color: 'white',
  },
  ordersList: {
    flex: 1,
    padding: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 16,
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
  typeTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  typeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  orderUser: {
    color: '#666',
    fontSize: 12,
  },
  orderDetails: {
    marginBottom: 16,
  },
  orderCurrency: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  orderAmount: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  orderPrice: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  orderPayment: {
    fontSize: 14,
    color: '#666',
  },
  executeButton: {
    backgroundColor: '#00a859',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  executeButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
  },
  toggleButton: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  toggleButtonActive: {
    backgroundColor: '#00a859',
  },
  toggleText: {
    color: '#666',
    fontWeight: '600',
  },
  toggleTextActive: {
    color: 'white',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
    backgroundColor: '#f9f9f9',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  createButton: {
    backgroundColor: '#00a859',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  createButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});