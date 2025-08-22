import { useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { XMarkIcon, CurrencyDollarIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { walletAPI } from '../../lib/api'
import toast from 'react-hot-toast'

interface PayPalDepositModalProps {
  isOpen: boolean
  onClose: () => void
  currency: string
  onSuccess: () => void
}

interface DepositStep {
  id: string
  name: string
  status: 'current' | 'complete' | 'upcoming'
}

export default function PayPalDepositModal({ isOpen, onClose, currency, onSuccess }: PayPalDepositModalProps) {
  const [amount, setAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [depositResponse, setDepositResponse] = useState<any>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [error, setError] = useState('')

  const steps: DepositStep[] = [
    { id: 'amount', name: 'Ingresa el monto', status: 'current' },
    { id: 'paypal', name: 'Pagar con PayPal', status: 'upcoming' },
    { id: 'confirmation', name: 'Confirmar depósito', status: 'upcoming' },
  ]

  const updateSteps = (activeStep: number) => {
    return steps.map((step, index) => ({
      ...step,
      status: index < activeStep ? 'complete' : index === activeStep ? 'current' : 'upcoming'
    }))
  }

  const handleAmountSubmit = async () => {
    const amountNum = parseFloat(amount)
    
    if (!amountNum || amountNum <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    if (amountNum < 1) {
      toast.error('El monto mínimo es $1.00 USD')
      return
    }

    if (amountNum > 1000) {
      toast.error('El monto máximo es $1,000.00 USD')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const response = await walletAPI.deposit({
        currency,
        amount: amountNum,
        method: 'PAYPAL'
      })

      console.log('💰 Deposit Response:', response.data)
      
      if (response.data.approval_url) {
        setDepositResponse(response.data)
        setCurrentStep(1)
        toast.success('¡Orden PayPal creada! Procede al pago')
      } else {
        throw new Error('No se recibió URL de aprobación de PayPal')
      }
    } catch (error: any) {
      console.error('❌ Deposit Error:', error)
      const errorMessage = error.response?.data?.error || error.message || 'Error al crear el depósito'
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePayPalRedirect = () => {
    if (depositResponse?.approval_url) {
      // Abrir PayPal en nueva ventana/tab
      const paypalWindow = window.open(
        depositResponse.approval_url,
        'paypal-payment',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      )

      if (paypalWindow) {
        setCurrentStep(2)
        
        // Monitoring de la ventana de PayPal
        const checkWindow = setInterval(() => {
          if (paypalWindow.closed) {
            clearInterval(checkWindow)
            // Usuario cerró la ventana - verificar estado
            setTimeout(() => {
              checkTransactionStatus()
            }, 2000)
          }
        }, 1000)
        
        // Timeout después de 10 minutos
        setTimeout(() => {
          if (!paypalWindow.closed) {
            paypalWindow.close()
          }
          clearInterval(checkWindow)
        }, 600000)
      } else {
        // Fallback si popup está bloqueado
        window.location.href = depositResponse.approval_url
      }
    }
  }

  const checkTransactionStatus = async () => {
    if (!depositResponse?.transaction_id) return

    try {
      const response = await walletAPI.getTransaction(depositResponse.transaction_id)
      const transaction = response.data
      
      console.log('🔍 Transaction Status:', transaction)
      
      if (transaction.status === 'COMPLETED') {
        toast.success('¡Depósito completado exitosamente!')
        onSuccess()
        handleClose()
      } else if (transaction.status === 'FAILED' || transaction.status === 'CANCELLED') {
        toast.error('El pago fue cancelado o falló')
        setError('El pago no se completó. Puedes intentar nuevamente.')
      } else {
        // Aún pendiente
        toast.loading('Verificando el estado del pago...', { duration: 3000 })
      }
    } catch (error: any) {
      console.error('❌ Status Check Error:', error)
      toast.error('Error al verificar el estado del pago')
    }
  }

  const handleClose = () => {
    setAmount('')
    setDepositResponse(null)
    setCurrentStep(0)
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
                    Depositar con PayPal
                  </Dialog.Title>
                  <button
                    onClick={handleClose}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                {/* Progress Steps */}
                <div className="mb-8">
                  <div className="flex items-center justify-between">
                    {updateSteps(currentStep).map((step, index) => (
                      <div key={step.id} className="flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          step.status === 'complete'
                            ? 'bg-green-500 text-white'
                            : step.status === 'current'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-600'
                        }`}>
                          {step.status === 'complete' ? (
                            <CheckCircleIcon className="w-5 h-5" />
                          ) : (
                            index + 1
                          )}
                        </div>
                        <div className="mt-2 text-xs text-center text-gray-600 max-w-20">
                          {step.name}
                        </div>
                        {index < steps.length - 1 && (
                          <div className={`absolute w-16 h-0.5 mt-4 ml-12 ${
                            step.status === 'complete' ? 'bg-green-500' : 'bg-gray-200'
                          }`} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center">
                    <ExclamationTriangleIcon className="w-5 h-5 text-red-500 mr-2" />
                    <span className="text-sm text-red-700">{error}</span>
                  </div>
                )}

                {/* Step Content */}
                {currentStep === 0 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Monto a depositar ({currency})
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <span className="text-gray-500 sm:text-sm">
                            {getCurrencySymbol(currency)}
                          </span>
                        </div>
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="block w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0.00"
                          min="1"
                          max="1000"
                          step="0.01"
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Mínimo: {getCurrencySymbol(currency)}1.00 | Máximo: {getCurrencySymbol(currency)}1,000.00
                      </p>
                    </div>

                    <div className="bg-blue-50 p-3 rounded-lg">
                      <div className="flex items-center">
                        <CurrencyDollarIcon className="w-5 h-5 text-blue-500 mr-2" />
                        <span className="text-sm text-blue-700 font-medium">PayPal Sandbox</span>
                      </div>
                      <p className="text-xs text-blue-600 mt-1">
                        Estás usando el entorno de pruebas de PayPal. Usa las credenciales sandbox para probar.
                      </p>
                    </div>

                    <button
                      onClick={handleAmountSubmit}
                      disabled={isLoading || !amount}
                      className="w-full btn-primary py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <div className="flex items-center justify-center">
                          <div className="loading-spinner w-5 h-5 mr-2"></div>
                          Creando orden...
                        </div>
                      ) : (
                        'Continuar con PayPal'
                      )}
                    </button>
                  </div>
                )}

                {currentStep === 1 && depositResponse && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CurrencyDollarIcon className="w-8 h-8 text-blue-500" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        ¡Orden creada exitosamente!
                      </h3>
                      <p className="text-sm text-gray-600 mb-4">
                        Monto: {getCurrencySymbol(currency)}{amount} {currency}
                      </p>
                      <p className="text-sm text-gray-600 mb-6">
                        Haz clic en el botón de abajo para completar el pago en PayPal
                      </p>
                    </div>

                    <button
                      onClick={handlePayPalRedirect}
                      className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-medium py-3 px-4 rounded-lg transition-colors"
                    >
                      Pagar con PayPal
                    </button>

                    <p className="text-xs text-gray-500 text-center">
                      ID de transacción: {depositResponse.transaction_id}
                    </p>
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-4 text-center">
                    <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CheckCircleIcon className="w-8 h-8 text-yellow-500" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Esperando confirmación
                    </h3>
                    <p className="text-sm text-gray-600 mb-4">
                      Estamos esperando la confirmación de PayPal. 
                      Los fondos aparecerán en tu billetera una vez confirmado el pago.
                    </p>
                    
                    <button
                      onClick={checkTransactionStatus}
                      className="w-full btn-secondary py-2"
                    >
                      Verificar estado
                    </button>

                    <button
                      onClick={handleClose}
                      className="w-full btn-outline py-2"
                    >
                      Cerrar
                    </button>
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