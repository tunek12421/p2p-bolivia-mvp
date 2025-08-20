import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { walletService } from '../services/api';

interface DashboardScreenProps {
  navigation: any;
}

interface DashboardData {
  balance: number;
  recent_transactions: any[];
  kyc_status: {
    level: number;
    verified: boolean;
  };
  active_orders: any[];
}

export default function DashboardScreen({ navigation }: DashboardScreenProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboardData = async () => {
    try {
      const [balanceResponse, kycResponse] = await Promise.all([
        walletService.getBalance(),
        // Add KYC status call when implemented
      ]);

      setData({
        balance: balanceResponse.balance || 0,
        recent_transactions: [],
        kyc_status: {
          level: 0,
          verified: false,
        },
        active_orders: [],
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setData({
        balance: 0,
        recent_transactions: [],
        kyc_status: {
          level: 0,
          verified: false,
        },
        active_orders: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text>Cargando...</Text>
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
        <Text style={styles.title}>Dashboard</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Ionicons name="person-circle" size={32} color="#00a859" />
        </TouchableOpacity>
      </View>

      {/* Balance Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Balance Total</Text>
        <Text style={styles.balance}>
          {data?.balance?.toFixed(2)} BOB
        </Text>
        <View style={styles.balanceActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Wallet')}
          >
            <Ionicons name="wallet" size={20} color="white" />
            <Text style={styles.actionText}>Wallet</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('P2P')}
          >
            <Ionicons name="swap-horizontal" size={20} color="white" />
            <Text style={styles.actionText}>Intercambiar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* KYC Status */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Estado KYC</Text>
          <TouchableOpacity onPress={() => navigation.navigate('KYC')}>
            <Text style={styles.linkText}>Ver detalles</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.kycStatus}>
          <Ionicons
            name={data?.kyc_status.verified ? "checkmark-circle" : "alert-circle"}
            size={24}
            color={data?.kyc_status.verified ? "#00a859" : "#ff6b6b"}
          />
          <Text style={styles.kycText}>
            Nivel {data?.kyc_status.level} - {data?.kyc_status.verified ? 'Verificado' : 'Pendiente'}
          </Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Acciones Rápidas</Text>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('P2P')}
          >
            <Ionicons name="add-circle" size={32} color="#00a859" />
            <Text style={styles.quickActionText}>Crear Orden</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('Chat')}
          >
            <Ionicons name="chatbubble-ellipses" size={32} color="#00a859" />
            <Text style={styles.quickActionText}>Mensajes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.quickAction}
            onPress={() => navigation.navigate('KYC')}
          >
            <Ionicons name="document-text" size={32} color="#00a859" />
            <Text style={styles.quickActionText}>KYC</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Recent Activity */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Actividad Reciente</Text>
        {data?.recent_transactions.length === 0 ? (
          <Text style={styles.emptyText}>No hay transacciones recientes</Text>
        ) : (
          data?.recent_transactions.map((tx, index) => (
            <View key={index} style={styles.transactionItem}>
              <Text>{tx.description}</Text>
            </View>
          ))
        )}
      </View>
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
  card: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  balance: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#00a859',
    textAlign: 'center',
    marginBottom: 20,
  },
  balanceActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00a859',
    padding: 12,
    borderRadius: 8,
    minWidth: 100,
    justifyContent: 'center',
  },
  actionText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: '600',
  },
  kycStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kycText: {
    marginLeft: 8,
    fontSize: 16,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  quickAction: {
    alignItems: 'center',
    padding: 12,
  },
  quickActionText: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
  },
  linkText: {
    color: '#00a859',
    fontSize: 14,
  },
  emptyText: {
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  transactionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});