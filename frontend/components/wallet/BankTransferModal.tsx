import { useState } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { XMarkIcon, BanknotesIcon, ClockIcon, CheckCircleIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline'
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
        // Get deposit instructions
        const response = await walletAPI.getDepositInstructions(currency, amountNum)
        setBankDetails(response.data)
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

  const handleClose = () => {
    setStep('amount')
    setAmount('')
    setBankDetails(null)
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

                {step === 'instructions' && bankDetails && (
                  <div className="space-y-4">
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-center mb-2">
                        <ClockIcon className="w-5 h-5 text-yellow-600 mr-2" />
                        <h4 className="font-medium text-yellow-800">Instrucciones de Depósito</h4>
                      </div>
                      <p className="text-sm text-yellow-700">
                        Realiza una transferencia bancaria con los siguientes datos:
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">Beneficiario:</span>
                          <div className="flex items-center">
                            <span className="font-semibold">{bankDetails.account_holder}</span>
                            <button
                              onClick={() => copyToClipboard(bankDetails.account_holder, 'Beneficiario')}
                              className="ml-2 text-blue-600 hover:text-blue-700"
                            >
                              <DocumentDuplicateIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">Banco:</span>
                          <div className="flex items-center">
                            <span className="font-semibold">{bankDetails.bank}</span>
                            <button
                              onClick={() => copyToClipboard(bankDetails.bank, 'Banco')}
                              className="ml-2 text-blue-600 hover:text-blue-700"
                            >
                              <DocumentDuplicateIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">Cuenta:</span>
                          <div className="flex items-center">
                            <span className="font-mono font-semibold">{bankDetails.account_number}</span>
                            <button
                              onClick={() => copyToClipboard(bankDetails.account_number, 'Número de cuenta')}
                              className="ml-2 text-blue-600 hover:text-blue-700"
                            >
                              <DocumentDuplicateIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="bg-blue-50 p-3 rounded-lg border-2 border-blue-200">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-blue-700">Referencia:</span>
                          <div className="flex items-center">
                            <span className="font-mono font-bold text-blue-800">{bankDetails.reference}</span>
                            <button
                              onClick={() => copyToClipboard(bankDetails.reference, 'Referencia')}
                              className="ml-2 text-blue-600 hover:text-blue-700"
                            >
                              <DocumentDuplicateIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="bg-green-50 p-3 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-green-700">Monto:</span>
                          <span className="font-bold text-green-800">
                            {getCurrencySymbol(currency)}{parseFloat(amount).toFixed(2)} {currency}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <p className="text-xs text-amber-700">
                        <strong>Importante:</strong> Incluye la referencia exacta en el concepto/descripción de tu transferencia. 
                        Sin ella no podremos procesar tu depósito automáticamente.
                      </p>
                    </div>

                    <div className="flex space-x-3">
                      <button
                        onClick={() => setStep('amount')}
                        className="flex-1 btn-secondary py-2"
                      >
                        Volver
                      </button>
                      <button
                        onClick={handleDepositConfirmation}
                        disabled={isLoading}
                        className="flex-1 btn-primary py-2"
                      >
                        {isLoading ? 'Procesando...' : 'He realizado la transferencia'}
                      </button>
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