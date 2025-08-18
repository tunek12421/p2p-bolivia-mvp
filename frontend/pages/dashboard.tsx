import { useState, useEffect } from 'react'
import { useRequireAuth } from '../lib/auth'
import { p2pAPI, walletAPI, WalletBalance, Order, TradingStats } from '../lib/api'
import { 
  CurrencyDollarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChartBarIcon,
  PlusIcon,
  EyeIcon
} from '@heroicons/react/24/outline'
import DashboardLayout from '../components/DashboardLayout'
import Link from 'next/link'
import toast from 'react-hot-toast'

export default function DashboardPage() {
  const { user } = useRequireAuth()
  const [wallets, setWallets] = useState<WalletBalance[]>([])
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [stats, setStats] = useState<TradingStats | null>(null)
  const [rates, setRates] = useState<Record<string, any>>({})
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchDashboardData()
    }
  }, [user])

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true)
      
      const [walletsRes, ordersRes, statsRes, ratesRes] = await Promise.allSettled([
        walletAPI.getWallets(),
        p2pAPI.getUserOrders(),
        p2pAPI.getTradingStats(),
        p2pAPI.getRates()
      ])

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
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      toast.error('Failed to load dashboard data')
    } finally {
      setIsLoading(false)
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
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
    }).format(amount)
    
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
                        {wallet.locked_balance > 0 && (
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
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Tasas de Mercado</h3>
              <div className="space-y-3">
                {Object.entries(rates).slice(0, 3).map(([pair, rate]) => {
                  const isUp = Math.random() > 0.5
                  return (
                    <div key={pair} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {pair.replace('_', '/')}
                      </span>
                      <div className="flex items-center">
                        <span className="text-sm text-gray-600 mr-2">
                          {(() => {
                            if (typeof rate === 'object' && rate !== null) {
                              const sellPrice = rate.best_sell || rate.best_buy || 0;
                              return parseFloat(String(sellPrice)).toFixed(4);
                            }
                            return parseFloat(String(rate || 0)).toFixed(4);
                          })()}
                        </span>
                        {isUp ? (
                          <ArrowUpIcon className="w-4 h-4 text-success-500" />
                        ) : (
                          <ArrowDownIcon className="w-4 h-4 text-danger-500" />
                        )}
                      </div>
                    </div>
                  )
                })}
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
                <Link href="/wallet/deposit" className="btn-secondary w-full">
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