import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle common errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('tokenExpiry')
      
      // Redirect to login if not already there
      if (!window.location.pathname.includes('/auth/')) {
        window.location.href = '/auth/login'
      }
    }
    
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  
  register: (data: {
    email: string
    password: string
    firstName: string
    lastName: string
    phone?: string
  }) => api.post('/auth/register', data),
  
  refresh: () => api.post('/auth/refresh'),
  
  logout: () => api.post('/auth/logout'),
}

// P2P API
export const p2pAPI = {
  getOrders: (params?: {
    currency_from?: string
    currency_to?: string
    type?: string
    status?: string
    limit?: number
    offset?: number
  }) => api.get('/p2p/orders', { params }),
  
  createOrder: (data: {
    type: 'BUY' | 'SELL'
    currency_from: string
    currency_to: string
    amount: number
    rate: number
    min_amount?: number
    max_amount?: number
    payment_methods: string[]
  }) => api.post('/p2p/orders', data),
  
  getUserOrders: () => api.get('/p2p/user/orders'),
  
  cancelOrder: (orderId: string) => api.delete(`/p2p/orders/${orderId}`),
  
  getOrderBook: (currency_from: string, currency_to: string) =>
    api.get('/p2p/orderbook', { params: { currency_from, currency_to } }),
  
  getRates: () => api.get('/p2p/rates'),
  
  getMatches: (params?: { limit?: number; offset?: number }) =>
    api.get('/p2p/user/matches', { params }),
  
  getOrderHistory: (params?: {
    status?: string
    limit?: number
    offset?: number
  }) => api.get('/p2p/user/history', { params }),
  
  getTradingStats: () => api.get('/p2p/user/stats'),
  
  getMarketDepth: (currency_from: string, currency_to: string) =>
    api.get('/p2p/market/depth', { params: { currency_from, currency_to } }),
}

// Wallet API
export const walletAPI = {
  getWallets: () => api.get('/wallet/wallets'),
  
  getWallet: (currency: string) => api.get(`/wallet/wallets/${currency}`),
  
  getTransactions: (params?: {
    currency?: string
    type?: string
    status?: string
    limit?: number
    offset?: number
  }) => api.get('/wallet/transactions', { params }),
  
  getTransaction: (txId: string) => api.get(`/wallet/transactions/${txId}`),
  
  deposit: (data: {
    currency: string
    amount: number
    method: 'BANK' | 'PAYPAL' | 'STRIPE' | 'QR'
  }) => api.post('/wallet/deposit', data),
  
  withdraw: (data: {
    currency: string
    amount: number
    method: 'BANK' | 'PAYPAL' | 'STRIPE'
    destination: any
  }) => api.post('/wallet/withdraw', data),
  
  transfer: (data: {
    from_currency: string
    to_currency: string
    amount: number
    recipient_id: string
  }) => api.post('/wallet/transfer', data),
  
  getRates: () => api.get('/wallet/rates'),
}

// Types for API responses
export interface ApiResponse<T = any> {
  data: T
  message?: string
  status?: string
}

export interface Order {
  id: string
  user_id: string
  type: 'BUY' | 'SELL'
  currency_from: string
  currency_to: string
  amount: number
  remaining_amount: number
  rate: number
  min_amount: number
  max_amount: number
  payment_methods: string[]
  status: 'ACTIVE' | 'FILLED' | 'CANCELLED' | 'PARTIAL'
  created_at: string
  matches?: string[]
}

export interface OrderBook {
  pair: string
  buy_orders: Order[]
  sell_orders: Order[]
  updated_at: string
}

export interface WalletBalance {
  currency: string
  balance: number
  locked_balance: number
  last_updated: string
}

export interface Transaction {
  id: string
  user_id: string
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'FEE'
  currency: string
  amount: number
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  method: 'BANK' | 'PAYPAL' | 'STRIPE' | 'QR' | 'P2P'
  external_ref?: string
  metadata?: string
  created_at: string
  updated_at: string
}

export interface Match {
  id: string
  buy_order_id: string
  sell_order_id: string
  amount: number
  rate: number
  currency_from: string
  currency_to: string
  user_role: 'buyer' | 'seller'
  matched_at: string
}

export interface TradingStats {
  total_orders: number
  active_orders: number
  filled_orders: number
  cancelled_orders: number
  total_volume: number
  success_rate: number
}