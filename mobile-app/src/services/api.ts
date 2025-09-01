import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// API Configuration
const API_BASE_URL = 'http://192.168.1.77:8080'; // API URL for mobile testing

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    console.error('API Error:', error);
    
    if (error.response?.status === 401) {
      // Token expired, redirect to login
      await AsyncStorage.multiRemove(['auth_token', 'user_id']);
      // Navigation will be handled by the app state
    }
    
    // Enhanced error information
    const enhancedError = {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method,
      baseURL: error.config?.baseURL,
      timeout: error.config?.timeout,
      headers: error.config?.headers,
      originalError: error
    };
    
    return Promise.reject(enhancedError);
  }
);

// Auth Service
export const authService = {
  login: async (email: string, password: string) => {
    const response = await api.post('/api/v1/login', { email, password });
    return response.data;
  },

  register: async (userData: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
  }) => {
    const response = await api.post('/api/v1/register', userData);
    return response.data;
  },

  logout: async () => {
    try {
      await api.post('/api/v1/logout');
    } catch (error) {
      // Ignore errors on logout
    } finally {
      await AsyncStorage.multiRemove(['auth_token', 'user_id']);
    }
  },

  getProfile: async () => {
    const response = await api.get('/api/v1/me');
    return response.data;
  },
};

// Wallet Service
export const walletService = {
  getBalance: async () => {
    const response = await api.get('/api/v1/wallet/balance');
    return response.data;
  },

  getWallets: async () => {
    const response = await api.get('/api/v1/wallets');
    return response.data;
  },

  getTransactions: async (params?: { limit?: number; offset?: number; currency?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.currency) queryParams.append('currency', params.currency);
    
    const response = await api.get(`/api/v1/transactions?${queryParams.toString()}`);
    return response.data;
  },

  deposit: async (data: {
    currency: string;
    amount: number;
    method: string;
    first_name: string;
    last_name: string;
  }) => {
    const response = await api.post('/api/v1/deposit', data);
    return response.data;
  },

  withdraw: async (data: {
    currency: string;
    amount: number;
    method: string;
    destination: {
      account_holder: string;
      bank: string;
      account_number: string;
    };
  }) => {
    const response = await api.post('/api/v1/withdraw', data);
    return response.data;
  },

  transfer: async (data: {
    to_user_id: string;
    amount: number;
    currency: string;
    description?: string;
  }) => {
    const response = await api.post('/api/v1/transfer', data);
    return response.data;
  },

  convertCurrency: async (data: {
    from_currency: string;
    to_currency: string;
    from_amount: number;
    to_amount: number;
    rate: number;
  }) => {
    const response = await api.post('/api/v1/convert', data);
    return response.data;
  },

  getExchangeRates: async () => {
    const response = await api.get('/api/v1/rates');
    return response.data;
  },
};

// P2P Service
export const p2pService = {
  getOrders: async (params?: {
    currency_from?: string;
    currency_to?: string;
    type?: 'BUY' | 'SELL';
    limit?: number;
    offset?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.currency_from) queryParams.append('currency_from', params.currency_from);
    if (params?.currency_to) queryParams.append('currency_to', params.currency_to);
    if (params?.type) queryParams.append('type', params.type);
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    
    const response = await api.get(`/api/v1/orders?${queryParams.toString()}`);
    return response.data;
  },

  getRates: async () => {
    const response = await api.get('/api/v1/rates');
    return response.data;
  },

  createOrder: async (orderData: {
    type: 'BUY' | 'SELL';
    currency_from: string;
    currency_to: string;
    amount: number;
    rate: number;
    min_amount: number;
    max_amount: number;
    payment_methods: string[];
    terms?: string;
  }) => {
    const response = await api.post('/api/v1/orders', orderData);
    return response.data;
  },

  getMyOrders: async () => {
    const response = await api.get('/api/v1/user/orders');
    return response.data;
  },

  getOrder: async (orderId: string) => {
    const response = await api.get(`/api/v1/orders/${orderId}`);
    return response.data;
  },

  executeOrder: async (orderId: string, amount: number) => {
    const response = await api.post(`/api/v1/trade`, {
      order_id: orderId,
      amount,
    });
    return response.data;
  },

  cancelOrder: async (orderId: string) => {
    const response = await api.delete(`/api/v1/orders/${orderId}`);
    return response.data;
  },

  acceptOrder: async (orderId: string, amount: number) => {
    const response = await api.post(`/api/v1/orders/${orderId}/mark-paid`, {
      amount,
    });
    return response.data;
  },

  getTransactions: async (params?: { limit?: number; status?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);
    
    const response = await api.get(`/api/v1/transactions?${queryParams.toString()}`);
    return response.data;
  },

  getTransaction: async (transactionId: string) => {
    const response = await api.get(`/api/v1/transactions/${transactionId}`);
    return response.data;
  },

  completeTransaction: async (transactionId: string) => {
    const response = await api.post(`/api/v1/transactions/${transactionId}/complete`);
    return response.data;
  },

  releaseEscrow: async (transactionId: string) => {
    const response = await api.post(`/api/v1/transactions/${transactionId}/release`);
    return response.data;
  },
};

// KYC Service
export const kycService = {
  getStatus: async () => {
    const response = await api.get('/api/v1/kyc/status');
    return response.data;
  },

  getLevels: async () => {
    const response = await api.get('/api/v1/kyc/levels');
    return response.data;
  },

  getRequirements: async (level: number) => {
    const response = await api.get(`/api/v1/kyc/requirements/${level}`);
    return response.data;
  },

  submitKYC: async (kycData: any) => {
    const response = await api.post('/api/v1/kyc/submit', kycData);
    return response.data;
  },

  uploadDocument: async (type: string, file: any) => {
    console.log('📱 KYC_FRONTEND: Starting document upload');
    console.log('📱 KYC_FRONTEND: Document type:', type);
    console.log('📱 KYC_FRONTEND: File details:', {
      uri: file.uri,
      type: file.type,
      name: file.name,
      size: file.size || 'unknown'
    });

    const formData = new FormData();
    formData.append('type', type);
    formData.append('document', {
      uri: file.uri,
      type: file.type,
      name: file.name,
    } as any);

    console.log('📱 KYC_FRONTEND: FormData created, making API request to /api/v1/kyc/upload-document');

    try {
      const response = await api.post('/api/v1/kyc/upload-document', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      console.log('📱 KYC_FRONTEND: Upload successful, response:', response.data);
      return response.data;
    } catch (error) {
      console.error('📱 KYC_FRONTEND: Upload failed:', error);
      console.error('📱 KYC_FRONTEND: Error details:', {
        message: error?.message,
        status: error?.status,
        data: error?.data
      });
      throw error;
    }
  },
};

// Chat Service
export const chatService = {
  getRooms: async () => {
    const response = await api.get('/api/v1/rooms');
    return response.data;
  },

  getMessages: async (roomId: string) => {
    const response = await api.get(`/api/v1/rooms/${roomId}/messages`);
    return response.data;
  },

  sendMessage: async (roomId: string, content: string, type = 'TEXT') => {
    const response = await api.post(`/api/v1/rooms/${roomId}/messages`, {
      content,
      message_type: type,
    });
    return response.data;
  },

  createRoom: async (roomData: {
    room_type: string;
    participants: string[];
    transaction_id?: string;
    dispute_id?: string;
  }) => {
    const response = await api.post('/api/v1/rooms', roomData);
    return response.data;
  },
};

// Dispute Service
export const disputeService = {
  getDisputes: async () => {
    const response = await api.get('/api/v1/disputes');
    return response.data;
  },

  createDispute: async (disputeData: {
    transaction_id: string;
    dispute_type: string;
    title: string;
    description: string;
  }) => {
    const response = await api.post('/api/v1/disputes', disputeData);
    return response.data;
  },

  getDispute: async (id: string) => {
    const response = await api.get(`/api/v1/disputes/${id}`);
    return response.data;
  },

  submitEvidence: async (disputeId: string, evidenceData: {
    evidence_type: string;
    description: string;
    file_path?: string;
  }) => {
    const response = await api.post(`/api/v1/disputes/${disputeId}/evidence`, evidenceData);
    return response.data;
  },
};

// Types
export interface WalletBalance {
  currency: string;
  balance: string | number;
  locked_balance: string | number;
}

export interface Transaction {
  id: string;
  type: string;
  amount: string | number;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
  description?: string;
  from_user_id?: string;
  to_user_id?: string;
  transaction_hash?: string;
}

export interface Order {
  id: string;
  user_id: string;
  type: 'BUY' | 'SELL';
  currency_from: string;
  currency_to: string;
  amount: number;
  remaining_amount: number;
  rate: number;
  min_amount: number;
  max_amount: number;
  payment_methods: string[];
  status: string;
  terms?: string;
  created_at: string;
  updated_at: string;
}

export interface P2PTransaction {
  id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  amount: number;
  rate: number;
  total_amount: number;
  currency_from: string;
  currency_to: string;
  status: string;
  payment_method: string;
  created_at: string;
  updated_at: string;
  chat_room_id?: string;
}

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  is_verified: boolean;
  kyc_level: number;
  created_at: string;
}

export interface KYCStatus {
  level: number;
  status: string;
  verified: boolean;
  documents: any[];
  requirements: any[];
}

export default api;