import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

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
    console.log('🔄 API REQUEST:', {
      method: config.method?.toUpperCase(),
      url: config.url,
      baseURL: config.baseURL,
      fullURL: `${config.baseURL}${config.url}`,
      headers: config.headers
    })
    
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
      console.log('🔐 API REQUEST: Added auth token to request')
    }
    return config
  },
  (error) => {
    console.error('❌ API REQUEST ERROR:', error)
    return Promise.reject(error)
  }
)

// Response interceptor to handle common errors
api.interceptors.response.use(
  (response) => {
    console.log('✅ API RESPONSE:', {
      status: response.status,
      statusText: response.statusText,
      url: response.config.url,
      method: response.config.method?.toUpperCase(),
      dataKeys: response.data ? Object.keys(response.data) : 'no data'
    })
    return response
  },
  (error) => {
    console.error('❌ API RESPONSE ERROR:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      method: error.config?.method?.toUpperCase(),
      data: error.response?.data,
      message: error.message
    })
    
    if (error.response?.status === 401) {
      console.log('🔓 API: Token expired, clearing auth data')
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
    api.post('/api/v1/login', { email, password }),
  
  register: (data: {
    email: string
    password: string
    firstName: string
    lastName: string
    phone?: string
  }) => api.post('/api/v1/register', data),
  
  refresh: () => api.post('/api/v1/refresh'),
  
  logout: () => api.post('/api/v1/logout'),
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
  }) => api.get('/api/v1/orders', { params }),
  
  createOrder: (data: {
    type: 'BUY' | 'SELL'
    currency_from: string
    currency_to: string
    amount: number
    rate: number
    min_amount?: number
    max_amount?: number
    payment_methods: string[]
  }) => api.post('/api/v1/orders', data),
  
  getUserOrders: () => api.get('/api/v1/user/orders'),
  
  cancelOrder: (orderId: string) => api.delete(`/api/v1/orders/${orderId}`),
  
  getOrderBook: (currency_from: string, currency_to: string) =>
    api.get('/api/v1/orderbook', { params: { currency_from, currency_to } }),
  
  getRates: () => api.get('/api/v1/rates'),
  
  getMatches: (params?: { limit?: number; offset?: number }) =>
    api.get('/api/v1/user/matches', { params }),
  
  getOrderHistory: (params?: {
    status?: string
    limit?: number
    offset?: number
  }) => api.get('/api/v1/user/history', { params }),
  
  getTradingStats: () => api.get('/api/v1/user/stats'),
  
  getMarketDepth: (currency_from: string, currency_to: string) =>
    api.get('/api/v1/market/depth', { params: { currency_from, currency_to } }),
}

// Wallet API
export const walletAPI = {
  getWallets: () => api.get('/api/v1/wallets'),
  
  getWallet: (currency: string) => api.get(`/api/v1/wallets/${currency}`),
  
  getTransactions: (params?: {
    currency?: string
    type?: string
    status?: string
    limit?: number
    offset?: number
  }) => api.get('/api/v1/transactions', { params }),
  
  getTransaction: (txId: string) => api.get(`/api/v1/transactions/${txId}`),
  
  deposit: (data: {
    currency: string
    amount: number
    method: 'BANK' | 'QR'
  }) => api.post('/api/v1/deposit', data),
  
  withdraw: (data: {
    currency: string
    amount: number
    method: 'BANK'
    destination?: {
      account_holder?: string
      bank?: string
      account_number?: string
    }
  }) => api.post('/api/v1/withdraw', data),
  
  getDepositInstructions: (currency: string, amount: number) => 
    api.get(`/api/v1/deposit-instructions/${currency}`, { params: { amount } }),
  
  transfer: (data: {
    from_currency: string
    to_currency: string
    amount: number
    recipient_id: string
  }) => api.post('/api/v1/transfer', data),
  
  getRates: () => api.get('/api/v1/rates'),
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
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
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

// KYC API
export const kycAPI = {
  getStatus: () => api.get('/api/v1/kyc/status'),
  
  submitKYC: (data: {
    kyc_level: number
    first_name: string
    last_name: string
    ci_number: string
    ci_complement: string
    date_of_birth: string
    address: string
    city: string
    phone: string
    occupation: string
    income_source: string
    expected_volume: number
    pep_status: boolean
  }) => api.post('/api/v1/kyc/submit', data),
  
  uploadDocument: (formData: FormData) => {
    console.log('🌐 KYC_API: Starting uploadDocument call')
    console.log('🌐 KYC_API: FormData entries:')
    const entries = Array.from(formData.entries())
    entries.forEach(([key, value]) => {
      if (value instanceof File) {
        console.log(`  ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`)
      } else {
        console.log(`  ${key}: ${value}`)
      }
    })
    
    return api.post('/api/v1/kyc/upload-document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }).then(response => {
      console.log('✅ KYC_API: Upload successful, response:', response)
      return response
    }).catch(error => {
      console.error('❌ KYC_API: Upload failed, error:', error)
      throw error
    })
  },
  
  verifySelfie: (formData: FormData) =>
    api.post('/api/v1/kyc/verify-selfie', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    }),
  
  getLevels: () => api.get('/api/v1/kyc/levels'),
  
  getRequirements: (level: number) => api.get(`/api/v1/kyc/requirements/${level}`),
}

// User Profile API  
export const userAPI = {
  getProfile: () => api.get('/api/v1/me'),
  
  updateProfile: (data: {
    firstName?: string
    lastName?: string
    phone?: string
    address?: string
    city?: string
    date_of_birth?: string
  }) => api.put('/api/v1/profile', data),
}

// KYC Types
export interface KYCStatus {
  kyc_level: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW'
  submitted_at?: string
  reviewed_at?: string
  rejection_reason?: string
  documents: KYCDocument[]
}

export interface KYCDocument {
  id: string
  document_type: 'CI' | 'PASSPORT' | 'SELFIE' | 'PROOF_ADDRESS'
  file_path: string
  status: 'UPLOADED' | 'PROCESSING' | 'VERIFIED' | 'FAILED'
  created_at: string
}

export interface KYCLevel {
  level: number
  name: string
  description: string
  trading_limits: {
    daily_limit: number
    monthly_limit: number
    withdrawal_limit: number
  }
  requirements: string[]
}

export interface UserProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  kyc_level: number
  kyc_verified_at?: string
  is_verified: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}