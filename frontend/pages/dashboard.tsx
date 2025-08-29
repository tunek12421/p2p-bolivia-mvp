import { useState, useEffect } from 'react'
import { useRequireAuth } from '../lib/auth'
import { p2pAPI, walletAPI, userAPI, WalletBalance, Order, TradingStats, UserProfile } from '../lib/api'
import { fetchMarketRates, MarketRates, formatRate, getRateChange, formatIntuitiveRate, getConversionExample } from '../lib/marketRates'
import { 
  CurrencyDollarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChartBarIcon,
  PlusIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'
import DashboardLayout from '../components/DashboardLayout'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function DashboardPage() {
  const { user } = useRequireAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [wallets, setWallets] = useState<WalletBalance[]>([])
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<TradingStats | null>(null)
  const [rates, setRates] = useState<Record<string, any>>({})
  const [marketRates, setMarketRates] = useState<MarketRates | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchDashboardData()
    }
  }, [user])

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

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true)
      
      const [profileRes, walletsRes, ordersRes, statsRes, ratesRes, marketRatesRes] = await Promise.allSettled([
        userAPI.getProfile(),
        walletAPI.getWallets(),
        p2pAPI.getUserOrders(),
        p2pAPI.getTradingStats(),
        p2pAPI.getRates(),
        fetchMarketRates()
      ])

      if (profileRes.status === 'fulfilled') {
        setProfile(profileRes.value.data)
      }

      if (walletsRes.status === 'fulfilled') {
        setWallets(walletsRes.value.data.wallets || [])
      }

      if (ordersRes.status === 'fulfilled') {
        setRecentOrders(ordersRes.value.data.orders?.slice(0, 5) || [])
      }

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data)
      }

      if (ratesRes.status === 'fulfilled') {
        setRates(ratesRes.value.data)
      }

      if (marketRatesRes.status === 'fulfilled') {
        setMarketRates(marketRatesRes.value)
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (amount: number | string, currency: string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount
    // Map crypto currencies to valid ISO codes for formatting
    const currencyMapping: { [key: string]: string } = {
      'BOB': 'USD', // Format as USD but replace symbol
      'USDT': 'USD', // Format as USD but replace symbol
      'USD': 'USD'
    }
    
    const formatCurrencyCode = currencyMapping[currency] || 'USD'
    
    let formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: formatCurrencyCode,
      minimumFractionDigits: currency === 'BOB' ? 2 : 4,
      maximumFractionDigits: currency === 'BOB' ? 2 : 4,
    }).format(numAmount)
    
    // Replace the dollar symbol with appropriate currency symbol
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
        {/* KYC Alert */}
        {profile && profile.kyc_level < 3 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-yellow-800">
                  Verificación KYC Incompleta
                </h3>
                <p className="mt-1 text-sm text-yellow-700">
                  Estás en nivel {profile.kyc_level} de 3. Completa tu verificación para acceder a límites más altos.
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <Link 
                    href="/profile#kyc" 
                    className="text-yellow-800 underline text-sm font-medium hover:text-yellow-900"
                  >
                    Completar verificación →
                  </Link>
                  <div className="flex items-center text-xs text-yellow-700">
                    <ShieldCheckIcon className="w-4 h-4 mr-1" />
                    Nivel {profile.kyc_level}/3
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-lg p-6 text-white">
          <h1 className="text-2xl font-bold mb-2">
            ¡Bienvenido de vuelta, {user?.firstName}!
          </h1>
          <p className="text-primary-100">
            ¿Listo para comenzar a intercambiar? Revisa tu portafolio y actividad reciente a continuación.
          </p>
        </div>

        {/* Quick Stats */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="card">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                  <ChartBarIcon className="w-6 h-6 text-primary-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Órdenes Totales</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total_orders}</p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center">
                  <ArrowUpIcon className="w-6 h-6 text-success-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Órdenes Activas</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.active_orders}</p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <CurrencyDollarIcon className="w-6 h-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Volumen Total</p>
                  <p className="text-2xl font-bold text-gray-900">{parseFloat(String(stats.total_volume || '0')).toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <ArrowUpIcon className="w-6 h-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-600">Tasa de Éxito</p>
                  <p className="text-2xl font-bold text-gray-900">{parseFloat(String(stats.success_rate || '0')).toFixed(1)}%</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Wallets */}
          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Tus Billeteras</h2>
                <Link href="/wallet" className="btn-primary text-sm">
                  <EyeIcon className="w-4 h-4 mr-2" />
                  Ver Todo
                </Link>
              </div>

              {wallets.length === 0 ? (
                <div className="text-center py-8">
                  <CurrencyDollarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No se encontraron billeteras</p>
                  <Link href="/wallet" className="btn-primary">
                    Configura tu primera billetera
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {wallets.slice(0, 3).map((wallet) => (
                    <div key={wallet.currency} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
                          <span className="text-primary-600 font-semibold text-sm">
                            {wallet.currency}
                          </span>
                        </div>
                        <div className="ml-3">
                          <p className="font-medium text-gray-900">{wallet.currency}</p>
                          <p className="text-sm text-gray-500">Disponible</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(wallet.balance, wallet.currency)}
                        </p>
                        {(typeof wallet.locked_balance === 'string' ? parseFloat(wallet.locked_balance) : wallet.locked_balance) > 0 && (
                          <p className="text-sm text-orange-600">
                            {formatCurrency(wallet.locked_balance, wallet.currency)} bloqueado
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-6">
            {/* Market Rates */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Tasas de Mercado</h3>
                  <p className="text-xs text-gray-600 flex items-center mt-1">
                    <span className="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                    Binance P2P Bolivia
                  </p>
                </div>
                {marketRates && (
                  <span className="text-xs text-gray-500">
                    {new Date(marketRates.lastUpdated).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {marketRates ? [
                  { 
                    fromCurrency: 'USD',
                    toCurrency: 'BOB',
                    rate: marketRates.USD_BOB,
                    title: 'Dólar Paralelo',
                    icon: '💵',
                    priority: true
                  },
                  { 
                    fromCurrency: 'USDT',
                    toCurrency: 'BOB',
                    rate: marketRates.USDT_BOB,
                    title: 'Tether',
                    icon: '₮',
                    priority: false
                  }
                ].map(({ fromCurrency, toCurrency, rate, title, icon, priority }) => {
                  const { isUp } = getRateChange()
                  return (
                    <div key={`${fromCurrency}-${toCurrency}`} className={`rounded-lg p-3 ${priority ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          <span className="text-lg mr-2">{icon}</span>
                          <span className="text-sm font-semibold text-gray-900">
                            {title}
                          </span>
                          {priority && (
                            <span className="ml-2 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                              Principal
                            </span>
                          )}
                        </div>
                        <div className="flex items-center">
                          {isUp ? (
                            <ArrowUpIcon className="w-4 h-4 text-success-500" />
                          ) : (
                            <ArrowDownIcon className="w-4 h-4 text-danger-500" />
                          )}
                        </div>
                      </div>
                      
                      <div className="mb-2">
                        <p className={`text-lg font-bold ${priority ? 'text-green-700' : 'text-primary-600'}`}>
                          {formatIntuitiveRate(fromCurrency, toCurrency, rate)}
                        </p>
                      </div>
                      
                      <div className={`text-center py-1 px-2 rounded ${priority ? 'bg-white' : 'bg-white'}`}>
                        <p className="text-xs text-gray-500 font-medium">
                          {getConversionExample(fromCurrency, toCurrency, rate)}
                        </p>
                      </div>
                    </div>
                  )
                }) : (
                  <div className="space-y-3">
                    {['BOB/USD', 'BOB/USDT', 'USDT/BOB'].map((pair) => (
                      <div key={pair} className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{pair}</span>
                        <div className="flex items-center">
                          <span className="text-sm text-gray-400 mr-2">Cargando...</span>
                          <div className="w-4 h-4 bg-gray-200 rounded animate-pulse"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h3>
              <div className="space-y-3">
                <Link href="/trade/create" className="btn-primary w-full">
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Crear Nueva Orden
                </Link>
                <Link href="/trade" className="btn-secondary w-full">
                  Explorar Órdenes
                </Link>
                <Link href="/wallet" className="btn-secondary w-full">
                  Depositar Fondos
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Órdenes Recientes</h2>
            <Link href="/trade/orders" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              Ver Todas las Órdenes
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="text-center py-8">
              <ChartBarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">Aún no hay órdenes</p>
              <Link href="/trade/create" className="btn-primary">
                Crea tu primera orden
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Tipo</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Par</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Cantidad</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Tasa</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Estado</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-gray-100">
                      <td className="py-3 px-4">
                        <span className={`text-sm font-medium ${
                          order.type === 'BUY' ? 'text-success-600' : 'text-danger-600'
                        }`}>
                          {order.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {order.currency_from}/{order.currency_to}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {formatCurrency(order.amount, order.currency_from)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-900">
                        {formatCurrency(order.rate, order.currency_to)}
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(order.status)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {new Date(order.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}