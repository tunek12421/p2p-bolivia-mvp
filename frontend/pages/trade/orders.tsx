import { useState, useEffect } from 'react'
import { useRequireAuth } from '../../lib/auth'
import { p2pAPI, Order } from '../../lib/api'
import DashboardLayout from '../../components/DashboardLayout'
import Link from 'next/link'
import { 
  PlusIcon,
  EyeIcon,
  XMarkIcon,
  ChartBarIcon,
  FunnelIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function UserOrdersPage() {
  const { user } = useRequireAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [cancellingOrder, setCancellingOrder] = useState<string | null>(null)
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [typeFilter, setTypeFilter] = useState<string>('')

  useEffect(() => {
    if (user) {
      fetchUserOrders()
    }
  }, [user])

  const fetchUserOrders = async () => {
    try {
      setIsLoading(true)
      const response = await p2pAPI.getUserOrders()
      setOrders(response.data.orders || [])
    } catch (error) {
      console.error('Error fetching user orders:', error)
      toast.error('Error cargando tus órdenes')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('¿Estás seguro de que quieres cancelar esta orden?')) {
      return
    }

    try {
      setCancellingOrder(orderId)
      await p2pAPI.cancelOrder(orderId)
      toast.success('Orden cancelada exitosamente')
      fetchUserOrders() // Refresh the orders list
    } catch (error: any) {
      console.error('Error cancelling order:', error)
      const message = error.response?.data?.error || 'Error cancelando la orden'
      toast.error(message)
    } finally {
      setCancellingOrder(null)
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
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
    }).format(amount)
    
    if (currency === 'BOB') {
      formatted = formatted.replace('$', 'Bs. ')
    } else if (currency === 'USDT') {
      formatted = formatted.replace('$', 'USDT ')
    }
    
    return formatted
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <span className="badge-primary">Activa</span>
      case 'FILLED':
        return <span className="badge-success">Completada</span>
      case 'CANCELLED':
        return <span className="badge-danger">Cancelada</span>
      case 'PARTIAL':
        return <span className="badge-warning">Parcial</span>
      default:
        return <span className="badge">{status}</span>
    }
  }

  const getProgressPercentage = (order: Order) => {
    const filled = order.amount - order.remaining_amount
    return (filled / order.amount) * 100
  }

  const filteredOrders = orders.filter(order => {
    if (statusFilter && order.status !== statusFilter) return false
    if (typeFilter && order.type !== typeFilter) return false
    return true
  })

  const orderStats = {
    total: orders.length,
    active: orders.filter(o => o.status === 'ACTIVE').length,
    filled: orders.filter(o => o.status === 'FILLED').length,
    cancelled: orders.filter(o => o.status === 'CANCELLED').length
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
            <h1 className="text-2xl font-bold text-gray-900">Mis Órdenes</h1>
            <p className="mt-2 text-gray-600">
              Gestiona tus órdenes de trading activas e historial
            </p>
          </div>
          <div className="flex space-x-3 mt-4 sm:mt-0">
            <button
              onClick={fetchUserOrders}
              className="btn-secondary inline-flex items-center"
            >
              <ArrowPathIcon className="w-4 h-4 mr-2" />
              Actualizar
            </button>
            <Link 
              href="/trade/create" 
              className="btn-primary inline-flex items-center"
            >
              <PlusIcon className="w-5 h-5 mr-2" />
              Nueva Orden
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                <ChartBarIcon className="w-6 h-6 text-gray-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-bold text-gray-900">{orderStats.total}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                <ChartBarIcon className="w-6 h-6 text-primary-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Activas</p>
                <p className="text-2xl font-bold text-gray-900">{orderStats.active}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center">
                <ChartBarIcon className="w-6 h-6 text-success-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Completadas</p>
                <p className="text-2xl font-bold text-gray-900">{orderStats.filled}</p>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-danger-100 rounded-lg flex items-center justify-center">
                <ChartBarIcon className="w-6 h-6 text-danger-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-600">Canceladas</p>
                <p className="text-2xl font-bold text-gray-900">{orderStats.cancelled}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 sm:mb-0">
              Filtrar Órdenes
            </h3>
            <div className="flex items-center space-x-4">
              <select
                className="input"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">Todos los tipos</option>
                <option value="BUY">Compra</option>
                <option value="SELL">Venta</option>
              </select>
              
              <select
                className="input"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="ACTIVE">Activa</option>
                <option value="FILLED">Completada</option>
                <option value="CANCELLED">Cancelada</option>
                <option value="PARTIAL">Parcial</option>
              </select>
            </div>
          </div>

          {/* Orders Table */}
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <ChartBarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {orders.length === 0 ? 'No tienes órdenes aún' : 'No hay órdenes que coincidan con los filtros'}
              </h3>
              <p className="text-gray-500 mb-6">
                {orders.length === 0 
                  ? 'Crea tu primera orden para comenzar a trading'
                  : 'Intenta cambiar los filtros para ver más resultados'
                }
              </p>
              {orders.length === 0 && (
                <Link href="/trade/create" className="btn-primary">
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Crear Primera Orden
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">ID</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Tipo</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Par</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Cantidad</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Tasa</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Progreso</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Estado</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Fecha</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span className="text-sm font-mono text-gray-900">
                          {order.id.slice(0, 8)}...
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-sm font-medium ${
                          order.type === 'BUY' ? 'text-success-600' : 'text-danger-600'
                        }`}>
                          {order.type === 'BUY' ? 'Compra' : 'Venta'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {order.currency_from}/{order.currency_to}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        <div>
                          <p>{formatCurrency(order.amount, order.currency_from)}</p>
                          {order.remaining_amount < order.amount && (
                            <p className="text-xs text-gray-500">
                              {formatCurrency(order.remaining_amount, order.currency_from)} restante
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {formatCurrency(order.rate, order.currency_to)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="w-full">
                          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                            <span>{getProgressPercentage(order).toFixed(1)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${getProgressPercentage(order)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {new Date(order.created_at).toLocaleDateString('es-ES')}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          <button
                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                            title="Ver detalles"
                          >
                            <EyeIcon className="w-4 h-4" />
                          </button>
                          
                          {order.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleCancelOrder(order.id)}
                              disabled={cancellingOrder === order.id}
                              className="p-1 text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
                              title="Cancelar orden"
                            >
                              {cancellingOrder === order.id ? (
                                <div className="w-4 h-4">
                                  <div className="loading-spinner w-4 h-4"></div>
                                </div>
                              ) : (
                                <XMarkIcon className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/trade/create" className="card hover:shadow-md transition-shadow">
            <div className="flex items-center p-2">
              <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                <PlusIcon className="w-6 h-6 text-primary-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Nueva Orden</h3>
                <p className="text-sm text-gray-500">Crear una nueva orden de trading</p>
              </div>
            </div>
          </Link>
          
          <Link href="/trade" className="card hover:shadow-md transition-shadow">
            <div className="flex items-center p-2">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <ChartBarIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Ver Mercado</h3>
                <p className="text-sm text-gray-500">Explorar órdenes disponibles</p>
              </div>
            </div>
          </Link>
          
          <div className="card">
            <div className="flex items-center p-2">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <ChartBarIcon className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Éxito</h3>
                <p className="text-xl font-bold text-gray-900">
                  {orderStats.total > 0 ? Math.round((orderStats.filled / orderStats.total) * 100) : 0}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}