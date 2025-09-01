import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { walletService } from '../services/api';
import ConversionModal from '../components/ConversionModal';

interface WalletScreenProps {
  navigation: any;
}

interface WalletBalance {
  currency: string;
  balance: string | number;
  locked_balance: string | number;
}

interface Transaction {
  id: string;
  type: string;
  amount: string | number;
  currency: string;
  status: string;
  created_at: string;
  description?: string;
}

export default function WalletScreen({ navigation }: WalletScreenProps) {
  const [wallets, setWallets] = useState<WalletBalance[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [conversionModalVisible, setConversionModalVisible] = useState(false);
  const [selectedConversion, setSelectedConversion] = useState<{
    from: string;
    to: string;
    availableBalance: number;
  } | null>(null);

  const fetchWalletData = async () => {
    try {
      const [walletsResponse, transactionsResponse] = await Promise.allSettled([
        walletService.getWallets(),
        walletService.getTransactions({ limit: 10 })
      ]);

      if (walletsResponse.status === 'fulfilled') {
        setWallets(walletsResponse.value.data?.wallets || []);
      }

      if (transactionsResponse.status === 'fulfilled') {
        setRecentTransactions(transactionsResponse.value.data?.transactions || []);
      }
    } catch (error) {
      console.error('Error fetching wallet data:', error);
      Alert.alert('Error', 'No se pudieron cargar los datos de la billetera');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWalletData();
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

  const getTotalBalance = () => {
    return wallets.reduce((total, wallet) => {
      let balanceInUSD = typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance;
      if (wallet.currency === 'BOB') {
        balanceInUSD = balanceInUSD / 6.9;
      }
      return total + balanceInUSD;
    }, 0);
  };

  const getAvailableBalance = (wallet: WalletBalance) => {
    const balance = typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance;
    const locked = typeof wallet.locked_balance === 'string' ? parseFloat(wallet.locked_balance) : wallet.locked_balance;
    return balance - locked;
  };

  const handleConvertClick = (fromCurrency: string, toCurrency: string) => {
    const fromWallet = wallets.find(w => w.currency === fromCurrency);
    if (!fromWallet) {
      Alert.alert('Error', `No tienes billetera de ${fromCurrency}`);
      return;
    }

    const availableBalance = getAvailableBalance(fromWallet);
    if (availableBalance <= 0) {
      Alert.alert('Error', `No tienes fondos disponibles en ${fromCurrency}`);
      return;
    }

    setSelectedConversion({
      from: fromCurrency,
      to: toCurrency,
      availableBalance,
    });
    setConversionModalVisible(true);
  };

  const handleConversionSuccess = () => {
    fetchWalletData();
  };

  const getConversionOptions = (currency: string) => {
    const options = [];
    if (currency === 'BOB') {
      options.push({ target: 'USD', label: 'BOB → USD' });
      options.push({ target: 'USDT', label: 'BOB → USDT' });
    } else if (currency === 'USD') {
      options.push({ target: 'BOB', label: 'USD → BOB' });
      options.push({ target: 'USDT', label: 'USD → USDT' });
    } else if (currency === 'USDT') {
      options.push({ target: 'BOB', label: 'USDT → BOB' });
      options.push({ target: 'USD', label: 'USDT → USD' });
    }
    return options;
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
      default:
        return { text: status, color: '#666', bg: '#f5f5f5' };
    }
  };

  const handleDeposit = () => {
    Alert.alert(
      'Depositar Fondos',
      '¿Qué método prefieres?',
      [
        { text: 'Transferencia Bancaria', onPress: () => console.log('Bank transfer') },
        { text: 'Código QR', onPress: () => console.log('QR deposit') },
        { text: 'Cancelar', style: 'cancel' }
      ]
    );
  };

  const handleWithdraw = () => {
    if (getTotalBalance() <= 0) {
      Alert.alert('Sin fondos', 'No tienes fondos suficientes para retirar');
      return;
    }
    Alert.alert('Retirar Fondos', 'Función de retiro próximamente disponible');
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Cargando billetera...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Mi Billetera</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh" size={24} color="#00a859" />
        </TouchableOpacity>
      </View>

      {/* Balance Total */}
      <View style={styles.totalBalanceCard}>
        <Text style={styles.balanceLabel}>Balance Total (aprox. USD)</Text>
        <Text style={styles.totalBalance}>
          ${getTotalBalance().toFixed(2)}
        </Text>
        <View style={styles.balanceActions}>
          <TouchableOpacity style={styles.actionButton} onPress={handleDeposit}>
            <Ionicons name="add-circle" size={20} color="white" />
            <Text style={styles.actionText}>Depositar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionButton, styles.withdrawButton]} onPress={handleWithdraw}>
            <Ionicons name="remove-circle" size={20} color="white" />
            <Text style={styles.actionText}>Retirar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Billeteras */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tus Billeteras</Text>
        {wallets.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="wallet-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No tienes billeteras configuradas</Text>
            <Text style={styles.emptySubtext}>
              Las billeteras se crean automáticamente con tu primera transacción
            </Text>
          </View>
        ) : (
          wallets.map((wallet) => {
            const balance = typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance;
            const lockedBalance = typeof wallet.locked_balance === 'string' ? parseFloat(wallet.locked_balance) : wallet.locked_balance;
            const availableBalance = balance - lockedBalance;

            return (
              <View key={wallet.currency} style={styles.walletCard}>
                <View style={styles.walletHeader}>
                  <View style={styles.currencyIcon}>
                    <Text style={styles.currencyText}>{wallet.currency}</Text>
                  </View>
                  <View style={styles.walletInfo}>
                    <Text style={styles.walletCurrency}>{wallet.currency}</Text>
                    <Text style={styles.walletType}>Billetera Digital</Text>
                  </View>
                </View>
                
                <View style={styles.balanceSection}>
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceRowLabel}>Disponible:</Text>
                    <Text style={styles.balanceRowValue}>
                      {formatCurrency(availableBalance, wallet.currency)}
                    </Text>
                  </View>
                  
                  {lockedBalance > 0 && (
                    <View style={styles.balanceRow}>
                      <Text style={styles.balanceRowLabel}>Bloqueado:</Text>
                      <Text style={[styles.balanceRowValue, { color: '#ff8c00' }]}>
                        {formatCurrency(lockedBalance, wallet.currency)}
                      </Text>
                    </View>
                  )}
                  
                  <View style={[styles.balanceRow, styles.totalRow]}>
                    <Text style={styles.totalLabel}>Total:</Text>
                    <Text style={styles.totalValue}>
                      {formatCurrency(balance, wallet.currency)}
                    </Text>
                  </View>
                </View>

                <View style={styles.walletActions}>
                  <TouchableOpacity style={styles.walletActionButton} onPress={handleDeposit}>
                    <Ionicons name="arrow-down" size={16} color="#00a859" />
                    <Text style={styles.walletActionText}>Depositar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.walletActionButton, availableBalance <= 0 && styles.disabledButton]} 
                    onPress={handleWithdraw}
                    disabled={availableBalance <= 0}
                  >
                    <Ionicons name="arrow-up" size={16} color={availableBalance <= 0 ? '#ccc' : '#00a859'} />
                    <Text style={[styles.walletActionText, availableBalance <= 0 && { color: '#ccc' }]}>Retirar</Text>
                  </TouchableOpacity>
                </View>

                {/* Conversion Options */}
                {getConversionOptions(wallet.currency).length > 0 && availableBalance > 0 && (
                  <View style={styles.conversionSection}>
                    <Text style={styles.conversionTitle}>Conversiones disponibles:</Text>
                    <View style={styles.conversionButtons}>
                      {getConversionOptions(wallet.currency).map((option) => (
                        <TouchableOpacity
                          key={option.target}
                          style={styles.conversionButton}
                          onPress={() => handleConvertClick(wallet.currency, option.target)}
                        >
                          <Ionicons name="swap-horizontal" size={16} color="#007AFF" />
                          <Text style={styles.conversionButtonText}>{option.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Transacciones Recientes */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transacciones Recientes</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Transactions')}>
            <Text style={styles.linkText}>Ver Todas</Text>
          </TouchableOpacity>
        </View>
        
        {recentTransactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No hay transacciones recientes</Text>
          </View>
        ) : (
          <View style={styles.transactionsList}>
            {recentTransactions.slice(0, 5).map((transaction) => {
              const statusInfo = getStatusBadge(transaction.status);
              const amount = typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : transaction.amount;
              
              return (
                <View key={transaction.id} style={styles.transactionItem}>
                  <View style={styles.transactionLeft}>
                    <View style={[styles.transactionIcon, { backgroundColor: getTransactionTypeColor(transaction.type) + '20' }]}>
                      <Ionicons 
                        name={getTransactionTypeIcon(transaction.type) as any} 
                        size={20} 
                        color={getTransactionTypeColor(transaction.type)} 
                      />
                    </View>
                    <View style={styles.transactionDetails}>
                      <Text style={styles.transactionType}>
                        {getTransactionTypeName(transaction.type)}
                      </Text>
                      <Text style={styles.transactionDate}>
                        {new Date(transaction.created_at).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
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
              );
            })}
          </View>
        )}
      </View>

      {/* Acciones Rápidas */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickActionCard} onPress={handleDeposit}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#e6f7ed' }]}>
            <Ionicons name="add-circle" size={24} color="#00a859" />
          </View>
          <Text style={styles.quickActionTitle}>Depositar</Text>
          <Text style={styles.quickActionSubtitle}>Transferencia o QR</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.quickActionCard} onPress={handleWithdraw}>
          <View style={[styles.quickActionIcon, { backgroundColor: '#ffe6e6' }]}>
            <Ionicons name="remove-circle" size={24} color="#ff6b6b" />
          </View>
          <Text style={styles.quickActionTitle}>Retirar</Text>
          <Text style={styles.quickActionSubtitle}>Transferencia bancaria</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.quickActionCard} 
          onPress={() => navigation.navigate('P2P')}
        >
          <View style={[styles.quickActionIcon, { backgroundColor: '#e6f3ff' }]}>
            <Ionicons name="swap-horizontal" size={24} color="#0066cc" />
          </View>
          <Text style={styles.quickActionTitle}>Trading</Text>
          <Text style={styles.quickActionSubtitle}>Usar fondos para P2P</Text>
        </TouchableOpacity>
      </View>

      {/* Conversion Modal */}
      {selectedConversion && (
        <ConversionModal
          visible={conversionModalVisible}
          onClose={() => {
            setConversionModalVisible(false);
            setSelectedConversion(null);
          }}
          onSuccess={handleConversionSuccess}
          fromCurrency={selectedConversion.from}
          toCurrency={selectedConversion.to}
          availableBalance={selectedConversion.availableBalance}
        />
      )}
    </ScrollView>
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
  totalBalanceCard: {
    backgroundColor: '#00a859',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginBottom: 8,
  },
  totalBalance: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  balanceActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 12,
    borderRadius: 8,
    minWidth: 120,
    justifyContent: 'center',
  },
  withdrawButton: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  actionText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '600',
  },
  section: {
    margin: 16,
    marginTop: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  linkText: {
    color: '#00a859',
    fontSize: 14,
  },
  emptyState: {
    backgroundColor: 'white',
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
  },
  walletCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  currencyIcon: {
    width: 48,
    height: 48,
    backgroundColor: '#e6f7ed',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currencyText: {
    color: '#00a859',
    fontWeight: 'bold',
    fontSize: 14,
  },
  walletInfo: {
    marginLeft: 12,
  },
  walletCurrency: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  walletType: {
    fontSize: 14,
    color: '#666',
  },
  balanceSection: {
    marginBottom: 16,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  balanceRowLabel: {
    fontSize: 14,
    color: '#666',
  },
  balanceRowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  walletActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  walletActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#00a859',
    minWidth: 100,
    justifyContent: 'center',
  },
  disabledButton: {
    borderColor: '#ccc',
  },
  walletActionText: {
    color: '#00a859',
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '600',
  },
  transactionsList: {
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
  },
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionDetails: {
    marginLeft: 12,
  },
  transactionType: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  transactionDate: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '500',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    margin: 16,
    marginTop: 0,
  },
  quickActionCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  quickActionSubtitle: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  conversionSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  conversionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  conversionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  conversionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  conversionButtonText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
});