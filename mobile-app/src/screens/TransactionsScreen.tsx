import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { walletService, Transaction } from '../services/api';

interface TransactionsScreenProps {
  navigation: any;
}

export default function TransactionsScreen({ navigation }: TransactionsScreenProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'DEPOSIT' | 'WITHDRAWAL'>('ALL');
  const [search, setSearch] = useState('');

  const fetchTransactions = async () => {
    try {
      const response = await walletService.getTransactions({ limit: 100 });
      setTransactions(response.data?.transactions || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTransactions();
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

  const getTransactionTypeIcon = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
      case 'TRANSFER_IN':
        return 'arrow-down-circle';
      case 'WITHDRAWAL':
      case 'TRANSFER_OUT':
        return 'arrow-up-circle';
      case 'FEE':
        return 'card-outline';
      default:
        return 'time-outline';
    }
  };

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
      case 'TRANSFER_IN':
        return '#00a859';
      case 'WITHDRAWAL':
      case 'TRANSFER_OUT':
        return '#ff6b6b';
      default:
        return '#666';
    }
  };

  const getTransactionTypeName = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
        return 'Depósito';
      case 'WITHDRAWAL':
        return 'Retiro';
      case 'TRANSFER_IN':
        return 'Transferencia Recibida';
      case 'TRANSFER_OUT':
        return 'Transferencia Enviada';
      case 'FEE':
        return 'Comisión';
      default:
        return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return { text: 'Completada', color: '#00a859', bg: '#e6f7ed' };
      case 'PENDING':
        return { text: 'Pendiente', color: '#ff8c00', bg: '#fff4e6' };
      case 'FAILED':
        return { text: 'Fallida', color: '#ff6b6b', bg: '#ffe6e6' };
      case 'CANCELLED':
        return { text: 'Cancelada', color: '#ff6b6b', bg: '#ffe6e6' };
      default:
        return { text: status, color: '#666', bg: '#f5f5f5' };
    }
  };

  const filteredTransactions = transactions.filter(transaction => {
    if (filter !== 'ALL' && transaction.type !== filter) return false;
    if (search) {
      const searchTerm = search.toLowerCase();
      return (
        transaction.currency.toLowerCase().includes(searchTerm) ||
        transaction.id.toLowerCase().includes(searchTerm) ||
        getTransactionTypeName(transaction.type).toLowerCase().includes(searchTerm)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Cargando transacciones...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Todas las Transacciones</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Filters */}
      <View style={styles.filtersContainer}>
        <View style={styles.filterTabs}>
          {['ALL', 'DEPOSIT', 'WITHDRAWAL'].map((filterType) => (
            <TouchableOpacity
              key={filterType}
              style={[
                styles.filterTab,
                filter === filterType && styles.activeFilterTab
              ]}
              onPress={() => setFilter(filterType as any)}
            >
              <Text style={[
                styles.filterTabText,
                filter === filterType && styles.activeFilterTabText
              ]}>
                {filterType === 'ALL' ? 'Todas' : 
                 filterType === 'DEPOSIT' ? 'Depósitos' : 'Retiros'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar transacciones..."
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {/* Transactions List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="receipt-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No hay transacciones</Text>
            <Text style={styles.emptySubtext}>
              No se encontraron transacciones que coincidan con tus filtros
            </Text>
          </View>
        ) : (
          <View style={styles.transactionsList}>
            {filteredTransactions.map((transaction) => {
              const statusInfo = getStatusBadge(transaction.status);
              const amount = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : transaction.amount;
              
              return (
                <View key={transaction.id} style={styles.transactionCard}>
                  <View style={styles.transactionHeader}>
                    <View style={styles.transactionLeft}>
                      <View style={[styles.transactionIcon, { 
                        backgroundColor: getTransactionTypeColor(transaction.type) + '20' 
                      }]}>
                        <Ionicons 
                          name={getTransactionTypeIcon(transaction.type) as any} 
                          size={24} 
                          color={getTransactionTypeColor(transaction.type)} 
                        />
                      </View>
                      <View style={styles.transactionDetails}>
                        <Text style={styles.transactionType}>
                          {getTransactionTypeName(transaction.type)}
                        </Text>
                        <Text style={styles.transactionId}>
                          ID: {transaction.id.slice(0, 8)}...
                        </Text>
                        <Text style={styles.transactionDate}>
                          {new Date(transaction.created_at).toLocaleDateString('es-ES', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Text>
                      </View>
                    </View>
                    
                    <View style={styles.transactionRight}>
                      <Text style={[styles.transactionAmount, { 
                        color: transaction.type === 'DEPOSIT' || transaction.type === 'TRANSFER_IN' 
                          ? '#00a859' : '#ff6b6b' 
                      }]}>
                        {(transaction.type === 'DEPOSIT' || transaction.type === 'TRANSFER_IN') ? '+' : '-'}
                        {formatCurrency(Math.abs(amount), transaction.currency)}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                        <Text style={[styles.statusText, { color: statusInfo.color }]}>
                          {statusInfo.text}
                        </Text>
                      </View>
                    </View>
                  </View>
                  
                  {transaction.description && (
                    <View style={styles.transactionDescription}>
                      <Text style={styles.descriptionText}>{transaction.description}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Summary Stats */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total de Transacciones:</Text>
          <Text style={styles.summaryValue}>{filteredTransactions.length}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Completadas:</Text>
          <Text style={styles.summaryValue}>
            {filteredTransactions.filter(t => t.status === 'COMPLETED').length}
          </Text>
        </View>
      </View>
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
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  filtersContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterTabs: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeFilterTab: {
    backgroundColor: '#00a859',
  },
  filterTabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeFilterTabText: {
    color: 'white',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
  },
  content: {
    flex: 1,
  },
  emptyState: {
    padding: 60,
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
  },
  transactionsList: {
    padding: 16,
  },
  transactionCard: {
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
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  transactionId: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  transactionDescription: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  descriptionText: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  summaryContainer: {
    backgroundColor: 'white',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
});