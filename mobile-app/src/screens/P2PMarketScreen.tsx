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
}

interface MarketRates {
  USD_BOB: number;
  USDT_BOB: number;
  USD_USDT: number;
  lastUpdated: string;
}

export default function P2PMarketScreen({ navigation }: any) {
  const [orders, setOrders] = useState<P2POrder[]>([]);
  const [marketRates, setMarketRates] = useState<MarketRates | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'buy' | 'sell'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const [filters, setFilters] = useState({
    currency_from: '',
    currency_to: '',
  });

  const [newOrder, setNewOrder] = useState({
    type: 'BUY' as 'BUY' | 'SELL',
    currency_from: 'USD',
    currency_to: 'BOB',
    amount: '',
    rate: '',
    min_amount: '',
    max_amount: '',
    payment_method: 'BANK_TRANSFER',
  });

  const fetchTradeData = async () => {
    try {
      const params = {
        ...(filters.currency_from && { currency_from: filters.currency_from }),
        ...(filters.currency_to && { currency_to: filters.currency_to }),
        limit: 50
      };

      const [ordersRes, ratesRes] = await Promise.allSettled([
        p2pService.getOrders(params),
        fetchMarketRates()
      ]);

      if (ordersRes.status === 'fulfilled') {
        setOrders(ordersRes.value.data?.orders || []);
      }

      if (ratesRes.status === 'fulfilled') {
        setMarketRates(ratesRes.value);
      }
    } catch (error: any) {
      console.error('Error fetching trade data:', error);
      
      // Enhanced error logging like web console
      const errorDetails = {
        message: error?.message || 'Unknown error',
        status: error?.status || 'Unknown',
        statusText: error?.statusText || 'Unknown',
        data: error?.data || 'No data',
        url: error?.url || '/api/v1/orders',
        method: error?.method || 'GET',
        baseURL: error?.baseURL || 'Unknown',
        originalError: error
      };
      
      console.log('📋 P2P MARKET ERROR DETAILS:');
      console.log('  Message:', errorDetails.message);
      console.log('  Status:', errorDetails.status);
      console.log('  Status Text:', errorDetails.statusText);
      console.log('  Data:', JSON.stringify(errorDetails.data, null, 2));
      console.log('  URL:', errorDetails.url);
      console.log('  Full Error Object:', JSON.stringify(error, null, 2));
    } finally {
      setLoading(false);
    }
  };

  const fetchMarketRates = async (): Promise<MarketRates> => {
    // Simulamos la obtención de tasas de mercado
    // En un caso real, esto vendría de una API externa como Binance P2P
    return {
      USD_BOB: 6.89,
      USDT_BOB: 6.91,
      USD_USDT: 1.003,
      lastUpdated: new Date().toISOString()
    };
  };

  useEffect(() => {
    fetchTradeData();
    // Auto-refresh cada 2 minutos
    const interval = setInterval(fetchTradeData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [filters]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTradeData();
    setRefreshing(false);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return { text: 'Pendiente', color: '#ff8c00', bg: '#fff4e6' };
      case 'MATCHED':
        return { text: 'Emparejada', color: '#0066cc', bg: '#e6f3ff' };
      case 'PROCESSING':
        return { text: 'Procesando', color: '#8b5cf6', bg: '#f3e8ff' };
      case 'COMPLETED':
        return { text: 'Completada', color: '#00a859', bg: '#e6f7ed' };
      case 'ACTIVE':
        return { text: 'Activa', color: '#0066cc', bg: '#e6f3ff' };
      case 'FILLED':
        return { text: 'Completada', color: '#00a859', bg: '#e6f7ed' };
      case 'CANCELLED':
        return { text: 'Cancelada', color: '#ff6b6b', bg: '#ffe6e6' };
      case 'PARTIAL':
        return { text: 'Parcial', color: '#ff8c00', bg: '#fff4e6' };
      case 'EXPIRED':
        return { text: 'Expirada', color: '#666', bg: '#f5f5f5' };
      default:
        return { text: status, color: '#666', bg: '#f5f5f5' };
    }
  };

  const handleCreateOrder = async () => {
    if (!newOrder.amount || !newOrder.rate || !newOrder.min_amount || !newOrder.max_amount) {
      Alert.alert('Error', 'Por favor completa todos los campos requeridos');
      return;
    }

    try {
      await p2pService.createOrder({
        type: newOrder.type,
        currency_from: newOrder.currency_from,
        currency_to: newOrder.currency_to,
        amount: parseFloat(newOrder.amount),
        rate: parseFloat(newOrder.rate),
        min_amount: parseFloat(newOrder.min_amount),
        max_amount: parseFloat(newOrder.max_amount),
        payment_methods: [newOrder.payment_method],
      });

      setShowCreateModal(false);
      resetNewOrder();
      Alert.alert('Éxito', 'Orden creada exitosamente');
      await fetchTradeData();
    } catch (error: any) {
      console.error('Error creating order:', error);
      
      // Enhanced error logging
      const errorDetails = {
        message: error?.message || 'Unknown error',
        status: error?.status || 'Unknown',
        statusText: error?.statusText || 'Unknown',
        data: error?.data || 'No data',
        url: error?.url || '/api/v1/orders',
        method: error?.method || 'POST',
        originalError: error
      };
      
      console.log('📋 CREATE ORDER ERROR DETAILS:');
      console.log('  Message:', errorDetails.message);
      console.log('  Status:', errorDetails.status);
      console.log('  Data:', JSON.stringify(errorDetails.data, null, 2));
      
      const errorMessage = `Error ${errorDetails.status}: ${errorDetails.message}\n\nDetalles: ${JSON.stringify(errorDetails.data)}`;
      Alert.alert('Error Creando Orden', errorMessage);
    }
  };

  const resetNewOrder = () => {
    setNewOrder({
      type: 'BUY',
      currency_from: 'USD',
      currency_to: 'BOB',
      amount: '',
      rate: '',
      min_amount: '',
      max_amount: '',
      payment_method: 'BANK_TRANSFER',
    });
  };

  const filteredOrders = orders.filter(order => {
    // Same logic as web: buy tab shows BUY orders, sell tab shows SELL orders
    if (activeTab === 'buy' && order.type !== 'BUY') return false;
    if (activeTab === 'sell' && order.type !== 'SELL') return false;
    if (searchFilter) {
      const searchTerm = searchFilter.toLowerCase();
      return (
        order.currency_from.toLowerCase().includes(searchTerm) ||
        order.currency_to.toLowerCase().includes(searchTerm) ||
        order.id.toLowerCase().includes(searchTerm)
      );
    }
    return true;
  });

  const formatIntuitiveRate = (fromCurrency: string, toCurrency: string, rate: number) => {
    if (fromCurrency === 'USD' && toCurrency === 'BOB') {
      return `1 USD = ${rate.toFixed(2)} BOB`;
    } else if (fromCurrency === 'USDT' && toCurrency === 'BOB') {
      return `1 USDT = ${rate.toFixed(2)} BOB`;
    } else if (fromCurrency === 'USD' && toCurrency === 'USDT') {
      return `1 USD = ${rate.toFixed(4)} USDT`;
    }
    return `${rate.toFixed(4)}`;
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Cargando mercado P2P...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          onPress={() => navigation.navigate('UserOrders')}
          style={styles.myOrdersButton}
        >
          <Ionicons name="document-text" size={20} color="#0066cc" />
          <Text style={styles.myOrdersButtonText}>Mis Órdenes</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Centro de Trading</Text>
        <TouchableOpacity onPress={() => setShowCreateModal(true)}>
          <Ionicons name="add-circle" size={32} color="#00a859" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Market Rates Card */}
        <View style={styles.marketRatesCard}>
          <View style={styles.marketRatesHeader}>
            <Text style={styles.marketRatesTitle}>Tasas de Mercado en Tiempo Real</Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>En vivo</Text>
            </View>
          </View>
          <Text style={styles.marketRatesSubtitle}>Datos reales de Binance P2P Bolivia</Text>
          
          {marketRates ? (
            <View style={styles.ratesGrid}>
              <View style={[styles.rateCard, styles.highlightedRate]}>
                <Text style={styles.rateCardIcon}>💵🇧🇴</Text>
                <Text style={styles.rateCardTitle}>Dólar Paralelo</Text>
                <Text style={styles.rateCardValue}>
                  {formatIntuitiveRate('USD', 'BOB', marketRates.USD_BOB)}
                </Text>
                <Text style={styles.rateCardExample}>
                  100 USD = {(marketRates.USD_BOB * 100).toFixed(0)} BOB
                </Text>
              </View>

              <View style={styles.rateCard}>
                <Text style={styles.rateCardIcon}>₮🇧🇴</Text>
                <Text style={styles.rateCardTitle}>USDT a BOB</Text>
                <Text style={styles.rateCardValue}>
                  {formatIntuitiveRate('USDT', 'BOB', marketRates.USDT_BOB)}
                </Text>
                <Text style={styles.rateCardExample}>
                  100 USDT = {(marketRates.USDT_BOB * 100).toFixed(0)} BOB
                </Text>
              </View>

              <View style={styles.rateCard}>
                <Text style={styles.rateCardIcon}>💵₮</Text>
                <Text style={styles.rateCardTitle}>USD a USDT</Text>
                <Text style={styles.rateCardValue}>
                  {formatIntuitiveRate('USD', 'USDT', marketRates.USD_USDT)}
                </Text>
                <Text style={styles.rateCardExample}>
                  100 USD = {(marketRates.USD_USDT * 100).toFixed(2)} USDT
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.ratesLoading}>
              <Text style={styles.ratesLoadingText}>Cargando tasas...</Text>
            </View>
          )}
        </View>

        {/* Search and Filters */}
        <View style={styles.filtersCard}>
          <View style={styles.tabsContainer}>
            {[
              { key: 'all', label: 'Todas' },
              { key: 'buy', label: 'Compra' },
              { key: 'sell', label: 'Venta' }
            ].map(tab => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.activeTab]}
                onPress={() => setActiveTab(tab.key as any)}
              >
                <Text style={[styles.tabText, activeTab === tab.key && styles.activeTabText]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar órdenes..."
              value={searchFilter}
              onChangeText={setSearchFilter}
            />
          </View>

          <View style={styles.currencyFilters}>
            <View style={styles.filterSelect}>
              <Text style={styles.filterLabel}>Desde:</Text>
              <TouchableOpacity
                style={styles.filterButton}
                onPress={() => {
                  // Aquí podrías abrir un modal de selección
                  Alert.alert('Filtrar', 'Funcionalidad de filtrado próximamente');
                }}
              >
                <Text style={styles.filterButtonText}>
                  {filters.currency_from || 'Todas'}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.filterSelect}>
              <Text style={styles.filterLabel}>Hacia:</Text>
              <TouchableOpacity
                style={styles.filterButton}
                onPress={() => {
                  Alert.alert('Filtrar', 'Funcionalidad de filtrado próximamente');
                }}
              >
                <Text style={styles.filterButtonText}>
                  {filters.currency_to || 'Todas'}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#666" />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Orders List */}
        {filteredOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="bar-chart-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No hay órdenes disponibles</Text>
            <Text style={styles.emptySubtext}>
              No se encontraron órdenes que coincidan con tus filtros
            </Text>
            <TouchableOpacity 
              style={styles.createFirstOrderButton} 
              onPress={() => setShowCreateModal(true)}
            >
              <Ionicons name="add" size={20} color="white" />
              <Text style={styles.createFirstOrderText}>Crear Primera Orden</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.ordersList}>
            {filteredOrders.map((order) => {
              const statusInfo = getStatusBadge(order.status);
              return (
                <View key={order.id} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <View style={styles.orderUser}>
                      <View style={styles.userAvatar}>
                        <Text style={styles.userAvatarText}>
                          {order.user_id.slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.userText}>
                        {order.user_id.slice(0, 8)}...
                      </Text>
                    </View>
                    <View style={[styles.typeTag, {
                      backgroundColor: order.type === 'BUY' ? '#00a859' : '#ff6b6b'
                    }]}>
                      <Text style={styles.typeText}>
                        {order.type === 'BUY' ? 'Compra' : 'Venta'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.orderDetails}>
                    <Text style={styles.currencyPair}>
                      {order.currency_from}/{order.currency_to}
                    </Text>
                    
                    <View style={styles.orderInfo}>
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Cantidad:</Text>
                        <Text style={styles.infoValue}>
                          {formatCurrency(order.remaining_amount, order.currency_from)}
                        </Text>
                      </View>
                      <Text style={styles.infoSubtext}>
                        de {formatCurrency(order.amount, order.currency_from)}
                      </Text>
                      
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
                    </View>

                    <View style={styles.paymentMethods}>
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
                    <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                      <Text style={[styles.statusText, { color: statusInfo.color }]}>
                        {statusInfo.text}
                      </Text>
                    </View>
                    
                    <View style={styles.actionButtonsContainer}>
                      {/* Action buttons based on order ownership and status */}
                      {['PENDING', 'MATCHED', 'PROCESSING', 'COMPLETED'].includes(order.status) && (
                        <TouchableOpacity style={styles.viewButton}
                          onPress={() => {
                            // TODO: Implement order details modal
                            Alert.alert('Ver Detalles', `Orden ID: ${order.id.slice(0, 8)}...`)
                          }}
                        >
                          <Text style={styles.viewButtonText}>Ver</Text>
                        </TouchableOpacity>
                      )}
                      {order.status === 'ACTIVE' && (
                        <TouchableOpacity style={styles.tradeButton}>
                          <Text style={styles.tradeButtonText}>
                            {order.type === 'BUY' ? 'Vender' : 'Comprar'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.quickStats}>
          <TouchableOpacity 
            style={styles.statCard}
            onPress={() => navigation.navigate('UserOrders')}
          >
            <Ionicons name="document-text" size={24} color="#0066cc" />
            <Text style={styles.statLabel}>Mis Órdenes</Text>
            <Text style={styles.statDescription}>Ver y gestionar</Text>
          </TouchableOpacity>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{orders.filter(o => o.status === 'ACTIVE').length}</Text>
            <Text style={styles.statLabel}>Órdenes Activas</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{orders.filter(o => o.type === 'BUY').length}</Text>
            <Text style={styles.statLabel}>Órdenes de Compra</Text>
          </View>
        </View>
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
                  style={[styles.toggleButton, newOrder.type === 'BUY' && styles.toggleButtonActive]}
                  onPress={() => setNewOrder(prev => ({ ...prev, type: 'BUY' }))}
                >
                  <Text style={[styles.toggleText, newOrder.type === 'BUY' && styles.toggleTextActive]}>
                    Comprar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleButton, newOrder.type === 'SELL' && styles.toggleButtonActive]}
                  onPress={() => setNewOrder(prev => ({ ...prev, type: 'SELL' }))}
                >
                  <Text style={[styles.toggleText, newOrder.type === 'SELL' && styles.toggleTextActive]}>
                    Vender
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Cantidad total"
              value={newOrder.amount}
              onChangeText={(value) => setNewOrder(prev => ({ ...prev, amount: value }))}
              keyboardType="numeric"
            />

            <TextInput
              style={styles.input}
              placeholder="Tasa de cambio"
              value={newOrder.rate}
              onChangeText={(value) => setNewOrder(prev => ({ ...prev, rate: value }))}
              keyboardType="numeric"
            />

            <TextInput
              style={styles.input}
              placeholder="Cantidad mínima"
              value={newOrder.min_amount}
              onChangeText={(value) => setNewOrder(prev => ({ ...prev, min_amount: value }))}
              keyboardType="numeric"
            />

            <TextInput
              style={styles.input}
              placeholder="Cantidad máxima"
              value={newOrder.max_amount}
              onChangeText={(value) => setNewOrder(prev => ({ ...prev, max_amount: value }))}
              keyboardType="numeric"
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
  myOrdersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e6f3ff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  myOrdersButtonText: {
    color: '#0066cc',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  marketRatesCard: {
    backgroundColor: 'white',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  marketRatesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  marketRatesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 8,
    height: 8,
    backgroundColor: '#00a859',
    borderRadius: 4,
    marginRight: 4,
  },
  liveText: {
    fontSize: 12,
    color: '#00a859',
    fontWeight: '500',
  },
  marketRatesSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
  },
  ratesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rateCard: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 2,
    alignItems: 'center',
  },
  highlightedRate: {
    backgroundColor: '#e6f7ed',
    borderWidth: 1,
    borderColor: '#00a859',
  },
  rateCardIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  rateCardTitle: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 4,
  },
  rateCardValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#00a859',
    marginBottom: 4,
    textAlign: 'center',
  },
  rateCardExample: {
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
  },
  ratesLoading: {
    padding: 20,
    alignItems: 'center',
  },
  ratesLoadingText: {
    color: '#666',
    fontSize: 14,
  },
  filtersCard: {
    backgroundColor: 'white',
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#00a859',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: 'white',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
  },
  currencyFilters: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  filterSelect: {
    flex: 1,
    marginHorizontal: 4,
  },
  filterLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#333',
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
    marginTop: 0,
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
  orderUser: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 32,
    height: 32,
    backgroundColor: '#e6f7ed',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  userAvatarText: {
    color: '#00a859',
    fontWeight: 'bold',
    fontSize: 12,
  },
  userText: {
    color: '#666',
    fontSize: 14,
  },
  typeTag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  typeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  orderDetails: {
    marginBottom: 12,
  },
  currencyPair: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  orderInfo: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  infoSubtext: {
    fontSize: 12,
    color: '#999',
    marginLeft: 'auto',
    marginBottom: 8,
  },
  paymentMethods: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
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
  tradeButton: {
    backgroundColor: '#00a859',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  tradeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  viewButton: {
    backgroundColor: '#0066cc',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  viewButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  quickStats: {
    flexDirection: 'row',
    margin: 16,
    marginTop: 0,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00a859',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontWeight: '600',
  },
  statDescription: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    marginTop: 2,
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