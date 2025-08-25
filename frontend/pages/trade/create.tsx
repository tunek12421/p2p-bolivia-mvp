import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useRequireAuth } from '../../lib/auth'
import { p2pAPI, walletAPI, WalletBalance } from '../../lib/api'
import DashboardLayout from '../../components/DashboardLayout'
import { 
  ArrowLeftIcon,
  CurrencyDollarIcon,
  InformationCircleIcon,
  CheckIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import Link from 'next/link'

export default function CreateOrderPage() {
  const { user } = useRequireAuth()
  const router = useRouter()
  const [wallets, setWallets] = useState<WalletBalance[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingWallets, setIsLoadingWallets] = useState(true)
  
  const [formData, setFormData] = useState({
    type: 'SELL' as 'BUY' | 'SELL',
    currency_from: 'USD',
    currency_to: 'BOB',
    amount: '',
    rate: '',
    min_amount: '',
    max_amount: '',
    payment_methods: ['qr'] as string[]
  })

  const availablePaymentMethods = [
    { value: 'qr', label: 'QR' }
  ]

  const currencies = ['BOB', 'USD', 'USDT']

  useEffect(() => {
    if (user) {
      fetchWallets()
    }
  }, [user])

  const fetchWallets = async () => {
    try {
      setIsLoadingWallets(true)
      const response = await walletAPI.getWallets()
      setWallets(response.data.wallets || [])
    } catch (error) {
      console.error('Error fetching wallets:', error)
      toast.error('Error cargando billeteras')
    } finally {
      setIsLoadingWallets(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handlePaymentMethodToggle = (method: string) => {
    setFormData(prev => ({
      ...prev,
      payment_methods: prev.payment_methods.includes(method)
        ? prev.payment_methods.filter(m => m !== method)
        : [...prev.payment_methods, method]
    }))
  }

  const validateForm = (): boolean => {
    if (!formData.currency_from || !formData.currency_to) {
      toast.error('Por favor selecciona las monedas')
      return false
    }

    if (formData.currency_from === formData.currency_to) {
      toast.error('Las monedas de origen y destino deben ser diferentes')
      return false
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Por favor ingresa un monto válido')
      return false
    }

    if (!formData.rate || parseFloat(formData.rate) <= 0) {
      toast.error('Por favor ingresa una tasa válida')
      return false
    }

    if (formData.min_amount && parseFloat(formData.min_amount) <= 0) {
      toast.error('El monto mínimo debe ser mayor a 0')
      return false
    }

    if (formData.max_amount && parseFloat(formData.max_amount) < parseFloat(formData.min_amount || '0')) {
      toast.error('El monto máximo debe ser mayor al mínimo')
      return false
    }

    if (parseFloat(formData.amount) < parseFloat(formData.min_amount || '0')) {
      toast.error('El monto debe ser mayor o igual al monto mínimo')
      return false
    }

    if (formData.payment_methods.length === 0) {
      toast.error('Selecciona al menos un método de pago')
      return false
    }

    // Check wallet balance for SELL orders
    if (formData.type === 'SELL') {
      const wallet = wallets.find(w => w.currency === formData.currency_from)
      const availableBalance = wallet ? wallet.balance - wallet.locked_balance : 0
      
      if (availableBalance < parseFloat(formData.amount)) {
        toast.error(`Saldo insuficiente. Disponible: ${availableBalance} ${formData.currency_from}`)
        return false
      }
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('🚀 FRONTEND: Iniciando creación de orden')
    console.log('📋 FRONTEND: FormData original:', formData)
    
    if (!validateForm()) {
      console.log('❌ FRONTEND: Validación falló')
      return
    }
    console.log('✅ FRONTEND: Validación exitosa')

    setIsLoading(true)
    
    try {
      const orderData = {
        type: formData.type,
        currency_from: formData.currency_from,
        currency_to: formData.currency_to,
        amount: parseFloat(formData.amount),
        rate: parseFloat(formData.rate),
        min_amount: formData.min_amount ? parseFloat(formData.min_amount) : 0,
        max_amount: formData.max_amount ? parseFloat(formData.max_amount) : parseFloat(formData.amount),
        payment_methods: formData.payment_methods
      }
      
      console.log('📦 FRONTEND: Datos a enviar al API:', orderData)
      console.log('🔢 FRONTEND: Tipos de datos:')
      console.log('  - type:', typeof orderData.type, orderData.type)
      console.log('  - currency_from:', typeof orderData.currency_from, orderData.currency_from)
      console.log('  - currency_to:', typeof orderData.currency_to, orderData.currency_to)
      console.log('  - amount:', typeof orderData.amount, orderData.amount)
      console.log('  - rate:', typeof orderData.rate, orderData.rate)
      console.log('  - min_amount:', typeof orderData.min_amount, orderData.min_amount)
      console.log('  - max_amount:', typeof orderData.max_amount, orderData.max_amount)
      console.log('  - payment_methods:', typeof orderData.payment_methods, orderData.payment_methods)

      console.log('📡 FRONTEND: Llamando a p2pAPI.createOrder...')
      const response = await p2pAPI.createOrder(orderData)
      console.log('✅ FRONTEND: Respuesta exitosa:', response)
      
      toast.success('Orden creada exitosamente')
      console.log('🧭 FRONTEND: Redirigiendo a /trade/orders')
      router.push('/trade/orders')
    } catch (error: any) {
      console.error('❌ FRONTEND: Error creating order:', error)
      console.log('🔍 FRONTEND: Detalles del error:')
      console.log('  - Status:', error.response?.status)
      console.log('  - StatusText:', error.response?.statusText)
      console.log('  - Data:', error.response?.data)
      console.log('  - Headers:', error.response?.headers)
      console.log('  - Config:', error.config)
      
      const message = error.response?.data?.error || 'Error creando la orden'
      toast.error(message)
    } finally {
      setIsLoading(false)
      console.log('🏁 FRONTEND: Proceso terminado, loading = false')
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
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
    }).format(amount)
    
    if (currency === 'BOB') {
      formatted = formatted.replace('$', 'Bs. ')
    } else if (currency === 'USDT') {
      formatted = formatted.replace('$', 'USDT ')
    }
    
    return formatted
  }

  const calculateTotal = () => {
    if (formData.amount && formData.rate) {
      const total = parseFloat(formData.amount) * parseFloat(formData.rate)
      return total
    }
    return 0
  }

  const getWalletBalance = (currency: string) => {
    const wallet = wallets.find(w => w.currency === currency)
    return wallet ? wallet.balance - wallet.locked_balance : 0
  }

  if (isLoadingWallets) {
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
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center">
          <Link 
            href="/trade" 
            className="mr-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Crear Nueva Orden</h1>
            <p className="text-gray-600">Publica una orden de compra o venta</p>
          </div>
        </div>

        {/* Order Form */}
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Order Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Tipo de Orden
              </label>
              <div className="flex space-x-1 bg-gray-100 rounded-lg p-1">
                {[
                  { value: 'BUY', label: 'Comprar', color: 'text-success-600' },
                  { value: 'SELL', label: 'Vender', color: 'text-danger-600' }
                ].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, type: option.value as 'BUY' | 'SELL' })}
                    className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-colors ${
                      formData.type === option.value
                        ? `bg-white ${option.color} shadow-sm`
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Currency Pair */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="currency_from" className="block text-sm font-medium text-gray-700 mb-2">
                  Moneda de Origen
                </label>
                <select
                  id="currency_from"
                  name="currency_from"
                  className="input"
                  value={formData.currency_from}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Seleccionar</option>
                  {currencies.map(currency => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
                {formData.currency_from && formData.type === 'SELL' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Disponible: {formatCurrency(getWalletBalance(formData.currency_from), formData.currency_from)}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="currency_to" className="block text-sm font-medium text-gray-700 mb-2">
                  Moneda de Destino
                </label>
                <select
                  id="currency_to"
                  name="currency_to"
                  className="input"
                  value={formData.currency_to}
                  onChange={handleInputChange}
                  required
                >
                  <option value="">Seleccionar</option>
                  {currencies.filter(c => c !== formData.currency_from).map(currency => (
                    <option key={currency} value={currency}>{currency}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Amount and Rate */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-2">
                  Cantidad ({formData.currency_from || 'Moneda'})
                </label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div>
                <label htmlFor="rate" className="block text-sm font-medium text-gray-700 mb-2">
                  Tasa ({formData.currency_to || 'Moneda'})
                </label>
                <input
                  id="rate"
                  name="rate"
                  type="number"
                  step="0.0001"
                  min="0"
                  className="input"
                  placeholder="0.0000"
                  value={formData.rate}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            {/* Total Calculation */}
            {formData.amount && formData.rate && formData.currency_to && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Total a {formData.type === 'BUY' ? 'pagar' : 'recibir'}:</span>
                  <span className="text-lg font-bold text-gray-900">
                    {formatCurrency(calculateTotal(), formData.currency_to)}
                  </span>
                </div>
              </div>
            )}

            {/* Min/Max Amounts */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Límites de Transacción (Opcional)
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <input
                    name="min_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    placeholder={`Mínimo ${formData.currency_from || ''}`}
                    value={formData.min_amount}
                    onChange={handleInputChange}
                  />
                </div>
                <div>
                  <input
                    name="max_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    placeholder={`Máximo ${formData.currency_from || ''}`}
                    value={formData.max_amount}
                    onChange={handleInputChange}
                  />
                </div>
              </div>
            </div>

            {/* Payment Methods */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Métodos de Pago Aceptados
              </label>
              <div className="grid grid-cols-2 gap-3">
                {availablePaymentMethods.map(method => (
                  <label
                    key={method.value}
                    className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                      formData.payment_methods.includes(method.value)
                        ? 'border-primary-300 bg-primary-50'
                        : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center h-5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        checked={formData.payment_methods.includes(method.value)}
                        onChange={() => handlePaymentMethodToggle(method.value)}
                      />
                    </div>
                    <div className="ml-3">
                      <span className="text-sm font-medium text-gray-900">
                        {method.label}
                      </span>
                    </div>
                    {formData.payment_methods.includes(method.value) && (
                      <CheckIcon className="w-4 h-4 text-primary-600 ml-auto" />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Info Notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <InformationCircleIcon className="w-5 h-5 text-blue-400 mt-0.5" />
                <div className="ml-3 text-sm text-blue-800">
                  <p className="font-medium">Información importante:</p>
                  <ul className="mt-2 list-disc list-inside space-y-1">
                    <li>Las órdenes de venta requieren saldo suficiente en tu billetera</li>
                    <li>Se aplicará una pequeña comisión por transacción</li>
                    <li>Puedes cancelar tu orden en cualquier momento antes del match</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex space-x-4">
              <Link 
                href="/trade"
                className="btn-secondary flex-1 flex justify-center py-3"
              >
                Cancelar
              </Link>
              <button
                type="submit"
                className="btn-primary flex-1 flex justify-center py-3"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="loading-spinner w-4 h-4 mr-2"></div>
                    Creando Orden...
                  </div>
                ) : (
                  <>
                    <CurrencyDollarIcon className="w-5 h-5 mr-2" />
                    Crear Orden
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  )
}