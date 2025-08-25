import { useState, useEffect } from 'react'
import { useRequireAuth } from '../../lib/auth'
import { p2pAPI, Order } from '../../lib/api'
import DashboardLayout from '../../components/DashboardLayout'
import TransactionChat from '../../components/TransactionChat'
import {
  ClockIcon,
  CheckCircleIcon,
  BanknotesIcon,
  UserIcon,
  PhoneIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function CashierDashboard() {
  const { user } = useRequireAuth()
  const [pendingOrders, setPendingOrders] = useState<Order[]>([])
  const [myOrders, setMyOrders] = useState<Order[]>([])
  const [metrics, setMetrics] = useState({
    total_orders: 0,
    completed_orders: 0,
    pending_orders: 0,
    total_volume: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pending' | 'my-orders' | 'metrics'>('pending')
  
  // Chat states
  const [chatOrderId, setChatOrderId] = useState<string | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)

  useEffect(() => {
    if (user) {
      fetchCashierData()
    }
  }, [user])

  const fetchCashierData = async () => {
    try {
      setIsLoading(true)
      
      const [pendingRes, myOrdersRes, metricsRes] = await Promise.allSettled([
        p2pAPI.cashier.getPendingOrders(),
        p2pAPI.cashier.getMyOrders(),
        p2pAPI.cashier.getMetrics()
      ])

      if (pendingRes.status === 'fulfilled') {
        setPendingOrders(pendingRes.value.data.orders || [])
      }

      if (myOrdersRes.status === 'fulfilled') {
        setMyOrders(myOrdersRes.value.data.orders || [])
      }

      if (metricsRes.status === 'fulfilled') {
        setMetrics(metricsRes.value.data || metrics)
      }
    } catch (error) {
      console.error('Error fetching cashier data:', error)
      toast.error('Error cargando datos de cajero')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAcceptOrder = async (orderId: string) => {
    try {
      await p2pAPI.cashier.acceptOrder(orderId)
      toast.success('Orden aceptada exitosamente')
      await fetchCashierData() // Refresh data
    } catch (error: any) {
      console.error('Error accepting order:', error)
      toast.error(error.response?.data?.message || 'Error aceptando la orden')
    }
  }

  const handleConfirmPayment = async (orderId: string) => {
    try {
      await p2pAPI.cashier.confirmPayment(orderId)
      toast.success('Pago confirmado exitosamente')
      await fetchCashierData() // Refresh data
    } catch (error: any) {
      console.error('Error confirming payment:', error)
      toast.error(error.response?.data?.message || 'Error confirmando el pago')
    }
  }

  const formatCurrency = (amount: number | string, currency: string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
    const currencyMapping: { [key: string]: string } = {
      'BOB': 'USD',
      'USDT': 'USD',
      'USD': 'USD'
    }
    
    const formatCurrencyCode = currencyMapping[currency] || 'USD'
    
    let formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: formatCurrencyCode,
      minimumFractionDigits: currency === 'BOB' ? 2 : 4,
      maximumFractionDigits: currency === 'BOB' ? 2 : 4,
    }).format(numAmount)
    
    if (currency === 'BOB') {
      formatted = formatted.replace('$', 'Bs. ')
    } else if (currency === 'USDT') {
      formatted = formatted.replace('$', 'USDT ')
    }
    
    return formatted
  }

  const canOpenChat = (order: Order) => {
    return order.status === 'MATCHED' || order.status === 'PROCESSING'
  }

  const handleOpenChat = (orderId: string) => {
    setChatOrderId(orderId)
    setIsChatOpen(true)
  }

  const handleCloseChat = () => {
    setIsChatOpen(false)
    setChatOrderId(null)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="badge-warning">Pendiente</span>
      case 'MATCHED':
        return <span className="badge-primary">Emparejada</span>
      case 'PROCESSING':
        return <span className="badge bg-purple-100 text-purple-800">Procesando</span>
      case 'COMPLETED':
        return <span className="badge-success">Completada</span>
      default:
        return <span className="badge">{status}</span>
    }
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="loading-spinner w-8 h-8 text-primary-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Panel de Cajero</h1>
            <p className="mt-2 text-gray-600">
              Gestiona órdenes P2P y confirma pagos
            </p>
          </div>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <ClockIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Órdenes Pendientes</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.pending_orders}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircleIcon className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Completadas</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.completed_orders}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <BanknotesIcon className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Total Órdenes</p>
                <p className="text-2xl font-bold text-gray-900">{metrics.total_orders}</p>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <CurrencyDollarIcon className="w-6 h-6 text-yellow-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">Volumen Total</p>
                <p className="text-2xl font-bold text-gray-900">${(metrics.total_volume || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="card">
          <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
            {[
              { key: 'pending', label: 'Órdenes Disponibles', count: pendingOrders.length },
              { key: 'my-orders', label: 'Mis Órdenes', count: myOrders.length },
              { key: 'metrics', label: 'Métricas', count: null }
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center ${
                  activeTab === tab.key
                    ? 'bg-white text-primary-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
                {tab.count !== null && (
                  <span className="ml-2 bg-gray-200 text-gray-600 text-xs rounded-full px-2 py-1">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Pending Orders Tab */}
          {activeTab === 'pending' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Órdenes Disponibles para Aceptar
              </h3>
              {pendingOrders.length === 0 ? (
                <div className="text-center py-8">
                  <ClockIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No hay órdenes pendientes disponibles</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {pendingOrders.map((order) => (
                    <div key={order.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <span className={`text-lg font-semibold ${
                              order.type === 'BUY' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {order.type === 'BUY' ? 'COMPRA' : 'VENTA'}
                            </span>
                            <span className="text-gray-500">•</span>
                            <span className="text-gray-900">
                              {order.currency_from} → {order.currency_to}
                            </span>
                            {getStatusBadge(order.status)}
                          </div>
                          <p className="text-sm text-gray-600">ID: {order.id}</p>
                        </div>
                        <button
                          onClick={() => handleAcceptOrder(order.id)}
                          className="btn-primary"
                        >
                          Aceptar Orden
                        </button>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Cantidad</p>
                          <p className="font-semibold">
                            {formatCurrency(order.amount, order.currency_from)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Tasa</p>
                          <p className="font-semibold">
                            {formatCurrency(order.rate, order.currency_to)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Total</p>
                          <p className="font-semibold">
                            {formatCurrency((typeof order.amount === 'string' ? parseFloat(order.amount) : order.amount) * (typeof order.rate === 'string' ? parseFloat(order.rate) : order.rate), order.currency_to)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Creada</p>
                          <p className="font-semibold">
                            {new Date(order.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* My Orders Tab */}
          {activeTab === 'my-orders' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Mis Órdenes Asignadas
              </h3>
              {myOrders.length === 0 ? (
                <div className="text-center py-8">
                  <BanknotesIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No tienes órdenes asignadas</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {myOrders.map((order) => (
                    <div key={order.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center space-x-2 mb-2">
                            <span className={`text-lg font-semibold ${
                              order.type === 'BUY' ? 'text-green-600' : 'text-red-600'
                            }`}>
                              {order.type === 'BUY' ? 'COMPRA' : 'VENTA'}
                            </span>
                            <span className="text-gray-500">•</span>
                            <span className="text-gray-900">
                              {order.currency_from} → {order.currency_to}
                            </span>
                            {getStatusBadge(order.status)}
                          </div>
                          <p className="text-sm text-gray-600">ID: {order.id}</p>
                        </div>
                        <div className="flex gap-2">
                          {canOpenChat(order) && (
                            <button
                              onClick={() => handleOpenChat(order.id)}
                              className="btn-secondary flex items-center gap-2"
                            >
                              <ChatBubbleLeftRightIcon className="w-4 h-4" />
                              Chat
                            </button>
                          )}
                          
                          {order.status === 'PROCESSING' && (
                            <button
                              onClick={() => handleConfirmPayment(order.id)}
                              className="btn-success"
                            >
                              Confirmar Pago
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-500">Cantidad</p>
                          <p className="font-semibold">
                            {formatCurrency(order.amount, order.currency_from)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Tasa</p>
                          <p className="font-semibold">
                            {formatCurrency(order.rate, order.currency_to)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Total BOB</p>
                          <p className="font-semibold">
                            Bs. {((typeof order.amount === 'string' ? parseFloat(order.amount) || 0 : order.amount || 0) * (typeof order.rate === 'string' ? parseFloat(order.rate) || 0 : order.rate || 0) * 6.9).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Estado</p>
                          <p className="font-semibold">
                            {order.status === 'MATCHED' && 'Esperando pago'}
                            {order.status === 'PROCESSING' && 'Pago reportado'}
                            {order.status === 'COMPLETED' && 'Completada'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Metrics Tab */}
          {activeTab === 'metrics' && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Estadísticas de Rendimiento
              </h3>
              <div className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6">
                    <div className="flex items-center">
                      <ClockIcon className="w-8 h-8 text-blue-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-blue-800">Órdenes Pendientes</p>
                        <p className="text-3xl font-bold text-blue-900">{metrics.pending_orders}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-6">
                    <div className="flex items-center">
                      <CheckCircleIcon className="w-8 h-8 text-green-600" />
                      <div className="ml-4">
                        <p className="text-sm font-medium text-green-800">Órdenes Completadas</p>
                        <p className="text-3xl font-bold text-green-900">{metrics.completed_orders}</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-6">
                  <div className="flex items-center">
                    <CurrencyDollarIcon className="w-8 h-8 text-purple-600" />
                    <div className="ml-4">
                      <p className="text-sm font-medium text-purple-800">Volumen Total Procesado</p>
                      <p className="text-4xl font-bold text-purple-900">${(metrics.total_volume || 0).toFixed(2)}</p>
                      <p className="text-sm text-purple-600">
                        Tasa de éxito: {(metrics.total_orders || 0) > 0 ? (((metrics.completed_orders || 0) / (metrics.total_orders || 1)) * 100).toFixed(1) : 0}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Chat */}
      {isChatOpen && chatOrderId && (
        <TransactionChat
          orderId={chatOrderId}
          userType="cashier"
          onClose={handleCloseChat}
        />
      )}
    </DashboardLayout>
  )
}