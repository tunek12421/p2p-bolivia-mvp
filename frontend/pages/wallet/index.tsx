import { useState, useEffect } from 'react'
import { useRequireAuth } from '../../lib/auth'
import { walletAPI, WalletBalance, Transaction } from '../../lib/api'
import DashboardLayout from '../../components/DashboardLayout'
import BankTransferModal from '../../components/wallet/BankTransferModal'
import QRModal from '../../components/wallet/QRModal'
import Link from 'next/link'
import { 
  PlusIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CurrencyDollarIcon,
  ArrowPathIcon,
  EyeIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function WalletPage() {
  const { user } = useRequireAuth()
  const [wallets, setWallets] = useState<WalletBalance[]>([])
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true)
  
  // Modal states
  const [isBankModalOpen, setIsBankModalOpen] = useState(false)
  const [isQRModalOpen, setIsQRModalOpen] = useState(false)
  const [modalType, setModalType] = useState<'deposit' | 'withdrawal'>('deposit')
  const [selectedWallet, setSelectedWallet] = useState<WalletBalance | null>(null)

  useEffect(() => {
    if (user) {
      fetchWalletData()
    }
  }, [user])

  const fetchWalletData = async () => {
    try {
      setIsLoading(true)
      setIsLoadingTransactions(true)
      
      const [walletsRes, transactionsRes] = await Promise.allSettled([
        walletAPI.getWallets(),
        walletAPI.getTransactions({ limit: 10 })
      ])

      if (walletsRes.status === 'fulfilled') {
        setWallets(walletsRes.value.data.wallets || [])
      }

      if (transactionsRes.status === 'fulfilled') {
        setRecentTransactions(transactionsRes.value.data.transactions || [])
      }
    } catch (error) {
      console.error('Error fetching wallet data:', error)
      toast.error('Error cargando datos de billeteras')
    } finally {
      setIsLoading(false)
      setIsLoadingTransactions(false)
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

  const getTransactionTypeIcon = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
      case 'TRANSFER_IN':
        return <ArrowDownIcon className="w-4 h-4 text-success-600" />
      case 'WITHDRAWAL':
      case 'TRANSFER_OUT':
        return <ArrowUpIcon className="w-4 h-4 text-danger-600" />
      case 'FEE':
        return <CurrencyDollarIcon className="w-4 h-4 text-gray-600" />
      default:
        return <ClockIcon className="w-4 h-4 text-gray-600" />
    }
  }

  const getTransactionTypeName = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
        return 'Depósito'
      case 'WITHDRAWAL':
        return 'Retiro'
      case 'TRANSFER_IN':
        return 'Transferencia Recibida'
      case 'TRANSFER_OUT':
        return 'Transferencia Enviada'
      case 'FEE':
        return 'Comisión'
      default:
        return type
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <span className="badge-success">Completada</span>
      case 'PENDING':
        return <span className="badge-warning">Pendiente</span>
      case 'FAILED':
        return <span className="badge-danger">Fallida</span>
      case 'CANCELLED':
        return <span className="badge-danger">Cancelada</span>
      default:
        return <span className="badge">{status}</span>
    }
  }

  const getTotalBalance = () => {
    return wallets.reduce((total, wallet) => {
      // Convertir todo a USD para el cálculo total (simplificado)
      let balanceInUSD = typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance
      if (wallet.currency === 'BOB') {
        balanceInUSD = (typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance) / 6.9 // Aproximación BOB a USD
      }
      return total + balanceInUSD
    }, 0)
  }

  const handleDepositClick = (wallet: WalletBalance) => {
    setSelectedWallet(wallet)
    setModalType('deposit')
    
    // Determine which modal to open based on currency
    if (wallet.currency === 'USDT') {
      setIsQRModalOpen(true)
    } else {
      // BOB or USD use bank transfer
      setIsBankModalOpen(true)
    }
  }

  const handleWithdrawClick = (wallet: WalletBalance) => {
    if ((typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance) - (typeof wallet.locked_balance === 'string' ? parseFloat(wallet.locked_balance) : wallet.locked_balance) <= 0) {
      toast.error('No tienes fondos disponibles para retirar')
      return
    }
    
    setSelectedWallet(wallet)
    setModalType('withdrawal')
    
    // Only bank transfers for withdrawals (USDT withdrawals disabled for now)
    if (wallet.currency === 'USDT') {
      toast.error('Retiros de USDT próximamente disponibles')
      return
    }
    
    setIsBankModalOpen(true)
  }

  const getPaymentMethodText = (currency: string, type: 'deposit' | 'withdrawal') => {
    if (currency === 'USDT') {
      if (type === 'deposit') return 'Código QR / Red TRC20'
      return 'Próximamente disponible'
    } else {
      return 'Transferencia bancaria'
    }
  }

  const isPaymentAvailable = (currency: string, type: 'deposit' | 'withdrawal') => {
    if (currency === 'USDT' && type === 'withdrawal') return false
    return true
  }

  const handleModalSuccess = () => {
    fetchWalletData() // Actualizar datos después de una transacción exitosa
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
            <h1 className="text-2xl font-bold text-gray-900">Mi Billetera</h1>
            <p className="mt-2 text-gray-600">
              Gestiona tus saldos y transacciones
            </p>
          </div>
          <div className="flex space-x-3 mt-4 sm:mt-0">
            <button
              onClick={fetchWalletData}
              className="btn-secondary inline-flex items-center"
            >
              <ArrowPathIcon className="w-4 h-4 mr-2" />
              Actualizar
            </button>
          </div>
        </div>

        {/* Total Balance Card */}
        <div className="bg-gradient-to-r from-primary-600 to-primary-800 rounded-lg p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary-200 text-sm">Balance Total (aprox. USD)</p>
              <p className="text-3xl font-bold mt-2">
                {formatCurrency(getTotalBalance(), 'USD')}
              </p>
            </div>
            <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
              <CurrencyDollarIcon className="w-8 h-8" />
            </div>
          </div>
        </div>

        {/* Wallets Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Tus Billeteras</h2>
          </div>
          
          {wallets.length === 0 ? (
            <div className="card text-center py-12">
              <CurrencyDollarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No tienes billeteras configuradas</h3>
              <p className="text-gray-500 mb-6">
                Las billeteras se crean automáticamente cuando realizas tu primera transacción
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {wallets.map((wallet) => (
                <div key={wallet.currency} className="card hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                        <span className="text-primary-600 font-bold text-sm">
                          {wallet.currency}
                        </span>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-lg font-semibold text-gray-900">{wallet.currency}</h3>
                        <p className="text-sm text-gray-500">Billetera Digital</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Disponible:</span>
                      <span className="font-semibold text-gray-900">
                        {formatCurrency((typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance) - (typeof wallet.locked_balance === 'string' ? parseFloat(wallet.locked_balance) : wallet.locked_balance), wallet.currency)}
                      </span>
                    </div>
                    
                    {(typeof wallet.locked_balance === 'string' ? parseFloat(wallet.locked_balance) : wallet.locked_balance) > 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Bloqueado:</span>
                        <span className="font-semibold text-orange-600">
                          {formatCurrency(wallet.locked_balance, wallet.currency)}
                        </span>
                      </div>
                    )}
                    
                    <div className="border-t border-gray-200 pt-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700">Total:</span>
                        <span className="font-bold text-lg text-gray-900">
                          {formatCurrency(wallet.balance, wallet.currency)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2 mt-4">
                    <button 
                      onClick={() => handleDepositClick(wallet)}
                      className="btn-primary flex-1 text-sm py-2"
                      title={getPaymentMethodText(wallet.currency, 'deposit')}
                    >
                      <ArrowDownIcon className="w-4 h-4 mr-1" />
                      Depositar
                    </button>
                    <button 
                      onClick={() => handleWithdrawClick(wallet)}
                      className={`flex-1 text-sm py-2 ${
                        isPaymentAvailable(wallet.currency, 'withdrawal')
                          ? 'btn-secondary'
                          : 'btn-secondary opacity-50 cursor-not-allowed'
                      }`}
                      disabled={!isPaymentAvailable(wallet.currency, 'withdrawal') || (typeof wallet.balance === 'string' ? parseFloat(wallet.balance) : wallet.balance) - (typeof wallet.locked_balance === 'string' ? parseFloat(wallet.locked_balance) : wallet.locked_balance) <= 0}
                      title={getPaymentMethodText(wallet.currency, 'withdrawal')}
                    >
                      <ArrowUpIcon className="w-4 h-4 mr-1" />
                      Retirar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Transacciones Recientes</h2>
            <Link href="/wallet/transactions" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              Ver Todas
            </Link>
          </div>

          {isLoadingTransactions ? (
            <div className="flex items-center justify-center py-8">
              <div className="loading-spinner w-6 h-6 text-primary-600"></div>
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="text-center py-8">
              <ClockIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">No hay transacciones recientes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTransactions.slice(0, 5).map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">
                      {getTransactionTypeIcon(transaction.type)}
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-900">
                        {getTransactionTypeName(transaction.type)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(transaction.created_at).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${
                      transaction.type === 'DEPOSIT' || transaction.type === 'TRANSFER_IN'
                        ? 'text-success-600'
                        : transaction.type === 'WITHDRAWAL' || transaction.type === 'TRANSFER_OUT'
                        ? 'text-danger-600'
                        : 'text-gray-900'
                    }`}>
                      {transaction.type === 'DEPOSIT' || transaction.type === 'TRANSFER_IN' ? '+' : '-'}
                      {formatCurrency(Math.abs(typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : transaction.amount), transaction.currency)}
                    </p>
                    {getStatusBadge(transaction.status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div 
            className="card hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => {
              const preferredWallet = wallets.find(w => w.currency === 'BOB') || wallets.find(w => w.currency === 'USD') || wallets[0]
              if (preferredWallet) handleDepositClick(preferredWallet)
            }}
          >
            <div className="flex items-center p-2">
              <div className="w-12 h-12 bg-success-100 rounded-lg flex items-center justify-center">
                <ArrowDownIcon className="w-6 h-6 text-success-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Depositar</h3>
                <p className="text-sm text-gray-500">Transferencia bancaria o QR</p>
              </div>
            </div>
          </div>
          
          <div 
            className="card hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => {
              const availableWallet = wallets.find(w => (w.currency === 'BOB' || w.currency === 'USD') && ((typeof w.balance === 'string' ? parseFloat(w.balance) : w.balance) - (typeof w.locked_balance === 'string' ? parseFloat(w.locked_balance) : w.locked_balance)) > 0)
              if (availableWallet) {
                handleWithdrawClick(availableWallet)
              } else {
                toast.error('No tienes fondos disponibles para retirar')
              }
            }}
          >
            <div className="flex items-center p-2">
              <div className="w-12 h-12 bg-danger-100 rounded-lg flex items-center justify-center">
                <ArrowUpIcon className="w-6 h-6 text-danger-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Retirar</h3>
                <p className="text-sm text-gray-500">Transferencia bancaria</p>
              </div>
            </div>
          </div>
          
          <Link href="/trade" className="card hover:shadow-md transition-shadow">
            <div className="flex items-center p-2">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <CurrencyDollarIcon className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-lg font-medium text-gray-900">Trading</h3>
                <p className="text-sm text-gray-500">Usar fondos para trading P2P</p>
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Payment Modals */}
      {selectedWallet && (
        <>
          <BankTransferModal
            isOpen={isBankModalOpen}
            onClose={() => setIsBankModalOpen(false)}
            currency={selectedWallet.currency}
            type={modalType}
            onSuccess={handleModalSuccess}
            availableBalance={(typeof selectedWallet.balance === 'string' ? parseFloat(selectedWallet.balance) : selectedWallet.balance) - (typeof selectedWallet.locked_balance === 'string' ? parseFloat(selectedWallet.locked_balance) : selectedWallet.locked_balance)}
          />
          
          <QRModal
            isOpen={isQRModalOpen}
            onClose={() => setIsQRModalOpen(false)}
            currency={selectedWallet.currency}
            type="deposit"
            onSuccess={handleModalSuccess}
          />
        </>
      )}
    </DashboardLayout>
  )
}