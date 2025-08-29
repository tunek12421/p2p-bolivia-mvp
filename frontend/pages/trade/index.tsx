import { useState, useEffect } from 'react'
import { useRequireAuth } from '../../lib/auth'
import { p2pAPI, Order } from '../../lib/api'
import { fetchMarketRates, MarketRates, formatRate, getRateChange, formatIntuitiveRate, getConversionExample } from '../../lib/marketRates'
import DashboardLayout from '../../components/DashboardLayout'
import OrderDetailsModal from '../../components/p2p/OrderDetailsModal'
import Link from 'next/link'
import { 
  PlusIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ChartBarIcon,
  EyeIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function TradePage() {
  const { user } = useRequireAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [rates, setRates] = useState<Record<string, any>>({})
  const [marketRates, setMarketRates] = useState<MarketRates | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  
  // Filter states
  const [filters, setFilters] = useState({
    currency_from: '',
    currency_to: '',
    type: '',
    search: ''
  })
  
  const [activeTab, setActiveTab] = useState<'all' | 'buy' | 'sell'>('all')
  
  // Modal states
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false)

  useEffect(() => {
    if (user) {
      fetchTradeData()
    }
  }, [user, filters])

  // Auto-refresh market rates every 2 minutes
  useEffect(() => {
    const refreshRates = async () => {
      try {
        const newRates = await fetchMarketRates()
        setMarketRates(newRates)
      } catch (error) {
        console.error('Failed to refresh market rates:', error)
      }
    }

    // Set up interval for market rates refresh
    const interval = setInterval(refreshRates, 2 * 60 * 1000) // 2 minutes

    return () => clearInterval(interval)
  }, [])

  const fetchTradeData = async () => {
    try {
      setIsLoading(true)
      
      // Build filter params
      const params = {
        ...(filters.currency_from && { currency_from: filters.currency_from }),
        ...(filters.currency_to && { currency_to: filters.currency_to }),
        ...(filters.type && { type: filters.type }),
        limit: 50
      }
      
      const [ordersRes, ratesRes, marketRatesRes] = await Promise.allSettled([
        p2pAPI.getOrders(params),
        p2pAPI.getRates(),
        fetchMarketRates()
      ])

      if (ordersRes.status === 'fulfilled') {
        setOrders(ordersRes.value.data.orders || [])
      }

      if (ratesRes.status === 'fulfilled') {
        setRates(ratesRes.value.data)
      }

      if (marketRatesRes.status === 'fulfilled') {
        setMarketRates(marketRatesRes.value)
      }
    } catch (error) {
      console.error('Error fetching trade data:', error)
      toast.error('Error cargando datos de trading')
    } finally {
      setIsLoading(false)
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
      case 'ACTIVE':
        return <span className="badge-primary">Activa</span>
      case 'FILLED':
        return <span className="badge-success">Completada</span>
      case 'CANCELLED':
        return <span className="badge-danger">Cancelada</span>
      case 'PARTIAL':
        return <span className="badge-warning">Parcial</span>
      case 'EXPIRED':
        return <span className="badge bg-gray-100 text-gray-800">Expirada</span>
      default:
        return <span className="badge">{status}</span>
    }
  }

  const handleCancelOrder = async (orderId: string) => {
    try {
      await p2pAPI.cancelOrder(orderId)
      toast.success('Orden cancelada exitosamente')
      await fetchTradeData() // Refresh orders
    } catch (error: any) {
      console.error('Error canceling order:', error)
      toast.error(error.response?.data?.message || 'Error cancelando la orden')
    }
  }

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'buy' && order.type !== 'BUY') return false
    if (activeTab === 'sell' && order.type !== 'SELL') return false
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase()
      return (
        order.currency_from.toLowerCase().includes(searchTerm) ||
        order.currency_to.toLowerCase().includes(searchTerm) ||
        order.id.toLowerCase().includes(searchTerm)
      )
    }
    return true
  })

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
            <h1 className="text-2xl font-bold text-gray-900">Centro de Trading</h1>
            <p className="mt-2 text-gray-600">
              Intercambia Bolivianos, USD y USDT de forma peer-to-peer
            </p>
          </div>
          <Link 
            href="/trade/create" 
            className="btn-primary mt-4 sm:mt-0 inline-flex items-center"
          >
            <PlusIcon className="w-5 h-5 mr-2" />
            Crear Nueva Orden
          </Link>
        </div>

        {/* Market Rates Card */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Tasas de Mercado en Tiempo Real</h3>
              <p className="text-xs text-gray-600 flex items-center mt-1">
                <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                Datos reales de Binance P2P Bolivia
              </p>
            </div>
            {marketRates && (
              <div className="text-right">
                <span className="text-xs text-gray-500">
                  Actualizado: {new Date(marketRates.lastUpdated).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {marketRates ? [
              { 
                fromCurrency: 'USD',
                toCurrency: 'BOB', 
                rate: marketRates.USD_BOB, 
                title: 'Dólar Paralelo Bolivia',
                subtitle: 'Binance P2P - Precio real',
                icon: '💵🇧🇴',
                highlight: true
              },
              { 
                fromCurrency: 'USDT',
                toCurrency: 'BOB', 
                rate: marketRates.USDT_BOB, 
                title: 'Tether a Bolivianos', 
                subtitle: 'Binance P2P - Real',
                icon: '₮🇧🇴',
                highlight: false
              },
              { 
                fromCurrency: 'USD',
                toCurrency: 'USDT', 
                rate: marketRates.USD_USDT, 
                title: 'Dólar a Tether',
                subtitle: 'Conversión USD-USDT',
                icon: '💵₮',
                highlight: false
              }
            ].map(({ fromCurrency, toCurrency, rate, title, subtitle, icon, highlight }) => {
              const { isUp, change } = getRateChange()
              return (
                <div key={`${fromCurrency}-${toCurrency}`} className={`bg-white rounded-lg p-4 border-2 hover:shadow-md transition-all ${highlight ? 'border-green-300 bg-green-50' : 'border-gray-200 hover:border-primary-200'}`}>
                  <div className="text-center mb-3">
                    <div className="text-3xl mb-2">{icon}</div>
                    <p className="text-sm font-bold text-gray-900">{title}</p>
                    <p className="text-xs text-gray-600">{subtitle}</p>
                    {highlight && (
                      <span className="inline-block bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full mt-1">
                        🚀 Más usado
                      </span>
                    )}
                  </div>
                  
                  <div className="text-center mb-3">
                    <p className={`text-xl font-bold mb-1 ${highlight ? 'text-green-600' : 'text-primary-600'}`}>
                      {formatIntuitiveRate(fromCurrency, toCurrency, rate)}
                    </p>
                    <div className="flex items-center justify-center space-x-1">
                      {isUp ? (
                        <ArrowUpIcon className="w-4 h-4 text-success-500" />
                      ) : (
                        <ArrowDownIcon className="w-4 h-4 text-danger-500" />
                      )}
                      <span className={`text-xs font-medium ${isUp ? 'text-success-600' : 'text-danger-600'}`}>
                        {isUp ? '+' : ''}{(change * 100).toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div className={`rounded-md p-3 text-center ${highlight ? 'bg-white border border-green-200' : 'bg-gray-50'}`}>
                    <p className="text-xs text-gray-600 font-medium">Ejemplo:</p>
                    <p className="text-sm font-bold text-gray-800">
                      {getConversionExample(fromCurrency, toCurrency, rate)}
                    </p>
                  </div>
                </div>
              )
            }) : (
              // Loading state
              [1, 2, 3].map((i) => (
                <div key={i} className="bg-gray-50 rounded-lg p-4 border">
                  <div className="animate-pulse">
                    <div className="flex items-center justify-between mb-2">
                      <div className="h-4 bg-gray-300 rounded w-16"></div>
                      <div className="h-3 bg-gray-300 rounded w-8"></div>
                    </div>
                    <div className="h-6 bg-gray-300 rounded w-20 mb-2"></div>
                    <div className="h-3 bg-gray-300 rounded w-24"></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Filters and Search */}
        <div className="card">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
            <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
              {[
                { key: 'all', label: 'Todas' },
                { key: 'buy', label: 'Compra' },
                { key: 'sell', label: 'Venta' }
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as 'all' | 'buy' | 'sell')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === tab.key
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            
            <div className="flex items-center space-x-4 mt-4 sm:mt-0">
              {/* Search */}
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar órdenes..."
                  className="input pl-10 w-64"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
              
              {/* Currency Filters */}
              <select
                className="input"
                value={filters.currency_from}
                onChange={(e) => setFilters({ ...filters, currency_from: e.target.value })}
              >
                <option value="">Desde</option>
                <option value="BOB">BOB</option>
                <option value="USD">USD</option>
                <option value="USDT">USDT</option>
              </select>
              
              <select
                className="input"
                value={filters.currency_to}
                onChange={(e) => setFilters({ ...filters, currency_to: e.target.value })}
              >
                <option value="">Hacia</option>
                <option value="BOB">BOB</option>
                <option value="USD">USD</option>
                <option value="USDT">USDT</option>
              </select>
            </div>
          </div>

          {/* Orders Table */}
          {filteredOrders.length === 0 ? (
            <div className="text-center py-12">
              <ChartBarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay órdenes disponibles</h3>
              <p className="text-gray-500 mb-6">
                No se encontraron órdenes que coincidan con tus filtros actuales.
              </p>
              <Link href="/trade/create" className="btn-primary">
                <PlusIcon className="w-4 h-4 mr-2" />
                Crear Primera Orden
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Usuario</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Tipo</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Par</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Cantidad</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Tasa</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Límites</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Métodos de Pago</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Estado</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                            <span className="text-primary-600 font-semibold text-xs">
                              {order.user_id.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <span className="ml-3 text-sm text-gray-900">
                            {order.user_id.slice(0, 8)}...
                          </span>
                        </div>
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
                          <p>{formatCurrency(order.remaining_amount, order.currency_from)}</p>
                          <p className="text-xs text-gray-500">
                            de {formatCurrency(order.amount, order.currency_from)}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {formatCurrency(order.rate, order.currency_to)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        <div className="text-xs">
                          <p>Min: {formatCurrency(order.min_amount, order.currency_from)}</p>
                          <p>Max: {formatCurrency(order.max_amount, order.currency_from)}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {order.payment_methods.slice(0, 2).map((method) => (
                            <span key={method} className="badge text-xs">
                              {method.replace('_', ' ').toUpperCase()}
                            </span>
                          ))}
                          {order.payment_methods.length > 2 && (
                            <span className="badge text-xs">
                              +{order.payment_methods.length - 2}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex justify-end space-x-2">
                          {/* View Details Button - show for P2P orders */}
                          {['PENDING', 'MATCHED', 'PROCESSING', 'COMPLETED'].includes(order.status) && (
                            <button
                              onClick={() => {
                                setSelectedOrderId(order.id)
                                setIsDetailsModalOpen(true)
                              }}
                              className="text-blue-600 hover:text-blue-900 flex items-center p-1 rounded"
                              title="Ver detalles"
                            >
                              <EyeIcon className="w-4 h-4" />
                            </button>
                          )}
                          {/* Cancel Button - only for user's own active orders */}
                          {order.status === 'ACTIVE' && order.user_id === user?.id && (
                            <button
                              onClick={() => handleCancelOrder(order.id)}
                              className="text-red-600 hover:text-red-900 text-xs px-2 py-1 rounded"
                            >
                              Cancelar
                            </button>
                          )}
                          {/* Trade Button - for other users' active orders */}
                          {order.status === 'ACTIVE' && order.user_id !== user?.id && (
                            <button className="btn-primary text-xs">
                              {order.type === 'BUY' ? 'Vender' : 'Comprar'}
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
                <h3 className="text-lg font-medium text-gray-900">Crear Orden</h3>
                <p className="text-sm text-gray-500">Publica una nueva orden de trading</p>
              </div>
            </div>
          </Link>
          
          <Link href="/trade/orders" className="card hover:shadow-md transition-shadow">
            <div className="flex items-center p-2">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <ChartBarIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Mis Órdenes</h3>
                <p className="text-sm text-gray-500">Ver y gestionar mis órdenes</p>
              </div>
            </div>
          </Link>
          
          <div className="card">
            <div className="flex items-center p-2">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <ArrowUpIcon className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Órdenes Activas</h3>
                <p className="text-xl font-bold text-gray-900">{orders.filter(o => o.status === 'ACTIVE').length}</p>
              </div>
            </div>
          </div>
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
        onOrderUpdate={fetchTradeData}
      />
    </DashboardLayout>
  )
}