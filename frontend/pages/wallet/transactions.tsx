import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useRequireAuth } from '../../lib/auth'
import { walletAPI, Transaction } from '../../lib/api'
import DashboardLayout from '../../components/DashboardLayout'
import TransactionTracker from '../../components/wallet/TransactionTracker'
import Link from 'next/link'
import { 
  ArrowLeftIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function TransactionsPage() {
  const router = useRouter()
  const { user } = useRequireAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filters, setFilters] = useState({
    currency: '',
    type: '',
    status: '',
    method: ''
  })

  useEffect(() => {
    if (user) {
      fetchTransactions()
    }
  }, [user, filters])

  const fetchTransactions = async () => {
    try {
      setIsLoading(true)
      const response = await walletAPI.getTransactions({
        ...filters,
        limit: 50
      })
      setTransactions(response.data.transactions || [])
    } catch (error: any) {
      console.error('❌ Transactions Fetch Error:', error)
      toast.error('Error al cargar las transacciones')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const clearFilters = () => {
    setFilters({
      currency: '',
      type: '',
      status: '',
      method: ''
    })
  }

  const hasActiveFilters = Object.values(filters).some(value => value !== '')

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
          <div className="flex items-center space-x-3">
            <Link
              href="/wallet"
              className="inline-flex items-center text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeftIcon className="w-5 h-5 mr-1" />
              Volver
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mis Transacciones</h1>
              <p className="mt-1 text-gray-600">
                Historial completo de depósitos y retiros
              </p>
            </div>
          </div>
          <div className="flex space-x-3 mt-4 sm:mt-0">
            <button
              onClick={fetchTransactions}
              className="btn-secondary inline-flex items-center"
            >
              <ArrowPathIcon className="w-4 h-4 mr-2" />
              Actualizar
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <FunnelIcon className="w-5 h-5 text-gray-400 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Filtros</h3>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                Limpiar filtros
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Moneda
              </label>
              <select
                value={filters.currency}
                onChange={(e) => handleFilterChange('currency', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Todas</option>
                <option value="USD">USD</option>
                <option value="BOB">BOB</option>
                <option value="USDT">USDT</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo
              </label>
              <select
                value={filters.type}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Todos</option>
                <option value="DEPOSIT">Depósitos</option>
                <option value="WITHDRAWAL">Retiros</option>
                <option value="TRANSFER_IN">Transferencias Recibidas</option>
                <option value="TRANSFER_OUT">Transferencias Enviadas</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Todos</option>
                <option value="PENDING">Pendientes</option>
                <option value="PROCESSING">Procesando</option>
                <option value="COMPLETED">Completadas</option>
                <option value="FAILED">Fallidas</option>
                <option value="CANCELLED">Canceladas</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Método
              </label>
              <select
                value={filters.method}
                onChange={(e) => handleFilterChange('method', e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Todos</option>
                <option value="PAYPAL">PayPal</option>
                <option value="STRIPE">Stripe</option>
                <option value="BANK">Banco</option>
                <option value="QR">Crypto QR</option>
                <option value="P2P">P2P</option>
              </select>
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="space-y-4">
          {transactions.length === 0 ? (
            <div className="card text-center py-12">
              <MagnifyingGlassIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No se encontraron transacciones
              </h3>
              <p className="text-gray-500 mb-6">
                {hasActiveFilters 
                  ? 'Intenta ajustar los filtros para ver más resultados'
                  : 'Aún no has realizado ninguna transacción'
                }
              </p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="btn-secondary"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">
                  Mostrando {transactions.length} transacciones
                </p>
              </div>

              <div className="space-y-3">
                {transactions.map((transaction) => (
                  <TransactionTracker
                    key={transaction.id}
                    transactionId={transaction.id}
                    autoRefresh={transaction.status === 'PENDING' || transaction.status === 'PROCESSING'}
                    refreshInterval={10000}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Summary Stats */}
        {transactions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="card text-center">
              <div className="text-2xl font-bold text-green-600">
                {transactions.filter(t => t.status === 'COMPLETED' && t.type === 'DEPOSIT').length}
              </div>
              <div className="text-sm text-gray-600">Depósitos Completados</div>
            </div>
            
            <div className="card text-center">
              <div className="text-2xl font-bold text-blue-600">
                {transactions.filter(t => t.status === 'COMPLETED' && t.type === 'WITHDRAWAL').length}
              </div>
              <div className="text-sm text-gray-600">Retiros Completados</div>
            </div>
            
            <div className="card text-center">
              <div className="text-2xl font-bold text-yellow-600">
                {transactions.filter(t => t.status === 'PENDING').length}
              </div>
              <div className="text-sm text-gray-600">Pendientes</div>
            </div>
            
            <div className="card text-center">
              <div className="text-2xl font-bold text-red-600">
                {transactions.filter(t => t.status === 'FAILED' || t.status === 'CANCELLED').length}
              </div>
              <div className="text-sm text-gray-600">Fallidas/Canceladas</div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}