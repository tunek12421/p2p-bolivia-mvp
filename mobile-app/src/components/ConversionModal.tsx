import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { walletService } from '../services/api';
import { fetchMarketRates, MarketRates, getRateForPair } from '../services/marketRates';

interface ConversionModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  fromCurrency: string;
  toCurrency: string;
  availableBalance: number;
}


export default function ConversionModal({
  visible,
  onClose,
  onSuccess,
  fromCurrency,
  toCurrency,
  availableBalance,
}: ConversionModalProps) {
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [rates, setRates] = useState<MarketRates | null>(null);
  const [loadingRates, setLoadingRates] = useState(false);

  useEffect(() => {
    if (visible) {
      fetchRates();
      setFromAmount('');
      setToAmount('');
    }
  }, [visible]);

  const fetchRates = async () => {
    setLoadingRates(true);
    try {
      const marketRates = await fetchMarketRates();
      setRates(marketRates);
    } catch (error) {
      console.error('Error fetching rates:', error);
      Alert.alert('Error', 'No se pudieron cargar las tasas de cambio');
    } finally {
      setLoadingRates(false);
    }
  };

  const getConversionRate = (): number => {
    if (!rates) return 0;
    return getRateForPair(rates, fromCurrency, toCurrency);
  };

  const handleFromAmountChange = (value: string) => {
    setFromAmount(value);
    const amount = parseFloat(value) || 0;
    const rate = getConversionRate();
    const converted = amount * rate;
    setToAmount(converted.toFixed(fromCurrency === 'BOB' ? 4 : 2));
  };

  const handleToAmountChange = (value: string) => {
    setToAmount(value);
    const amount = parseFloat(value) || 0;
    const rate = getConversionRate();
    const converted = amount / rate;
    setFromAmount(converted.toFixed(fromCurrency === 'BOB' ? 2 : 4));
  };

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'BOB': return 'Bs.';
      case 'USD': return '$';
      case 'USDT': return 'USDT';
      default: return currency;
    }
  };

  const handleConversion = async () => {
    const fromAmountNum = parseFloat(fromAmount);
    const toAmountNum = parseFloat(toAmount);

    if (!fromAmountNum || fromAmountNum <= 0) {
      Alert.alert('Error', 'Ingresa un monto válido');
      return;
    }

    if (fromAmountNum > availableBalance) {
      Alert.alert('Error', 'Monto excede el balance disponible');
      return;
    }

    const minAmount = fromCurrency === 'BOB' ? 10 : 0.01;
    if (fromAmountNum < minAmount) {
      Alert.alert('Error', `El monto mínimo es ${getCurrencySymbol(fromCurrency)} ${minAmount}`);
      return;
    }

    setLoading(true);
    try {
      await walletService.convertCurrency({
        from_currency: fromCurrency,
        to_currency: toCurrency,
        from_amount: fromAmountNum,
        to_amount: toAmountNum,
        rate: getConversionRate(),
      });

      Alert.alert(
        'Conversión Exitosa',
        `Has convertido ${getCurrencySymbol(fromCurrency)} ${fromAmountNum.toFixed(2)} a ${getCurrencySymbol(toCurrency)} ${toAmountNum.toFixed(4)}`,
        [
          {
            text: 'OK',
            onPress: () => {
              onSuccess();
              onClose();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Conversion error:', error);
      Alert.alert('Error', error.message || 'Error al realizar la conversión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Convertir Moneda</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <View style={styles.conversionCard}>
            <Text style={styles.sectionTitle}>
              Conversión: {fromCurrency} → {toCurrency}
            </Text>
            
            {loadingRates ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#007AFF" />
                <Text style={styles.loadingText}>Cargando tasas...</Text>
              </View>
            ) : (
              <Text style={styles.rateText}>
                Tasa: 1 {fromCurrency} = {getConversionRate().toFixed(6)} {toCurrency}
              </Text>
            )}
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Monto a convertir ({fromCurrency})</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={fromAmount}
                onChangeText={handleFromAmountChange}
                placeholder={`0.00 ${fromCurrency}`}
                keyboardType="numeric"
                editable={!loadingRates}
              />
              <Text style={styles.currencyLabel}>{getCurrencySymbol(fromCurrency)}</Text>
            </View>
            <Text style={styles.balanceText}>
              Disponible: {getCurrencySymbol(fromCurrency)} {availableBalance.toFixed(2)}
            </Text>
          </View>

          <View style={styles.arrowContainer}>
            <Ionicons name="arrow-down" size={24} color="#007AFF" />
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Recibirás ({toCurrency})</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={toAmount}
                onChangeText={handleToAmountChange}
                placeholder={`0.00 ${toCurrency}`}
                keyboardType="numeric"
                editable={!loadingRates}
              />
              <Text style={styles.currencyLabel}>{getCurrencySymbol(toCurrency)}</Text>
            </View>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Resumen de conversión</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Envías:</Text>
              <Text style={styles.summaryValue}>
                {getCurrencySymbol(fromCurrency)} {parseFloat(fromAmount || '0').toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Recibes:</Text>
              <Text style={styles.summaryValue}>
                {getCurrencySymbol(toCurrency)} {parseFloat(toAmount || '0').toFixed(4)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tasa:</Text>
              <Text style={styles.summaryValue}>{getConversionRate().toFixed(6)}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.convertButton,
              (!fromAmount || loading || loadingRates) && styles.convertButtonDisabled,
            ]}
            onPress={handleConversion}
            disabled={!fromAmount || loading || loadingRates}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.convertButtonText}>Convertir</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E7',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  conversionCard: {
    backgroundColor: '#F0F9FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0F2FE',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0369A1',
    marginBottom: 8,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    marginLeft: 8,
    color: '#0369A1',
    fontSize: 14,
  },
  rateText: {
    fontSize: 14,
    color: '#0369A1',
  },
  inputSection: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#000',
  },
  currencyLabel: {
    paddingRight: 12,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  balanceText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  arrowContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  summaryCard: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  convertButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  convertButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  convertButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});