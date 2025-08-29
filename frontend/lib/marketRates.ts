import axios from 'axios'

// Types
export interface MarketRates {
  BOB_USD: number
  BOB_USDT: number
  USDT_BOB: number
  USDT_USD: number
  USD_BOB: number
  USD_USDT: number
  lastUpdated: number
}

interface P2PRates {
  usdtToBob: number | null
  source: string
  timestamp: number
}

// Cache to avoid too many API calls
let ratesCache: MarketRates | null = null
let cacheTimestamp = 0
const CACHE_DURATION = 2 * 60 * 1000 // 2 minutes

// External APIs
const COINGECKO_API = 'https://api.coingecko.com/api/v3'
const EXCHANGE_RATE_API = 'https://api.exchangerate-api.com/v4/latest'
const P2P_ARMY_API = 'https://p2p.army/v1/api'

/**
 * Fetch real-time exchange rates from external APIs
 */
export async function fetchMarketRates(): Promise<MarketRates> {
  // Check cache first
  const now = Date.now()
  if (ratesCache && (now - cacheTimestamp) < CACHE_DURATION) {
    console.log('📊 Using cached market rates')
    return ratesCache
  }

  try {
    console.log('🌐 Fetching real-time market rates...')
    
    // Fetch all APIs concurrently
    const [cryptoRates, fiatRates, p2pRates] = await Promise.all([
      fetchCryptoRates(),
      fetchFiatRates(),
      fetchP2PRates()
    ])

    const usdtPrice = cryptoRates.usd // USDT price in USD
    
    // Use real P2P rates if available, otherwise fallback to calculated rates
    let usdToBob: number
    let usdtToBob: number
    
    if (p2pRates && p2pRates.usdtToBob && p2pRates.usdtToBob > 0) {
      // Use real Binance P2P rates from Bolivia
      usdtToBob = p2pRates.usdtToBob
      // Calculate USD to BOB using USDT as bridge
      usdToBob = usdtToBob / usdtPrice
      console.log('✅ Using real Binance P2P rates for Bolivia')
    } else {
      // Fallback to estimated parallel rate
      const officialUsdToBob = fiatRates.BOB
      const parallelAdjustment = 1.12 // 12% higher than official
      usdToBob = officialUsdToBob * parallelAdjustment
      usdtToBob = usdToBob * usdtPrice
      console.log('⚠️ Using estimated parallel rates (P2P API failed)')
    }
    
    const bobToUsd = 1 / usdToBob

    // Calculate all rates using real or estimated parallel market rates
    const rates: MarketRates = {
      // Fiat rates (using real P2P or estimated parallel market)
      USD_BOB: usdToBob,
      BOB_USD: bobToUsd,
      
      // Crypto rates (USDT is approximately 1 USD but we use real data)
      USDT_USD: usdtPrice,
      USD_USDT: 1 / usdtPrice,
      
      // Cross rates (BOB <-> USDT using real P2P rates when available)
      BOB_USDT: bobToUsd / usdtPrice, // BOB -> USD -> USDT
      USDT_BOB: usdtToBob, // Real USDT to BOB rate from P2P
      
      lastUpdated: now
    }

    // Update cache
    ratesCache = rates
    cacheTimestamp = now

    console.log('✅ Market rates updated:', {
      'BOB/USD': rates.BOB_USD.toFixed(6),
      'USD/BOB': rates.USD_BOB.toFixed(2),
      'BOB/USDT': rates.BOB_USDT.toFixed(6),
      'USDT/BOB': rates.USDT_BOB.toFixed(2),
      'USDT/USD': rates.USDT_USD.toFixed(4)
    })

    return rates
  } catch (error: any) {
    console.error('❌ Error fetching market rates:', error)
    
    // Return cached rates if available, otherwise fallback rates
    if (ratesCache) {
      console.log('⚠️  Using stale cached rates due to API error')
      return ratesCache
    }
    
    // Fallback rates (approximate values)
    console.log('⚠️  Using fallback rates due to API error')
    return {
      USD_BOB: 6.90,
      BOB_USD: 0.1449,
      USDT_USD: 1.0005,
      USD_USDT: 0.9995,
      BOB_USDT: 0.1448,
      USDT_BOB: 6.90,
      lastUpdated: now
    }
  }
}

/**
 * Fetch cryptocurrency prices from CoinGecko
 */
async function fetchCryptoRates() {
  try {
    const response = await axios.get(`${COINGECKO_API}/simple/price`, {
      params: {
        ids: 'tether',
        vs_currencies: 'usd'
      },
      timeout: 5000
    })
    
    return {
      usd: response.data.tether?.usd || 1.0
    }
  } catch (error: any) {
    console.warn('⚠️  CoinGecko API failed, using fallback crypto rates')
    return { usd: 1.0 } // USDT ≈ 1 USD fallback
  }
}

/**
 * Fetch real P2P rates from P2P.Army (Binance P2P Bolivia)
 */
async function fetchP2PRates(): Promise<P2PRates | null> {
  try {
    console.log('🔗 Fetching real Binance P2P rates for Bolivia...')
    
    // Try P2P.Army API for USDT/BOB rates
    const response = await axios.get(`${P2P_ARMY_API}/get_p2p_prices`, {
      params: {
        exchange: 'binance',
        fiat: 'BOB',
        crypto: 'USDT'
      },
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; P2PBoliviaApp/1.0)',
        'Accept': 'application/json'
      }
    })
    
    // Extract rates from the API response
    const data = response.data
    
    // P2P.Army typically returns buy/sell prices
    let usdtToBob = 0
    
    if (data && data.length > 0) {
      // Get average of buy and sell prices, or use available price
      const priceData = data[0] // First result
      
      if (priceData.buy_price && priceData.sell_price) {
        usdtToBob = (parseFloat(priceData.buy_price) + parseFloat(priceData.sell_price)) / 2
      } else if (priceData.price) {
        usdtToBob = parseFloat(priceData.price)
      } else if (priceData.buy_price) {
        usdtToBob = parseFloat(priceData.buy_price)
      } else if (priceData.sell_price) {
        usdtToBob = parseFloat(priceData.sell_price)
      }
    }
    
    console.log(`💰 Real P2P rate found: 1 USDT = ${usdtToBob} BOB`)
    
    return {
      usdtToBob: usdtToBob > 0 ? usdtToBob : null,
      source: 'binance_p2p',
      timestamp: Date.now()
    }
    
  } catch (error: any) {
    console.warn('⚠️  P2P.Army API failed:', error.response?.status || error.message)
    
    // Try alternative P2P endpoint
    try {
      const response = await axios.get(`${P2P_ARMY_API}/history/p2p_prices`, {
        params: {
          exchange: 'binance',
          fiat: 'BOB',
          crypto: 'USDT',
          limit: 1
        },
        timeout: 5000
      })
      
      if (response.data && response.data.length > 0) {
        const latestRate = response.data[0]
        const usdtToBob = parseFloat(latestRate.avg_price || latestRate.price)
        
        console.log(`💰 Historical P2P rate found: 1 USDT = ${usdtToBob} BOB`)
        
        return {
          usdtToBob: usdtToBob > 0 ? usdtToBob : null,
          source: 'binance_p2p_historical',
          timestamp: Date.now()
        }
      }
    } catch (error2: any) {
      console.warn('⚠️  All P2P APIs failed, will use estimated rates')
    }
    
    return null // Signal to use fallback rates
  }
}

/**
 * Fetch fiat exchange rates
 */
async function fetchFiatRates() {
  try {
    // Try exchangerate-api.com first (free, no API key needed)
    const response = await axios.get(`${EXCHANGE_RATE_API}/USD`, {
      timeout: 5000
    })
    
    return {
      BOB: response.data.rates?.BOB || 6.90 // USD to BOB rate
    }
  } catch (error: any) {
    console.warn('⚠️  Exchange rate API failed, trying alternative...')
    
    try {
      // Alternative: fixer.io free tier (backup)
      const response = await axios.get('https://api.fixer.io/latest', {
        params: {
          base: 'USD',
          symbols: 'BOB'
        },
        timeout: 5000
      })
      
      return {
        BOB: response.data.rates?.BOB || 6.90
      }
    } catch (error2: any) {
      console.warn('⚠️  All forex APIs failed, using fallback rates')
      return { BOB: 6.90 } // Fallback BOB rate
    }
  }
}

/**
 * Format rate for display
 */
export function formatRate(rate: number, precision: number = 4): string {
  if (rate < 0.01) {
    return rate.toFixed(6)
  } else if (rate < 1) {
    return rate.toFixed(4)
  } else {
    return rate.toFixed(2)
  }
}

/**
 * Format rate in intuitive way (like "1 USD = 7.73 BOB")
 */
export function formatIntuitiveRate(fromCurrency: string, toCurrency: string, rate: number): string {
  // For BOB to USD (small decimals), show it as USD to BOB instead
  if (fromCurrency === 'BOB' && toCurrency === 'USD') {
    const inverseRate = 1 / rate
    return `$1 USD = ${inverseRate.toFixed(2)} BOB`
  }
  
  // For USD to BOB, show as is
  if (fromCurrency === 'USD' && toCurrency === 'BOB') {
    return `$1 USD = ${rate.toFixed(2)} BOB`
  }
  
  // For USDT to BOB
  if (fromCurrency === 'USDT' && toCurrency === 'BOB') {
    return `1 USDT = ${rate.toFixed(2)} BOB`
  }
  
  // For BOB to USDT, show it reversed
  if (fromCurrency === 'BOB' && toCurrency === 'USDT') {
    const inverseRate = 1 / rate
    return `1 USDT = ${inverseRate.toFixed(2)} BOB`
  }
  
  // For other crypto pairs
  if (fromCurrency === 'USD' && toCurrency === 'USDT') {
    return `$1 USD = ${rate.toFixed(4)} USDT`
  }
  
  if (fromCurrency === 'USDT' && toCurrency === 'USD') {
    return `1 USDT = $${rate.toFixed(4)} USD`
  }
  
  // Default fallback
  return `1 ${fromCurrency} = ${rate.toFixed(4)} ${toCurrency}`
}

/**
 * Get practical conversion examples
 */
export function getConversionExample(fromCurrency: string, toCurrency: string, rate: number): string {
  if (fromCurrency === 'BOB' && toCurrency === 'USD') {
    // Show how many BOB for 1 USD instead
    const usdAmount = 1
    const bobAmount = usdAmount / rate // Inverse to get BOB per USD
    return `$${usdAmount} USD = ${bobAmount.toFixed(2)} BOB`
  }
  
  if (fromCurrency === 'USD' && toCurrency === 'BOB') {
    const usdAmount = 1
    const bobAmount = usdAmount * rate
    return `$${usdAmount} USD = ${bobAmount.toFixed(2)} BOB`
  }
  
  if (fromCurrency === 'USDT' && toCurrency === 'BOB') {
    const usdtAmount = 1
    const bobAmount = usdtAmount * rate
    return `${usdtAmount} USDT = ${bobAmount.toFixed(2)} BOB`
  }
  
  if (fromCurrency === 'BOB' && toCurrency === 'USDT') {
    // Show how many BOB for 1 USDT instead
    const usdtAmount = 1
    const bobAmount = usdtAmount / rate // Inverse to get BOB per USDT
    return `${usdtAmount} USDT = ${bobAmount.toFixed(2)} BOB`
  }
  
  // Default examples
  const baseAmount = 1
  const convertedAmount = baseAmount * rate
  return `${baseAmount} ${fromCurrency} = ${convertedAmount.toFixed(2)} ${toCurrency}`
}

/**
 * Get rate change indicator (mock for now - would need historical data)
 */
export function getRateChange(): { isUp: boolean, change: number } {
  // Mock rate change - in production you'd compare with previous rates
  const isUp = Math.random() > 0.5
  const change = (Math.random() * 2 - 1) * 0.02 // -2% to +2%
  
  return { isUp, change }
}

/**
 * Get rates for specific pairs
 */
export function getRateForPair(rates: MarketRates, from: string, to: string): number {
  const pair = `${from}_${to}` as keyof Omit<MarketRates, 'lastUpdated'>
  return rates[pair] || 0
}

/**
 * Auto-refresh rates (for components that need real-time updates)
 */
export function useMarketRatesRefresh(intervalMs: number = 120000) { // 2 minutes default
  let intervalId: NodeJS.Timeout | null = null
  
  const startRefresh = (callback: (rates: MarketRates) => void) => {
    // Initial fetch
    fetchMarketRates().then(callback)
    
    // Set up interval
    intervalId = setInterval(async () => {
      try {
        const rates = await fetchMarketRates()
        callback(rates)
      } catch (error: any) {
        console.error('Failed to refresh rates:', error)
      }
    }, intervalMs)
  }
  
  const stopRefresh = () => {
    if (intervalId) {
      clearInterval(intervalId)
      intervalId = null
    }
  }
  
  return { startRefresh, stopRefresh }
}