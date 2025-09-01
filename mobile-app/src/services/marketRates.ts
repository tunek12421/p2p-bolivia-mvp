import { walletService } from './api';

export interface MarketRates {
  USD_BOB: number;
  BOB_USD: number;
  USD_USDT: number;
  USDT_USD: number;
  timestamp?: string;
}

// Default fallback rates
const DEFAULT_RATES: MarketRates = {
  USD_BOB: 6.90,
  BOB_USD: 0.145,
  USD_USDT: 1.00,
  USDT_USD: 1.00,
};

let cachedRates: MarketRates | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const fetchMarketRates = async (): Promise<MarketRates> => {
  const now = Date.now();
  
  // Return cached rates if they're still fresh
  if (cachedRates && (now - lastFetchTime < CACHE_DURATION)) {
    return cachedRates;
  }

  try {
    const response = await walletService.getExchangeRates();
    
    if (response.rates) {
      cachedRates = {
        USD_BOB: response.rates.USD_BOB || DEFAULT_RATES.USD_BOB,
        BOB_USD: response.rates.BOB_USD || DEFAULT_RATES.BOB_USD,
        USD_USDT: response.rates.USD_USDT || DEFAULT_RATES.USD_USDT,
        USDT_USD: response.rates.USDT_USD || DEFAULT_RATES.USDT_USD,
        timestamp: new Date().toISOString(),
      };
      lastFetchTime = now;
      return cachedRates;
    }
  } catch (error) {
    console.warn('Failed to fetch market rates, using defaults:', error);
  }

  // Fallback to default rates
  cachedRates = { ...DEFAULT_RATES, timestamp: new Date().toISOString() };
  lastFetchTime = now;
  return cachedRates;
};

export const getRateForPair = (rates: MarketRates, from: string, to: string): number => {
  if (from === to) return 1;
  
  const pair = `${from}_${to}`;
  
  switch (pair) {
    case 'BOB_USD':
      return rates.BOB_USD;
    case 'USD_BOB':
      return rates.USD_BOB;
    case 'USD_USDT':
      return rates.USD_USDT;
    case 'USDT_USD':
      return rates.USDT_USD;
    case 'BOB_USDT':
      // BOB -> USDT = BOB -> USD (since 1 USD ≈ 1 USDT)
      return rates.BOB_USD;
    case 'USDT_BOB':
      // USDT -> BOB = USD -> BOB (since 1 USDT ≈ 1 USD)
      return rates.USD_BOB;
    default:
      console.warn(`Unknown currency pair: ${pair}`);
      return 1;
  }
};

export const clearRatesCache = () => {
  cachedRates = null;
  lastFetchTime = 0;
};