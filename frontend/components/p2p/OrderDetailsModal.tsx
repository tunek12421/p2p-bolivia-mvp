import { useState, useEffect } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { Fragment } from 'react'
import { 
  XMarkIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentDuplicateIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline'
import { p2pAPI, OrderDetails } from '../../lib/api'
import toast from 'react-hot-toast'

interface OrderDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  orderId: string | null
  onOrderUpdate?: () => void
}

export default function OrderDetailsModal({ 
  isOpen, 
  onClose, 
  orderId, 
  onOrderUpdate 
}: OrderDetailsModalProps) {
  const [order, setOrder] = useState<OrderDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isMarkingAsPaid, setIsMarkingAsPaid] = useState(false)

  useEffect(() => {
    if (isOpen && orderId) {
      fetchOrderDetails()
    }
  }, [isOpen, orderId])

  const fetchOrderDetails = async () => {
    if (!orderId) return
    
    try {
      setIsLoading(true)
      const response = await p2pAPI.getOrderDetails(orderId)
      setOrder(response.data.order)
    } catch (error) {
      console.error('Error fetching order details:', error)
      toast.error('Error cargando detalles de la orden')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMarkAsPaid = async () => {
    if (!order) return
    
    try {
      setIsMarkingAsPaid(true)
      await p2pAPI.markOrderAsPaid(order.id)
      toast.success('¡Pago marcado como realizado!')
      
      // Refresh order details
      await fetchOrderDetails()
      
      // Notify parent to refresh
      if (onOrderUpdate) onOrderUpdate()
    } catch (error: any) {
      console.error('Error marking as paid:', error)
      const message = error.response?.data?.error || 'Error marcando el pago'
      toast.error(message)
    } finally {
      setIsMarkingAsPaid(false)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success(`${label} copiado al portapapeles`)
    }).catch(() => {
      toast.error('Error copiando al portapapeles')
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <ClockIcon className="w-4 h-4 mr-1" />
            Pendiente
          </span>
        )
      case 'MATCHED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <CheckCircleIcon className="w-4 h-4 mr-1" />
            Emparejada
          </span>
        )
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            <ClockIcon className="w-4 h-4 mr-1" />
            Procesando
          </span>
        )
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircleIcon className="w-4 h-4 mr-1" />
            Completada
          </span>
        )
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XMarkIcon className="w-4 h-4 mr-1" />
            Cancelada
          </span>
        )
      default:
        return <span className="badge">{status}</span>
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
    if (currency === 'BOB') {
      return `Bs. ${amount.toFixed(2)}`
    } else if (currency === 'USD') {
      return `$${amount.toFixed(2)}`
    } else if (currency === 'USDT') {
      return `${amount.toFixed(2)} USDT`
    }
    return `${amount} ${currency}`
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
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
              <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex justify-between items-start mb-4">
                  <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                    Detalles de la Orden
                  </Dialog.Title>
                  <button
                    type="button"
                    className="rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none"
                    onClick={onClose}
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="loading-spinner w-6 h-6 text-primary-600"></div>
                  </div>
                ) : order ? (
                  <div className="space-y-6">
                    {/* Order Status and Basic Info */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-sm text-gray-500">ID de Orden</p>
                          <p className="font-mono text-sm">{order.id}</p>
                        </div>
                        <div>
                          {getStatusBadge(order.status)}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Tipo</p>
                          <p className={`font-semibold ${
                            order.type === 'BUY' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {order.type === 'BUY' ? 'Compra' : 'Venta'}
                          </p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-gray-500">Par de Trading</p>
                          <p className="font-semibold">{order.currency_from}/{order.currency_to}</p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-gray-500">Cantidad</p>
                          <p className="font-semibold">{formatCurrency(order.amount, order.currency_from)}</p>
                        </div>
                        
                        <div>
                          <p className="text-sm text-gray-500">Tasa</p>
                          <p className="font-semibold">{formatCurrency(order.rate, order.currency_to)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Payment Instructions (only for MATCHED orders) */}
                    {order.status === 'MATCHED' && order.payment_instructions && (
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <h4 className="text-lg font-semibold text-blue-900 mb-3 flex items-center">
                          <BanknotesIcon className="w-5 h-5 mr-2" />
                          Instrucciones de Pago
                        </h4>
                        
                        <div className="space-y-3">
                          <div className="bg-white rounded p-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-gray-500">Cantidad a Transferir</p>
                                <p className="text-2xl font-bold text-blue-600">
                                  {formatCurrency(order.payment_instructions.amount_bob, 'BOB')}
                                </p>
                              </div>
                              <button
                                onClick={() => copyToClipboard(
                                  order.payment_instructions!.amount_bob.toString(), 
                                  'Cantidad'
                                )}
                                className="p-2 text-gray-400 hover:text-gray-600"
                              >
                                <DocumentDuplicateIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="bg-white rounded p-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-gray-500">Banco</p>
                                <p className="font-semibold">{order.payment_instructions.bank_name}</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-white rounded p-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-gray-500">Número de Cuenta</p>
                                <p className="font-mono">{order.payment_instructions.account_number}</p>
                              </div>
                              <button
                                onClick={() => copyToClipboard(
                                  order.payment_instructions!.account_number, 
                                  'Número de cuenta'
                                )}
                                className="p-2 text-gray-400 hover:text-gray-600"
                              >
                                <DocumentDuplicateIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="bg-white rounded p-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-gray-500">Titular</p>
                                <p className="font-semibold">{order.payment_instructions.account_holder}</p>
                              </div>
                            </div>
                          </div>
                          
                          <div className="bg-white rounded p-3">
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-sm text-gray-500">Referencia</p>
                                <p className="font-mono text-sm">{order.payment_instructions.reference}</p>
                              </div>
                              <button
                                onClick={() => copyToClipboard(
                                  order.payment_instructions!.reference, 
                                  'Referencia'
                                )}
                                className="p-2 text-gray-400 hover:text-gray-600"
                              >
                                <DocumentDuplicateIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          
                          <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                            <p className="text-sm text-yellow-800">
                              <ExclamationTriangleIcon className="w-4 h-4 inline mr-1" />
                              {order.payment_instructions.instructions}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Cashier Information (for MATCHED/PROCESSING orders) */}
                    {(order.status === 'MATCHED' || order.status === 'PROCESSING') && order.cashier && (
                      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                        <h4 className="text-lg font-semibold text-green-900 mb-2">
                          Información del Cajero
                        </h4>
                        <div className="space-y-2">
                          <div>
                            <p className="text-sm text-gray-500">Nombre</p>
                            <p className="font-semibold">{order.cashier.first_name}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Teléfono</p>
                            <p className="font-mono">{order.cashier.phone}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end space-x-3 pt-4 border-t">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={onClose}
                      >
                        Cerrar
                      </button>
                      
                      {order.status === 'MATCHED' && (
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleMarkAsPaid}
                          disabled={isMarkingAsPaid}
                        >
                          {isMarkingAsPaid ? (
                            <>
                              <div className="loading-spinner w-4 h-4 mr-2" />
                              Marcando...
                            </>
                          ) : (
                            <>
                              <CheckCircleIcon className="w-4 h-4 mr-2" />
                              Marcar como Pagado
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No se encontraron detalles de la orden</p>
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