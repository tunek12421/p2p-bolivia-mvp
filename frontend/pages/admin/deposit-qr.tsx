import { useState, useEffect } from 'react'
import { useRequireAuth } from '../../lib/auth'
import DashboardLayout from '../../components/DashboardLayout'
import { 
  QrCodeIcon, 
  CloudArrowUpIcon, 
  TrashIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import Link from 'next/link'

interface QRCode {
  id: string
  currency: string
  qr_image_url: string
  description: string
  is_active: boolean
  created_at: string
}

const CURRENCIES = [
  { code: 'BOB', name: 'Bolivianos', symbol: 'Bs.' },
  { code: 'USD', name: 'Dólares', symbol: '$' },
  { code: 'USDT', name: 'Tether', symbol: 'USDT' }
]

export default function DepositQRAdmin() {
  const { user } = useRequireAuth()
  const [qrCodes, setQRCodes] = useState<QRCode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [uploadingCurrency, setUploadingCurrency] = useState<string | null>(null)

  useEffect(() => {
    fetchQRCodes()
  }, [])

  const fetchQRCodes = async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/api/v1/admin/deposit-qr', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Fetch QR response error:', response.status, errorText)
        
        if (response.status === 403) {
          toast.error('Acceso denegado: Se requieren permisos de administrador')
        } else if (response.status === 401) {
          toast.error('No autenticado: Por favor inicia sesión')
        } else {
          toast.error(`Error ${response.status}: ${errorText}`)
        }
        return
      }
      
      const data = await response.json()
      setQRCodes(data.data || [])
    } catch (error) {
      console.error('Error fetching QR codes:', error)
      toast.error('Error de conexión al cargar códigos QR')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFileUpload = async (currency: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Solo se permiten archivos de imagen')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('El archivo no puede ser mayor a 5MB')
      return
    }

    setUploadingCurrency(currency)

    try {
      const formData = new FormData()
      formData.append('qr_image', file)
      formData.append('currency', currency)
      formData.append('description', `Escanea este QR para depositar ${currency}`)

      const response = await fetch('/api/v1/admin/deposit-qr', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Upload QR response error:', response.status, errorText)
        
        if (response.status === 403) {
          throw new Error('Acceso denegado: Se requieren permisos de administrador')
        } else if (response.status === 401) {
          throw new Error('No autenticado: Por favor inicia sesión')
        } else {
          // Try to parse as JSON first, fallback to text
          try {
            const errorData = JSON.parse(errorText)
            throw new Error(errorData.error || errorText)
          } catch {
            throw new Error(errorText || `Error ${response.status}`)
          }
        }
      }

      const result = await response.json()
      
      // Refresh the QR codes list
      await fetchQRCodes()

      toast.success(`QR de ${currency} subido exitosamente`)
    } catch (error) {
      console.error('Upload error:', error)
      toast.error('Error al subir el QR')
    } finally {
      setUploadingCurrency(null)
      // Reset file input
      event.target.value = ''
    }
  }

  const handleDeleteQR = async (qrId: string, currency: string) => {
    if (!confirm(`¿Estás seguro de eliminar el QR de ${currency}?`)) {
      return
    }

    try {
      const response = await fetch(`/api/v1/admin/deposit-qr/${qrId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to delete QR')
      }

      // Refresh the QR codes list
      await fetchQRCodes()
      toast.success(`QR de ${currency} eliminado`)
    } catch (error) {
      console.error('Delete error:', error)
      toast.error('Error al eliminar el QR')
    }
  }

  const getQRForCurrency = (currency: string) => {
    return qrCodes.find(qr => qr.currency === currency && qr.is_active)
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gestión de QR Depósitos</h1>
            <p className="text-sm text-gray-600 mt-1">
              Sube y gestiona códigos QR para depósitos por moneda
            </p>
          </div>
          <Link href="/admin" className="btn-secondary">
            Volver al Panel
          </Link>
        </div>

        {/* Alert */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-amber-400 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-amber-800">
                Importante
              </h3>
              <p className="mt-1 text-sm text-amber-700">
                Los códigos QR que subas aquí serán mostrados a todos los usuarios cuando intenten hacer depósitos. 
                Asegúrate de que sean válidos y estén asociados a cuentas correctas.
              </p>
            </div>
          </div>
        </div>

        {/* QR Management Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CURRENCIES.map((currency) => {
            const existingQR = getQRForCurrency(currency.code)
            const isUploading = uploadingCurrency === currency.code

            return (
              <div key={currency.code} className="card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <QrCodeIcon className="w-6 h-6 text-gray-600 mr-2" />
                    <h3 className="text-lg font-semibold">
                      {currency.name} ({currency.code})
                    </h3>
                  </div>
                  {existingQR && (
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                  )}
                </div>

                {/* Current QR Display */}
                {existingQR && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-center mb-3">
                      <img 
                        src={existingQR.qr_image_url} 
                        alt={`QR ${currency.code}`}
                        className="w-32 h-32 object-contain border rounded"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `data:image/svg+xml;base64,${btoa(`
                            <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
                              <rect width="128" height="128" fill="#f3f4f6"/>
                              <text x="64" y="64" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="10" fill="#6b7280">
                                QR ${currency.code}
                              </text>
                            </svg>
                          `)}`
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 text-center mb-3">
                      {existingQR.description}
                    </p>
                    <button
                      onClick={() => handleDeleteQR(existingQR.id, currency.code)}
                      className="btn-danger w-full text-sm py-2"
                    >
                      <TrashIcon className="w-4 h-4 mr-2" />
                      Eliminar QR
                    </button>
                  </div>
                )}

                {/* Upload Section */}
                <div className="space-y-3">
                  <label 
                    htmlFor={`qr-upload-${currency.code}`}
                    className={`btn-primary w-full cursor-pointer flex items-center justify-center py-3 ${
                      isUploading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isUploading ? (
                      <>
                        <div className="loading-spinner w-4 h-4 mr-2"></div>
                        Subiendo...
                      </>
                    ) : (
                      <>
                        <CloudArrowUpIcon className="w-5 h-5 mr-2" />
                        {existingQR ? 'Reemplazar QR' : 'Subir QR'}
                      </>
                    )}
                  </label>
                  <input
                    id={`qr-upload-${currency.code}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(currency.code, e)}
                    disabled={isUploading}
                  />
                  <p className="text-xs text-gray-500 text-center">
                    PNG, JPG hasta 5MB
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Instructions */}
        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Instrucciones</h3>
          <div className="space-y-3 text-sm text-gray-700">
            <div className="flex items-start">
              <span className="bg-primary-100 text-primary-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold mr-3 mt-0.5">1</span>
              <p>Sube un código QR válido para cada moneda que quieras soportar</p>
            </div>
            <div className="flex items-start">
              <span className="bg-primary-100 text-primary-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold mr-3 mt-0.5">2</span>
              <p>El QR debe estar asociado a una cuenta/billetera que puedas monitorear</p>
            </div>
            <div className="flex items-start">
              <span className="bg-primary-100 text-primary-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold mr-3 mt-0.5">3</span>
              <p>Los usuarios verán este QR cuando intenten hacer depósitos de la moneda correspondiente</p>
            </div>
            <div className="flex items-start">
              <span className="bg-primary-100 text-primary-800 rounded-full w-6 h-6 flex items-center justify-center text-xs font-semibold mr-3 mt-0.5">4</span>
              <p>Asegúrate de tener un sistema para detectar automáticamente los pagos y actualizar los saldos</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}