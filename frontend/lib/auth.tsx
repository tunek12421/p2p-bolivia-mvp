import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { api } from './api'
import toast from 'react-hot-toast'

interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  phone?: string
  isVerified: boolean
  createdAt: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<boolean>
  register: (data: RegisterData) => Promise<boolean>
  logout: () => void
  refreshToken: () => Promise<boolean>
  isLoading: boolean
}

interface RegisterData {
  email: string
  password: string
  firstName: string
  lastName: string
  phone?: string
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check for stored token on mount
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')

    if (storedToken && storedUser) {
      try {
        setToken(storedToken)
        setUser(JSON.parse(storedUser))
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
      } catch (error) {
        console.error('Error parsing stored user data:', error)
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }
    
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      setIsLoading(true)
      const response = await api.post('/api/v1/login', { username: email, password })
      
      const { user_id: UserID, access_token: userToken, expires_in: ExpiresIn } = response.data
      
      // Get user profile separately
      const userResponse = await api.get('/api/v1/me', {
        headers: { Authorization: `Bearer ${userToken}` }
      })
      const userData = userResponse.data
      
      setUser(userData)
      setToken(userToken)
      
      // Store in localStorage
      localStorage.setItem('token', userToken)
      localStorage.setItem('user', JSON.stringify(userData))
      const expiresAt = new Date(Date.now() + ExpiresIn * 1000).toISOString()
      localStorage.setItem('tokenExpiry', expiresAt)
      
      // Set default header for future requests
      api.defaults.headers.common['Authorization'] = `Bearer ${userToken}`
      
      toast.success(`¡Bienvenido de vuelta, ${userData.firstName}!`)
      return true
    } catch (error: any) {
      const message = error.response?.data?.error || 'Login failed'
      toast.error(message)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const register = async (data: RegisterData): Promise<boolean> => {
    try {
      setIsLoading(true)
      console.log('🚀 REGISTER: Starting registration process')
      console.log('📋 REGISTER: Registration data:', {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        passwordLength: data.password?.length
      })
      
      console.log('🌐 REGISTER: API baseURL:', api.defaults.baseURL)
      console.log('📡 REGISTER: Making request to /api/v1/register')
      
      const response = await api.post('/api/v1/register', data)
      
      console.log('✅ REGISTER: Registration request successful')
      console.log('📦 REGISTER: Response status:', response.status)
      console.log('📦 REGISTER: Response data:', response.data)
      
      const { user_id: UserID, access_token: userToken, expires_in: ExpiresIn } = response.data
      
      console.log('🔍 REGISTER: Extracted from response:', {
        UserID,
        tokenLength: userToken?.length,
        ExpiresIn
      })
      
      // Get user profile separately
      console.log('👤 REGISTER: Fetching user profile with token')
      const userResponse = await api.get('/api/v1/me', {
        headers: { Authorization: `Bearer ${userToken}` }
      })
      
      console.log('✅ REGISTER: User profile fetched successfully')
      console.log('👤 REGISTER: User data:', userResponse.data)
      
      const userData = userResponse.data
      
      setUser(userData)
      setToken(userToken)
      
      // Store in localStorage
      localStorage.setItem('token', userToken)
      localStorage.setItem('user', JSON.stringify(userData))
      const expiresAt = new Date(Date.now() + ExpiresIn * 1000).toISOString()
      localStorage.setItem('tokenExpiry', expiresAt)
      
      console.log('💾 REGISTER: Stored in localStorage:', {
        tokenLength: userToken.length,
        userDataKeys: Object.keys(userData),
        expiresAt
      })
      
      // Set default header for future requests
      api.defaults.headers.common['Authorization'] = `Bearer ${userToken}`
      
      toast.success(`¡Bienvenido a P2P Bolivia, ${userData.firstName}!`)
      console.log('🎉 REGISTER: Registration process completed successfully')
      return true
    } catch (error: any) {
      console.error('❌ REGISTER: Registration failed')
      console.error('❌ REGISTER: Error details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        url: error.config?.url,
        method: error.config?.method,
        baseURL: error.config?.baseURL
      })
      
      const message = error.response?.data?.error || 'Registration failed'
      toast.error(message)
      return false
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setUser(null)
    setToken(null)
    
    // Clear localStorage
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('tokenExpiry')
    
    // Clear default header
    delete api.defaults.headers.common['Authorization']
    
    toast.success('Sesión cerrada exitosamente')
  }

  const refreshToken = async (): Promise<boolean> => {
    try {
      const storedToken = localStorage.getItem('token')
      if (!storedToken) return false

      const response = await api.post('/api/v1/refresh', {}, {
        headers: { Authorization: `Bearer ${storedToken}` }
      })
      
      const { access_token: newToken, expires_in } = response.data
      
      setToken(newToken)
      localStorage.setItem('token', newToken)
      const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()
      localStorage.setItem('tokenExpiry', expiresAt)
      
      api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
      
      return true
    } catch (error) {
      logout()
      return false
    }
  }

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!token) return

    const checkTokenExpiry = () => {
      const expiry = localStorage.getItem('tokenExpiry')
      if (!expiry) return

      const expiryTime = new Date(expiry).getTime()
      const currentTime = new Date().getTime()
      const timeUntilExpiry = expiryTime - currentTime

      // Refresh if token expires in less than 5 minutes
      if (timeUntilExpiry < 5 * 60 * 1000) {
        refreshToken()
      }
    }

    checkTokenExpiry()
    const interval = setInterval(checkTokenExpiry, 60 * 1000) // Check every minute

    return () => clearInterval(interval)
  }, [token])

  const value = {
    user,
    token,
    login,
    register,
    logout,
    refreshToken,
    isLoading
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function useRequireAuth() {
  const auth = useAuth()
  
  useEffect(() => {
    if (!auth.isLoading && !auth.user) {
      window.location.href = '/auth/login'
    }
  }, [auth.isLoading, auth.user])
  
  return auth
}