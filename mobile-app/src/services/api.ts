import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// API Configuration
const API_BASE_URL = 'http://192.168.1.100:3000'; // Change to your API URL

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
    if (error.response?.status === 401) {
      // Token expired, redirect to login
      await AsyncStorage.multiRemove(['auth_token', 'user_id']);
      // Navigation will be handled by the app state
    }
    return Promise.reject(error.response?.data || error);
  }
);

// Auth Service
export const authService = {
  login: async (email: string, password: string) => {
    const response = await api.post('/api/v1/auth/login', { email, password });
    return response.data;
  },

  register: async (userData: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    phone?: string;
  }) => {
    const response = await api.post('/api/v1/auth/register', userData);
    return response.data;
  },

  logout: async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch (error) {
      // Ignore errors on logout
    } finally {
      await AsyncStorage.multiRemove(['auth_token', 'user_id']);
    }
  },

  getProfile: async () => {
    const response = await api.get('/api/v1/auth/profile');
    return response.data;
  },
};

// Wallet Service
export const walletService = {
  getBalance: async () => {
    const response = await api.get('/api/v1/wallet/balance');
    return response.data;
  },

  getTransactions: async (limit = 20) => {
    const response = await api.get(`/api/v1/wallet/transactions?limit=${limit}`);
    return response.data;
  },

  deposit: async (amount: number, bank_code: string, account_number: string) => {
    const response = await api.post('/api/v1/wallet/deposit', {
      amount,
      bank_code,
      account_number,
    });
    return response.data;
  },

  withdraw: async (amount: number, bank_code: string, account_number: string) => {
    const response = await api.post('/api/v1/wallet/withdraw', {
      amount,
      bank_code,
      account_number,
    });
    return response.data;
  },
};

// P2P Service
export const p2pService = {
  getOrders: async (type?: 'BUY' | 'SELL') => {
    const typeParam = type ? `?type=${type}` : '';
    const response = await api.get(`/api/v1/p2p/orders${typeParam}`);
    return response.data;
  },

  createOrder: async (orderData: {
    type: 'BUY' | 'SELL';
    crypto_currency: string;
    fiat_currency: string;
    amount: number;
    price: number;
    payment_method: string;
    terms?: string;
  }) => {
    const response = await api.post('/api/v1/p2p/orders', orderData);
    return response.data;
  },

  getMyOrders: async () => {
    const response = await api.get('/api/v1/p2p/my-orders');
    return response.data;
  },

  executeOrder: async (orderId: string, amount: number) => {
    const response = await api.post(`/api/v1/p2p/orders/${orderId}/execute`, {
      amount,
    });
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

export default api;