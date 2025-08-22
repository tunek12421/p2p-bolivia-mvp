import { useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { XMarkIcon, ArrowUpIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { walletAPI, WalletBalance } from '../../lib/api'
import toast from 'react-hot-toast'

interface PayPalWithdrawModalProps {
  isOpen: boolean
  onClose: () => void
  wallet: WalletBalance
  onSuccess: () => void
}

export default function PayPalWithdrawModal({ isOpen, onClose, wallet, onSuccess }: PayPalWithdrawModalProps) {
  const [amount, setAmount] = useState('')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [withdrawResponse, setWithdrawResponse] = useState<any>(null)
  const [error, setError] = useState('')

  const availableBalance = wallet.balance - wallet.locked_balance

  const handleWithdrawSubmit = async () => {
    const amountNum = parseFloat(amount)
    
    if (!amountNum || amountNum <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    if (amountNum > availableBalance) {
      toast.error('Monto excede el balance disponible')
      return
    }

    if (amountNum < 1) {
      toast.error('El monto mínimo de retiro es $1.00')
      return
    }

    if (!email || !email.includes('@')) {
      toast.error('Ingresa un email válido de PayPal')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await walletAPI.withdraw({
        currency: wallet.currency,
        amount: amountNum,
        method: 'PAYPAL',
        destination: { email }
      })

      console.log('💸 Withdraw Response:', response.data)
      
      setWithdrawResponse(response.data)
      toast.success('¡Retiro procesado! Los fondos se enviarán a tu cuenta PayPal')
      
      // Auto-close después de mostrar éxito
      setTimeout(() => {
        onSuccess()
        handleClose()
      }, 3000)
      
    } catch (error: any) {
      console.error('❌ Withdraw Error:', error)
      const errorMessage = error.response?.data?.error || error.message || 'Error al procesar el retiro'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setAmount('')
    setEmail('')
    setWithdrawResponse(null)
    setError('')
    setIsLoading(false)
    onClose()
  }

  const getCurrencySymbol = (currency: string) => {
    switch (currency) {
      case 'USD': return '$'
      case 'BOB': return 'Bs.'
      case 'USDT': return 'USDT'
      default: return '$'
    }
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                    Retirar a PayPal
                  </Dialog.Title>
                  <button
                    onClick={handleClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                {/* Balance Info */}
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Balance disponible:</span>
                    <span className="font-semibold text-gray-900">
                      {getCurrencySymbol(wallet.currency)}{availableBalance.toFixed(2)} {wallet.currency}
                    </span>
                  </div>
                  {wallet.locked_balance > 0 && (
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm text-gray-600">Balance bloqueado:</span>
                      <span className="font-semibold text-orange-600">
                        {getCurrencySymbol(wallet.currency)}{wallet.locked_balance.toFixed(2)} {wallet.currency}
                      </span>
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center">
                    <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mr-2" />
                    <span className="text-sm text-red-700">{error}</span>
                  </div>
                )}

                {!withdrawResponse ? (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Monto a retirar ({wallet.currency})
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 sm:text-sm">
                            {getCurrencySymbol(wallet.currency)}
                          </span>
                        </div>
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="block w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0.00"
                          min="1"
                          max={availableBalance}
                          step="0.01"
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Mínimo: {getCurrencySymbol(wallet.currency)}1.00 | Disponible: {getCurrencySymbol(wallet.currency)}{availableBalance.toFixed(2)}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email de PayPal de destino
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        placeholder="tu-email@example.com"
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Debe ser una cuenta PayPal válida
                      </p>
                    </div>

                    <div className="bg-yellow-50 p-3 rounded-lg">
                      <div className="flex items-center">
                        <ArrowUpIcon className="w-5 h-5 text-yellow-500 mr-2" />
                        <span className="text-sm text-yellow-700 font-medium">PayPal Payout</span>
                      </div>
                      <p className="text-xs text-yellow-600 mt-1">
                        El retiro se procesará como un pago directo a tu cuenta PayPal. Puede tardar hasta 24 horas en aparecer.
                      </p>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg">
                      <h4 className="text-sm font-medium text-blue-900 mb-2">Comisiones y Límites</h4>
                      <ul className="text-xs text-blue-700 space-y-1">
                        <li>• Comisión PayPal: $0.30 + 2.9%</li>
                        <li>• Mínimo: $1.00 USD</li>
                        <li>• Máximo: $10,000.00 USD por transacción</li>
                        <li>• Tiempo de procesamiento: 1-24 horas</li>
                      </ul>
                    </div>

                    <button
                      onClick={handleWithdrawSubmit}
                      disabled={isLoading || !amount || !email || parseFloat(amount || '0') > availableBalance}
                      className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <div className="flex items-center justify-center">
                          <div className="loading-spinner w-5 h-5 mr-2"></div>
                          Procesando retiro...
                        </div>
                      ) : (
                        `Retirar ${getCurrencySymbol(wallet.currency)}${amount || '0.00'} a PayPal`
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircleIcon className="w-8 h-8 text-green-500" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      ¡Retiro procesado exitosamente!
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Se ha enviado {getCurrencySymbol(wallet.currency)}{amount} a la cuenta PayPal: {email}
                    </p>
                    <p className="text-xs text-gray-500">
                      ID de transacción: {withdrawResponse.transaction_id}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      Los fondos aparecerán en tu cuenta PayPal en un plazo de 1-24 horas.
                    </p>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}