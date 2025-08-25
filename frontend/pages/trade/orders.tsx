import { useState, useEffect } from 'react'
import { useRequireAuth } from '../../lib/auth'
import { p2pAPI, Order } from '../../lib/api'
import DashboardLayout from '../../components/DashboardLayout'
import OrderDetailsModal from '../../components/p2p/OrderDetailsModal'
import TransactionChat from '../../components/TransactionChat'
import Link from 'next/link'
import { 
  ArrowLeftIcon,
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  CogIcon,
  EyeIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function UserOrdersPage() {
  const { user } = useRequireAuth()
  const [userOrders, setUserOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  // Modal states
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)
  
  // Chat states
  const [chatOrderId, setChatOrderId] = useState<string | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)

  useEffect(() => {
    if (user) {
      fetchUserOrders()
    }
  }, [user])

  const fetchUserOrders = async () => {
    try {
      setIsLoading(true)
      console.log('🔄 Fetching user orders...')
      
      const response = await p2pAPI.getUserOrders()
      console.log('📦 User orders response:', response.data)
      
      setUserOrders(response.data.orders || [])
    } catch (error) {
      console.error('❌ Error fetching user orders:', error)
      toast.error('Error cargando tus órdenes')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelOrder = async (orderId: string) => {
    try {
      await p2pAPI.cancelOrder(orderId)
      toast.success('Orden cancelada exitosamente')
      fetchUserOrders()
    } catch (error: any) {
      console.error('❌ Error canceling order:', error)
      toast.error(error.response?.data?.error || 'Error cancelando la orden')
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'PENDING': { 
        color: 'bg-yellow-100 text-yellow-800', 
        icon: ClockIcon,
        text: 'Esperando Cajero',
        animation: true
      },
      'MATCHED': { 
        color: 'bg-blue-100 text-blue-800', 
        icon: CogIcon,
        text: 'Asignada',
        animation: false
      },
      'PROCESSING': { 
        color: 'bg-purple-100 text-purple-800', 
        icon: CogIcon,
        text: 'En Proceso',
        animation: false
      },
      'COMPLETED': { 
        color: 'bg-green-100 text-green-800', 
        icon: CheckCircleIcon,
        text: 'Completada',
        animation: false
      },
      'CANCELLED': { 
        color: 'bg-red-100 text-red-800', 
        icon: XCircleIcon,
        text: 'Cancelada',
        animation: false
      }
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig['PENDING']
    const Icon = config.icon

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color} ${config.animation ? 'animate-pulse' : ''}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.text}
      </span>
    )
  }

  const formatCurrency = (amount: number | string, currency: string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
    if (currency === 'BOB') {
      return `Bs. ${numAmount.toFixed(2)}`
    }
    if (currency === 'USDT') {
      return `${numAmount.toFixed(4)} USDT`
    }
    return `$${numAmount.toFixed(4)}`
  }

  const canCancelOrder = (order: Order) => {
    return order.status === 'PENDING' || order.status === 'MATCHED'
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

  if (!user) return null

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link 
              href="/trade"
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm leading-4 font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              <ArrowLeftIcon className="w-4 h-4 mr-2" />
              Volver
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mis Órdenes P2P</h1>
              <p className="text-gray-600">Gestiona y monitorea tus órdenes de intercambio</p>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="card">
            <div className="p-4">
              <div className="flex items-center">
                <ClockIcon className="w-8 h-8 text-yellow-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Pendientes</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {userOrders.filter(o => o.status === 'PENDING').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="p-4">
              <div className="flex items-center">
                <CogIcon className="w-8 h-8 text-blue-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">En Proceso</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {userOrders.filter(o => ['MATCHED', 'PROCESSING'].includes(o.status)).length}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="p-4">
              <div className="flex items-center">
                <CheckCircleIcon className="w-8 h-8 text-green-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Completadas</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {userOrders.filter(o => o.status === 'COMPLETED').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <div className="card">
            <div className="p-4">
              <div className="flex items-center">
                <XCircleIcon className="w-8 h-8 text-red-600" />
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-500">Canceladas</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {userOrders.filter(o => o.status === 'CANCELLED').length}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Orders Table */}
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Mis Órdenes</h3>
            <p className="text-sm text-gray-500">
              {userOrders.length === 0 ? 'No tienes órdenes creadas' : `${userOrders.length} órdenes en total`}
            </p>
          </div>
          
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
              <p className="text-gray-500">Cargando órdenes...</p>
            </div>
          ) : userOrders.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500 mb-4">No tienes órdenes creadas aún</p>
              <Link
                href="/trade/create"
                className="btn-primary inline-flex items-center"
              >
                Crear Primera Orden
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Orden
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Par
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tipo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Cantidad
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tasa
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {userOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-mono text-gray-900">
                          {order.id.substring(0, 8)}...
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {order.currency_from}/{order.currency_to}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          order.type === 'BUY' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {order.type === 'BUY' ? 'Comprar' : 'Vender'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(order.amount, order.currency_from)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {typeof order.rate === 'string' ? parseFloat(order.rate).toFixed(2) : order.rate.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(order.status)}
                        {order.status === 'PENDING' && (
                          <div className="text-xs text-yellow-600 mt-1 animate-pulse">
                            ⏳ Esperando cajero...
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                        <button
                          onClick={() => {
                            setSelectedOrderId(order.id)
                            setIsDetailsModalOpen(true)
                          }}
                          className="text-blue-600 hover:text-blue-900"
                          title="Ver detalles"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>
                        
                        {canOpenChat(order) && (
                          <button
                            onClick={() => handleOpenChat(order.id)}
                            className="text-green-600 hover:text-green-900"
                            title="Abrir chat"
                          >
                            <ChatBubbleLeftRightIcon className="w-4 h-4" />
                          </button>
                        )}
                        
                        {canCancelOrder(order) && (
                          <button
                            onClick={() => {
                              if (confirm('¿Estás seguro de que deseas cancelar esta orden?')) {
                                handleCancelOrder(order.id)
                              }
                            }}
                            className="text-red-600 hover:text-red-900"
                            title="Cancelar orden"
                          >
                            <XCircleIcon className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Order Details Modal */}
      <OrderDetailsModal
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false)
          setSelectedOrderId(null)
        }}
        orderId={selectedOrderId}
        onOrderUpdate={fetchUserOrders}
      />

      {/* Transaction Chat */}
      {isChatOpen && chatOrderId && (
        <TransactionChat
          orderId={chatOrderId}
          userType="user"
          onClose={handleCloseChat}
        />
      )}
    </DashboardLayout>
  )
}