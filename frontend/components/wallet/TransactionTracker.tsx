import { useState, useEffect } from 'react'
import { walletAPI, Transaction } from '../../lib/api'
import { CheckCircleIcon, ClockIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

interface TransactionTrackerProps {
  transactionId: string
  onStatusChange?: (status: string) => void
  autoRefresh?: boolean
  refreshInterval?: number
}

export default function TransactionTracker({ 
  transactionId, 
  onStatusChange, 
  autoRefresh = true,
  refreshInterval = 5000 
}: TransactionTrackerProps) {
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchTransaction()

    if (autoRefresh) {
      const interval = setInterval(() => {
        if (transaction?.status === 'PENDING' || transaction?.status === 'PROCESSING') {
          fetchTransaction()
        }
      }, refreshInterval)

      return () => clearInterval(interval)
    }
  }, [transactionId, autoRefresh, refreshInterval])

  const fetchTransaction = async () => {
    try {
      setError('')
      const response = await walletAPI.getTransaction(transactionId)
      const txData = response.data
      
      setTransaction(txData)
      
      if (onStatusChange && txData.status !== transaction?.status) {
        onStatusChange(txData.status)
      }
      
      // Show status notifications
      if (txData.status !== transaction?.status) {
        switch (txData.status) {
          case 'COMPLETED':
            toast.success('¡Transacción completada exitosamente!')
            break
          case 'FAILED':
            toast.error('La transacción falló')
            break
          case 'CANCELLED':
            toast.error('La transacción fue cancelada')
            break
        }
      }
    } catch (error: any) {
      console.error('❌ Transaction Fetch Error:', error)
      setError('Error al obtener información de la transacción')
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />
      case 'PENDING':
      case 'PROCESSING':
        return <ClockIcon className="w-5 h-5 text-yellow-500 animate-pulse" />
      case 'FAILED':
        return <XCircleIcon className="w-5 h-5 text-red-500" />
      case 'CANCELLED':
        return <XCircleIcon className="w-5 h-5 text-gray-500" />
      default:
        return <ExclamationTriangleIcon className="w-5 h-5 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'PENDING':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'PROCESSING':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'FAILED':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'CANCELLED':
        return 'text-gray-600 bg-gray-50 border-gray-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'Completada'
      case 'PENDING':
        return 'Pendiente'
      case 'PROCESSING':
        return 'Procesando'
      case 'FAILED':
        return 'Fallida'
      case 'CANCELLED':
        return 'Cancelada'
      default:
        return status
    }
  }

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'USD': return '$'
      case 'BOB': return 'Bs.'
      case 'USDT': return 'USDT'
      default: return '$'
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="flex items-center space-x-3 p-4 bg-gray-50 rounded-lg">
          <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error || !transaction) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-center">
          <XCircleIcon className="w-5 h-5 text-red-500 mr-2" />
          <span className="text-sm text-red-700">
            {error || 'No se pudo cargar la transacción'}
          </span>
        </div>
        <button
          onClick={fetchTransaction}
          className="mt-2 text-sm text-red-600 hover:text-red-700 underline"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return (
    <div className={`p-4 border rounded-lg ${getStatusColor(transaction.status)}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {getStatusIcon(transaction.status)}
          <span className="font-medium">
            {transaction.type === 'DEPOSIT' ? 'Depósito' : 'Retiro'}
          </span>
        </div>
        <span className="text-sm font-medium">
          {getStatusText(transaction.status)}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Monto:</span>
          <span className="font-medium">
            {getCurrencySymbol(transaction.currency)}{typeof transaction.amount === 'string' ? parseFloat(transaction.amount) : transaction.amount} {transaction.currency}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Método:</span>
          <span className="font-medium">
            {transaction.method === 'PAYPAL' ? 'PayPal' : transaction.method}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-gray-600">Creada:</span>
          <span className="font-medium">
            {new Date(transaction.created_at).toLocaleDateString('es-ES', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>

        {transaction.external_ref && (
          <div className="flex justify-between">
            <span className="text-gray-600">Referencia:</span>
            <span className="font-mono text-xs">
              {transaction.external_ref}
            </span>
          </div>
        )}

        <div className="flex justify-between">
          <span className="text-gray-600">ID:</span>
          <span className="font-mono text-xs">
            {transaction.id.split('-')[0]}...
          </span>
        </div>
      </div>

      {(transaction.status === 'PENDING' || transaction.status === 'PROCESSING') && (
        <div className="mt-3 pt-3 border-t">
          <div className="flex items-center text-sm text-gray-600">
            <ClockIcon className="w-4 h-4 mr-1 animate-pulse" />
            {transaction.method === 'PAYPAL' && transaction.type === 'DEPOSIT' && (
              <span>Esperando confirmación de PayPal...</span>
            )}
            {transaction.method === 'PAYPAL' && transaction.type === 'WITHDRAWAL' && (
              <span>Procesando pago a PayPal...</span>
            )}
          </div>
          
          <button
            onClick={fetchTransaction}
            className="mt-2 text-sm text-blue-600 hover:text-blue-700 underline"
          >
            Actualizar estado
          </button>
        </div>
      )}

      {transaction.status === 'COMPLETED' && (
        <div className="mt-3 pt-3 border-t">
          <div className="flex items-center text-sm text-green-600">
            <CheckCircleIcon className="w-4 h-4 mr-1" />
            <span>
              {transaction.type === 'DEPOSIT' 
                ? 'Fondos acreditados a tu billetera' 
                : 'Fondos enviados exitosamente'
              }
            </span>
          </div>
        </div>
      )}
    </div>
  )
}