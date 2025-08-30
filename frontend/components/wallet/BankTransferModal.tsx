import { useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { XMarkIcon, BanknotesIcon, ClockIcon, CheckCircleIcon, DocumentDuplicateIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { walletAPI } from '../../lib/api'
import toast from 'react-hot-toast'

interface BankTransferModalProps {
  isOpen: boolean
  onClose: () => void
  currency: string
  type: 'deposit' | 'withdrawal'
  onSuccess: () => void
  availableBalance?: number
}

interface BankDetails {
  account_holder: string
  bank: string
  account_number: string
  reference: string
}

interface QRDetails {
  currency: string
  qr_image_url: string
  description: string
  method: string
  amount_fixed?: number
}

export default function BankTransferModal({ 
  isOpen, 
  onClose, 
  currency, 
  type, 
  onSuccess,
  availableBalance = 0
}: BankTransferModalProps) {
  const [amount, setAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<'amount' | 'instructions' | 'confirmation'>('amount')
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null)
  const [qrDetails, setQRDetails] = useState<QRDetails | null>(null)
  const [transactionId, setTransactionId] = useState('')
  const [withdrawalDestination, setWithdrawalDestination] = useState({
    account_holder: '',
    bank: '',
    account_number: ''
  })

  const getCurrencySymbol = (curr: string) => {
    switch (curr) {
      case 'BOB': return 'Bs.'
      case 'USD': return '$'
      default: return curr
    }
  }

  const handleAmountSubmit = async () => {
    const amountNum = parseFloat(amount)
    
    if (!amountNum || amountNum <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    if (currency === 'BOB' && amountNum < 10) {
      toast.error('El monto mínimo es Bs. 10.00')
      return
    }

    if (currency === 'USD' && amountNum < 5) {
      toast.error('El monto mínimo es $5.00')
      return
    }

    if (type === 'withdrawal' && amountNum > availableBalance) {
      toast.error('Monto excede el balance disponible')
      return
    }

    if (type === 'withdrawal') {
      if (!withdrawalDestination.account_holder || !withdrawalDestination.bank || !withdrawalDestination.account_number) {
        toast.error('Completa todos los campos de destino')
        return
      }
    }

    setIsLoading(true)

    try {
      if (type === 'deposit') {
        // Get QR deposit instructions
        const response = await walletAPI.getDepositQR(currency)
        setQRDetails(response.data.data)
        setStep('instructions')
      } else {
        // Create withdrawal
        const response = await walletAPI.withdraw({
          currency,
          amount: amountNum,
          method: 'BANK',
          destination: withdrawalDestination
        })
        setTransactionId(response.data.transaction_id)
        setStep('confirmation')
      }
    } catch (error: any) {
      console.error('Bank transfer error:', error)
      toast.error(error.response?.data?.error || 'Error al procesar la solicitud')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDepositConfirmation = async () => {
    setIsLoading(true)
    try {
      const response = await walletAPI.deposit({
        currency,
        amount: parseFloat(amount),
        method: 'BANK'
      })
      setTransactionId(response.data.transaction_id)
      setStep('confirmation')
      toast.success('Depósito iniciado. Realiza la transferencia para completarlo.')
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al crear el depósito')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copiado al portapapeles`)
  }

  const downloadQRCode = async () => {
    if (!qrDetails?.qr_image_url) return
    
    try {
      const response = await fetch(qrDetails.qr_image_url)
      const blob = await response.blob()
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qr-deposito-${currency.toLowerCase()}.jpg`
      document.body.appendChild(a)
      a.click()
      
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('QR descargado exitosamente')
    } catch (error) {
      toast.error('Error al descargar el QR')
    }
  }

  const handleClose = () => {
    setStep('amount')
    setAmount('')
    setBankDetails(null)
    setQRDetails(null)
    setTransactionId('')
    setWithdrawalDestination({ account_holder: '', bank: '', account_number: '' })
    onClose()
  }

  const handleSuccess = () => {
    onSuccess()
    handleClose()
  }

  return (
    <Transition show={isOpen} as={Fragment}>
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
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <BanknotesIcon className="w-6 h-6 text-blue-600 mr-2" />
                    <Dialog.Title as="h3" className="text-lg font-medium text-gray-900">
                      {type === 'deposit' ? 'Depósito' : 'Retiro'} Bancario
                    </Dialog.Title>
                  </div>
                  <button
                    onClick={handleClose}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {step === 'amount' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Monto ({currency})
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder={`0.00 ${currency}`}
                          min="0"
                          step="0.01"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                          <span className="text-gray-500">{getCurrencySymbol(currency)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Mínimo: {getCurrencySymbol(currency)}{currency === 'BOB' ? '10.00' : '5.00'}
                        {type === 'withdrawal' && ` | Disponible: ${getCurrencySymbol(currency)}${availableBalance.toFixed(2)}`}
                      </p>
                    </div>

                    {type === 'withdrawal' && (
                      <div className="space-y-3">
                        <h4 className="font-medium text-gray-900">Datos de destino:</h4>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Titular de la cuenta
                          </label>
                          <input
                            type="text"
                            value={withdrawalDestination.account_holder}
                            onChange={(e) => setWithdrawalDestination({
                              ...withdrawalDestination,
                              account_holder: e.target.value
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Juan Pérez"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Banco
                          </label>
                          <select
                            value={withdrawalDestination.bank}
                            onChange={(e) => setWithdrawalDestination({
                              ...withdrawalDestination,
                              bank: e.target.value
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">Selecciona un banco</option>
                            <option value="Banco Nacional de Bolivia">Banco Nacional de Bolivia</option>
                            <option value="Banco de Crédito BCP">Banco de Crédito BCP</option>
                            <option value="Banco Mercantil Santa Cruz">Banco Mercantil Santa Cruz</option>
                            <option value="Banco Unión">Banco Unión</option>
                            <option value="Banco Económico">Banco Económico</option>
                            <option value="Banco Sol">Banco Sol</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Número de cuenta
                          </label>
                          <input
                            type="text"
                            value={withdrawalDestination.account_number}
                            onChange={(e) => setWithdrawalDestination({
                              ...withdrawalDestination,
                              account_number: e.target.value
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="1234567890"
                          />
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleAmountSubmit}
                      disabled={isLoading || !amount}
                      className="w-full btn-primary py-2 disabled:opacity-50"
                    >
                      {isLoading ? 'Procesando...' : 'Continuar'}
                    </button>
                  </div>
                )}

                {step === 'instructions' && qrDetails && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        <ClockIcon className="w-5 h-5 text-blue-600 mr-2" />
                        <h4 className="font-medium text-blue-800">Instrucciones de Depósito</h4>
                      </div>
                      <p className="text-sm text-blue-700">
                        {qrDetails.description || 'Escanea el código QR con tu billetera móvil'}
                      </p>
                    </div>

                    {/* QR Code Display */}
                    <div className="flex flex-col items-center p-6">
                      <div className="bg-white p-4 rounded-lg border-2 border-gray-200 shadow-sm mb-4">
                        <img 
                          src={qrDetails.qr_image_url} 
                          alt={`${currency} Deposit QR Code`}
                          className="w-48 h-48 object-contain"
                          onError={(e) => {
                            // Fallback if image fails to load
                            (e.target as HTMLImageElement).src = `data:image/svg+xml;base64,${btoa(`
                              <svg width="192" height="192" xmlns="http://www.w3.org/2000/svg">
                                <rect width="192" height="192" fill="#f3f4f6"/>
                                <text x="96" y="96" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="12" fill="#6b7280">
                                  QR Code
                                </text>
                              </svg>
                            `)}`
                          }}
                        />
                      </div>
                      
                      {/* Download Button */}
                      <button
                        onClick={downloadQRCode}
                        className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                        Descargar QR
                      </button>
                    </div>

                    <div className="bg-green-50 p-3 rounded-lg">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-green-700">Monto a depositar:</span>
                        <span className="font-bold text-green-800">
                          {getCurrencySymbol(currency)}{parseFloat(amount).toFixed(2)} {currency}
                        </span>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs text-blue-700">
                        <strong>Instrucciones:</strong> Escanea el código QR con tu billetera móvil e introduce el monto exacto. 
                        Una vez completado el pago, tu saldo se actualizará automáticamente.
                      </p>
                    </div>

                    <div className="flex justify-center">
                      <button
                        onClick={() => setStep('amount')}
                        className="btn-secondary px-8 py-2"
                      >
                        Volver
                      </button>
                    </div>
                    
                    <div className="bg-gray-50 p-3 rounded-lg text-center">
                      <p className="text-sm text-gray-600">
                        Tu depósito se procesará automáticamente una vez confirmado el pago por QR
                      </p>
                    </div>
                  </div>
                )}

                {step === 'confirmation' && (
                  <div className="text-center space-y-4">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                      <CheckCircleIcon className="w-10 h-10 text-green-600" />
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        {type === 'deposit' ? '¡Depósito Registrado!' : '¡Retiro Procesado!'}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {type === 'deposit' 
                          ? 'Tu depósito será procesado una vez que confirmemos la transferencia bancaria.'
                          : 'Tu retiro será procesado en las próximas horas hábiles.'
                        }
                      </p>
                    </div>

                    {transactionId && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-xs text-gray-600">ID de transacción:</p>
                        <p className="font-mono text-sm">{transactionId.split('-')[0]}...</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">
                        <strong>Tiempo estimado:</strong> {type === 'deposit' ? '5-30 minutos' : '1-2 días hábiles'}
                      </p>
                      <p className="text-xs text-gray-500">
                        Puedes verificar el estado en tu historial de transacciones
                      </p>
                    </div>

                    <button
                      onClick={handleSuccess}
                      className="w-full btn-primary py-2"
                    >
                      Entendido
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