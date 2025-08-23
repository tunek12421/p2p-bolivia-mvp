import { useState, useRef } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { XMarkIcon, QrCodeIcon, CheckCircleIcon, DocumentDuplicateIcon, PhotoIcon } from '@heroicons/react/24/outline'
import { walletAPI } from '../../lib/api'
import toast from 'react-hot-toast'
import TransactionTracker from './TransactionTracker'

interface QRModalProps {
  isOpen: boolean
  onClose: () => void
  currency: string
  type: 'deposit'
  onSuccess: () => void
}

interface QRData {
  type: string
  address?: string
  amount: string
  currency: string
  reference?: string
  tx_id: string
  expires_at: number
}

export default function QRModal({ 
  isOpen, 
  onClose, 
  currency, 
  type, 
  onSuccess
}: QRModalProps) {
  const [amount, setAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [step, setStep] = useState<'amount' | 'qr' | 'confirmation'>('amount')
  const [qrData, setQrData] = useState<QRData | null>(null)
  const [qrCodeBase64, setQrCodeBase64] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const qrCanvasRef = useRef<HTMLCanvasElement>(null)

  const getCurrencyName = (curr: string) => {
    switch (curr) {
      case 'USDT': return 'Tether USDT'
      case 'BOB': return 'QR Simple Boliviano'
      default: return curr
    }
  }

  const getNetworkName = (curr: string) => {
    switch (curr) {
      case 'USDT': return 'TRC20 (Tron)'
      case 'BOB': return 'QR Simple'
      default: return 'Red desconocida'
    }
  }

  const handleAmountSubmit = async () => {
    const amountNum = parseFloat(amount)
    
    if (!amountNum || amountNum <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }

    if (currency === 'USDT' && amountNum < 5) {
      toast.error('El monto mínimo es 5.00 USDT')
      return
    }

    if (currency === 'BOB' && amountNum < 10) {
      toast.error('El monto mínimo es Bs. 10.00')
      return
    }

    setIsLoading(true)

    try {
      const response = await walletAPI.deposit({
        currency,
        amount: amountNum,
        method: 'QR'
      })

      console.log('QR Deposit Response:', response.data)
      
      setQrData(response.data.qr_data)
      setQrCodeBase64(response.data.qr_code_base64)
      setTransactionId(response.data.transaction_id)
      setExpiresAt(new Date(response.data.expires_at))
      setStep('qr')

    } catch (error: any) {
      console.error('QR generation error:', error)
      toast.error(error.response?.data?.error || 'Error al generar código QR')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copiado al portapapeles`)
  }

  const downloadQR = () => {
    if (!qrCodeBase64) return
    
    const link = document.createElement('a')
    link.href = `data:image/png;base64,${qrCodeBase64}`
    link.download = `qr-${currency}-${transactionId.split('-')[0]}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Código QR descargado')
  }

  const handleClose = () => {
    setStep('amount')
    setAmount('')
    setQrData(null)
    setQrCodeBase64('')
    setTransactionId('')
    setExpiresAt(null)
    onClose()
  }

  const handleSuccess = () => {
    onSuccess()
    handleClose()
  }

  const formatTimeRemaining = () => {
    if (!expiresAt) return ''
    
    const now = new Date()
    const diff = expiresAt.getTime() - now.getTime()
    
    if (diff <= 0) return 'Expirado'
    
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    return `${hours}h ${minutes}m restantes`
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
                    <QrCodeIcon className="w-6 h-6 text-blue-600 mr-2" />
                    <Dialog.Title as="h3" className="text-lg font-medium text-gray-900">
                      Depósito {getCurrencyName(currency)}
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
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-800 mb-2">Red de pago:</h4>
                      <p className="text-sm text-blue-700">{getNetworkName(currency)}</p>
                      {currency === 'USDT' && (
                        <p className="text-xs text-blue-600 mt-1">
                          Solo envía USDT en red TRC20. Otros tokens o redes resultarán en pérdida permanente.
                        </p>
                      )}
                    </div>

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
                          step={currency === 'USDT' ? '0.01' : '1'}
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                          <span className="text-gray-500">{currency}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Mínimo: {currency === 'USDT' ? '5.00 USDT' : 'Bs. 10.00'}
                      </p>
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <p className="text-xs text-yellow-700">
                        <strong>Importante:</strong> El código QR expirará en 24 horas. 
                        Completa tu pago antes de la expiración.
                      </p>
                    </div>

                    <button
                      onClick={handleAmountSubmit}
                      disabled={isLoading || !amount}
                      className="w-full btn-primary py-2 disabled:opacity-50"
                    >
                      {isLoading ? 'Generando QR...' : 'Generar código QR'}
                    </button>
                  </div>
                )}

                {step === 'qr' && qrData && qrCodeBase64 && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="bg-white border-2 border-gray-200 rounded-lg p-4 inline-block">
                        <img 
                          src={`data:image/png;base64,${qrCodeBase64}`} 
                          alt="Código QR" 
                          className="w-48 h-48 mx-auto"
                        />
                      </div>
                      
                      <div className="mt-3 flex justify-center space-x-2">
                        <button
                          onClick={downloadQR}
                          className="flex items-center px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                          <PhotoIcon className="w-4 h-4 mr-1" />
                          Descargar
                        </button>
                      </div>
                    </div>

                    {qrData.address && (
                      <div className="space-y-3">
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <span className="text-sm font-medium text-gray-700">Dirección:</span>
                              <p className="font-mono text-xs text-gray-900 mt-1 break-all">{qrData.address}</p>
                            </div>
                            <button
                              onClick={() => copyToClipboard(qrData.address!, 'Dirección')}
                              className="ml-2 text-blue-600 hover:text-blue-700 flex-shrink-0"
                            >
                              <DocumentDuplicateIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="bg-gray-50 p-3 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700">Monto:</span>
                            <div className="flex items-center">
                              <span className="font-semibold">{qrData.amount} {currency}</span>
                              <button
                                onClick={() => copyToClipboard(qrData.amount, 'Monto')}
                                className="ml-2 text-blue-600 hover:text-blue-700"
                              >
                                <DocumentDuplicateIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="bg-gray-50 p-3 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700">Red:</span>
                            <span className="font-semibold">{getNetworkName(currency)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {qrData.reference && (
                      <div className="bg-blue-50 p-3 rounded-lg border-2 border-blue-200">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-medium text-blue-700">Referencia:</span>
                          <div className="flex items-center">
                            <span className="font-mono font-bold text-blue-800">{qrData.reference}</span>
                            <button
                              onClick={() => copyToClipboard(qrData.reference!, 'Referencia')}
                              className="ml-2 text-blue-600 hover:text-blue-700"
                            >
                              <DocumentDuplicateIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-yellow-700">Expira en:</span>
                        <span className="font-semibold text-yellow-800">{formatTimeRemaining()}</span>
                      </div>
                    </div>

                    <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-xs text-red-700">
                        <strong>Advertencia:</strong> Solo envía {currency} exactamente por el monto mostrado. 
                        Envíos incorrectos pueden resultar en pérdida de fondos.
                      </p>
                    </div>

                    {transactionId && (
                      <div className="border-t pt-4">
                        <h4 className="font-medium text-gray-900 mb-3">Estado de la transacción:</h4>
                        <TransactionTracker 
                          transactionId={transactionId} 
                          onStatusChange={(status) => {
                            if (status === 'COMPLETED') {
                              setStep('confirmation')
                            }
                          }}
                        />
                      </div>
                    )}

                    <div className="flex space-x-3">
                      <button
                        onClick={() => setStep('amount')}
                        className="flex-1 btn-secondary py-2"
                      >
                        Volver
                      </button>
                      <button
                        onClick={handleClose}
                        className="flex-1 btn-primary py-2"
                      >
                        Entendido
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
                        ¡Depósito Confirmado!
                      </h3>
                      <p className="text-sm text-gray-600">
                        Tu pago ha sido confirmado y los fondos han sido acreditados a tu billetera.
                      </p>
                    </div>

                    <div className="bg-green-50 p-3 rounded-lg">
                      <p className="text-sm text-green-700">
                        <strong>+{amount} {currency}</strong> agregados a tu balance
                      </p>
                    </div>

                    <button
                      onClick={handleSuccess}
                      className="w-full btn-primary py-2"
                    >
                      Continuar
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