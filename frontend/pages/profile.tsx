import { useState, useEffect, useRef } from 'react'
import { useRequireAuth } from '../lib/auth'
import { userAPI, kycAPI, KYCStatus, KYCLevel, UserProfile } from '../lib/api'
import DashboardLayout from '../components/DashboardLayout'
import {
  UserIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  CameraIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  ArrowUpTrayIcon
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function ProfilePage() {
  const { user } = useRequireAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [kycStatus, setKycStatus] = useState<KYCStatus | null>(null)
  const [kycLevels, setKycLevels] = useState<KYCLevel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedLevel, setSelectedLevel] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('profile')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form states
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    address: '',
    city: '',
    date_of_birth: ''
  })

  const [kycForm, setKycForm] = useState({
    ci_number: '',
    full_name: '',
    date_of_birth: '',
    address: ''
  })

  useEffect(() => {
    if (user) {
      fetchProfileData()
    }
  }, [user])

  const fetchProfileData = async () => {
    try {
      setIsLoading(true)
      
      const [profileRes, kycStatusRes, kycLevelsRes] = await Promise.allSettled([
        userAPI.getProfile(),
        kycAPI.getStatus(),
        kycAPI.getLevels()
      ])

      if (profileRes.status === 'fulfilled') {
        const profileData = profileRes.value.data
        setProfile(profileData)
        setProfileForm({
          firstName: profileData.firstName || '',
          lastName: profileData.lastName || '',
          phone: profileData.phone || '',
          address: profileData.address || '',
          city: profileData.city || '',
          date_of_birth: profileData.date_of_birth || ''
        })
      }

      if (kycStatusRes.status === 'fulfilled') {
        setKycStatus(kycStatusRes.value.data)
      }

      if (kycLevelsRes.status === 'fulfilled') {
        setKycLevels(kycLevelsRes.value.data.levels || [])
      }
    } catch (error) {
      console.error('Error fetching profile data:', error)
      toast.error('Error al cargar datos del perfil')
    } finally {
      setIsLoading(false)
    }
  }

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsSubmitting(true)
      await userAPI.updateProfile(profileForm)
      toast.success('Perfil actualizado exitosamente')
      fetchProfileData()
    } catch (error) {
      toast.error('Error al actualizar perfil')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsSubmitting(true)
      await kycAPI.submitKYC({
        kyc_level: selectedLevel,
        ...kycForm
      })
      toast.success('KYC enviado para revisión')
      fetchProfileData()
    } catch (error) {
      toast.error('Error al enviar KYC')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDocumentUpload = async (documentType: string, file: File) => {
    console.log('📤 UPLOAD: Starting document upload process')
    console.log('📤 UPLOAD: Document type:', documentType)
    console.log('📤 UPLOAD: File info:', {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified
    })
    
    try {
      console.log('📤 UPLOAD: Creating FormData')
      const formData = new FormData()
      formData.append('document', file)
      formData.append('type', documentType)
      
      console.log('📤 UPLOAD: FormData created, entries:')
      const entries = Array.from(formData.entries())
      entries.forEach(([key, value]) => {
        if (value instanceof File) {
          console.log(`  ${key}: File(${value.name}, ${value.size} bytes, ${value.type})`)
        } else {
          console.log(`  ${key}: ${value}`)
        }
      })
      
      console.log('📤 UPLOAD: Calling kycAPI.uploadDocument')
      const response = await kycAPI.uploadDocument(formData)
      console.log('✅ UPLOAD: Upload successful, response:', response)
      
      toast.success('Documento subido exitosamente')
      fetchProfileData()
    } catch (error: any) {
      console.error('❌ UPLOAD: Upload failed, error details:', error)
      if (error.response) {
        console.error('❌ UPLOAD: Response error data:', error.response.data)
        console.error('❌ UPLOAD: Response status:', error.response.status)
        console.error('❌ UPLOAD: Response headers:', error.response.headers)
      }
      toast.error('Error al subir documento: ' + (error.response?.data?.error || error.message))
    }
  }

  const getKycStatusBadge = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircleIcon className="w-4 h-4 mr-1" />
            Aprobado
          </span>
        )
      case 'PENDING':
      case 'UNDER_REVIEW':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <ClockIcon className="w-4 h-4 mr-1" />
            En Revisión
          </span>
        )
      case 'REJECTED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircleIcon className="w-4 h-4 mr-1" />
            Rechazado
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Sin Verificar
          </span>
        )
    }
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
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Mi Perfil</h1>
          <p className="text-gray-600">Gestiona tu información personal y configuración de cuenta</p>
        </div>

        {/* KYC Alert */}
        {profile && profile.kyc_level < 3 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mt-0.5" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Verificación KYC Incompleta
                </h3>
                <p className="mt-1 text-sm text-yellow-700">
                  Completa tu verificación KYC para acceder a límites de trading más altos y todas las funciones.
                </p>
                <button
                  onClick={() => setActiveTab('kyc')}
                  className="mt-2 text-yellow-800 underline text-sm font-medium"
                >
                  Completar verificación →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('profile')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'profile'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <UserIcon className="w-5 h-5 inline mr-2" />
              Información Personal
            </button>
            <button
              onClick={() => setActiveTab('kyc')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'kyc'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <ShieldCheckIcon className="w-5 h-5 inline mr-2" />
              Verificación KYC
            </button>
          </nav>
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="card">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Información Personal</h3>
              <p className="text-sm text-gray-500">Actualiza tu información de perfil</p>
            </div>
            
            <form onSubmit={handleProfileUpdate} className="px-6 py-4 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={profileForm.firstName}
                    onChange={(e) => setProfileForm({...profileForm, firstName: e.target.value})}
                    className="input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Apellido
                  </label>
                  <input
                    type="text"
                    value={profileForm.lastName}
                    onChange={(e) => setProfileForm({...profileForm, lastName: e.target.value})}
                    className="input w-full"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={profile?.email || ''}
                  className="input w-full bg-gray-100"
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">El email no puede ser modificado</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({...profileForm, phone: e.target.value})}
                  className="input w-full"
                  placeholder="+591 7XXXXXXX"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dirección
                </label>
                <input
                  type="text"
                  value={profileForm.address}
                  onChange={(e) => setProfileForm({...profileForm, address: e.target.value})}
                  className="input w-full"
                  placeholder="Av. Ejemplo 1234"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={profileForm.city}
                    onChange={(e) => setProfileForm({...profileForm, city: e.target.value})}
                    className="input w-full"
                    placeholder="La Paz"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha de Nacimiento
                  </label>
                  <input
                    type="date"
                    value={profileForm.date_of_birth}
                    onChange={(e) => setProfileForm({...profileForm, date_of_birth: e.target.value})}
                    className="input w-full"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary disabled:opacity-50"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* KYC Tab */}
        {activeTab === 'kyc' && (
          <div className="space-y-6">
            {/* Current KYC Status */}
            <div className="card">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Estado de Verificación</h3>
              </div>
              
              <div className="px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Nivel KYC Actual</p>
                    <p className="text-2xl font-bold text-gray-900">
                      Nivel {profile?.kyc_level || 0}
                    </p>
                  </div>
                  <div>
                    {kycStatus ? getKycStatusBadge(kycStatus.status) : getKycStatusBadge('NONE')}
                  </div>
                </div>

                {kycStatus?.rejection_reason && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                    <p className="text-sm text-red-800">
                      <strong>Motivo de rechazo:</strong> {kycStatus.rejection_reason}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* KYC Levels */}
            <div className="card">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">Niveles de Verificación</h3>
                <p className="text-sm text-gray-500">Completa cada nivel para aumentar tus límites</p>
              </div>
              
              <div className="px-6 py-4">
                <div className="space-y-4">
                  {[1, 2, 3].map((level) => {
                    const isCompleted = (profile?.kyc_level || 0) >= level
                    const isCurrent = (profile?.kyc_level || 0) === level - 1
                    
                    return (
                      <div key={level} className={`border rounded-lg p-4 ${
                        isCompleted ? 'border-green-200 bg-green-50' :
                        isCurrent ? 'border-primary-200 bg-primary-50' :
                        'border-gray-200'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center">
                            {isCompleted ? (
                              <CheckCircleIcon className="w-6 h-6 text-green-500 mr-3" />
                            ) : isCurrent ? (
                              <ClockIcon className="w-6 h-6 text-primary-500 mr-3" />
                            ) : (
                              <div className="w-6 h-6 border-2 border-gray-300 rounded-full mr-3" />
                            )}
                            <div>
                              <h4 className="font-medium text-gray-900">Nivel {level}</h4>
                              <p className="text-sm text-gray-600">
                                {level === 1 && "Verificación básica - CI"}
                                {level === 2 && "Verificación intermedia - Selfie + Domicilio"}
                                {level === 3 && "Verificación completa - Documentos adicionales"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">
                              Límite: ${level === 1 ? '1,000' : level === 2 ? '10,000' : '100,000'}
                            </p>
                            <p className="text-xs text-gray-500">diario</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* KYC Form */}
            {(!kycStatus || kycStatus.status === 'REJECTED' || kycStatus.status === 'UNDER_REVIEW') && (profile?.kyc_level || 0) < 3 && (
              <div className="card">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-medium text-gray-900">
                    Completar Verificación KYC Nivel {selectedLevel}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Proporciona la información requerida para verificar tu identidad
                  </p>
                </div>
                
                <form onSubmit={handleKycSubmit} className="px-6 py-4 space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nivel de Verificación
                    </label>
                    <select
                      value={selectedLevel}
                      onChange={(e) => setSelectedLevel(Number(e.target.value))}
                      className="input w-full"
                      disabled={(profile?.kyc_level || 0) >= 1}
                    >
                      <option value={1}>Nivel 1 - Verificación Básica</option>
                      <option value={2}>Nivel 2 - Verificación Intermedia</option>
                      <option value={3}>Nivel 3 - Verificación Completa</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Número de CI
                    </label>
                    <input
                      type="text"
                      value={kycForm.ci_number}
                      onChange={(e) => setKycForm({...kycForm, ci_number: e.target.value})}
                      className="input w-full"
                      placeholder="1234567 LP"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre Completo (como aparece en CI)
                    </label>
                    <input
                      type="text"
                      value={kycForm.full_name}
                      onChange={(e) => setKycForm({...kycForm, full_name: e.target.value})}
                      className="input w-full"
                      placeholder="Juan Carlos Pérez López"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Fecha de Nacimiento
                    </label>
                    <input
                      type="date"
                      value={kycForm.date_of_birth}
                      onChange={(e) => setKycForm({...kycForm, date_of_birth: e.target.value})}
                      className="input w-full"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Dirección Actual
                    </label>
                    <textarea
                      value={kycForm.address}
                      onChange={(e) => setKycForm({...kycForm, address: e.target.value})}
                      className="input w-full"
                      rows={3}
                      placeholder="Av. Arce 1234, Zona San Jorge, La Paz, Bolivia"
                      required
                    />
                  </div>

                  {/* Document Upload Section */}
                  <div className="border-t pt-6">
                    <h4 className="text-md font-medium text-gray-900 mb-4">Documentos Requeridos</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* CI Front */}
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h5 className="text-sm font-medium text-gray-900 mb-2">CI - Frente</h5>
                        <p className="text-xs text-gray-500 mb-4">Imagen clara del frente de tu cédula</p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleDocumentUpload('CI', file)  // Changed from 'CI_FRONT' to 'CI'
                          }}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="btn-secondary text-xs"
                        >
                          <ArrowUpTrayIcon className="w-4 h-4 mr-1" />
                          Subir Imagen
                        </button>
                      </div>

                      {/* CI Back */}
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                        <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <h5 className="text-sm font-medium text-gray-900 mb-2">CI - Reverso</h5>
                        <p className="text-xs text-gray-500 mb-4">Imagen clara del reverso de tu cédula</p>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="btn-secondary text-xs"
                        >
                          <ArrowUpTrayIcon className="w-4 h-4 mr-1" />
                          Subir Imagen
                        </button>
                      </div>
                    </div>

                    {selectedLevel >= 2 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        {/* Selfie */}
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                          <CameraIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                          <h5 className="text-sm font-medium text-gray-900 mb-2">Selfie con CI</h5>
                          <p className="text-xs text-gray-500 mb-4">Foto tuya sosteniendo tu cédula</p>
                          <button type="button" className="btn-secondary text-xs">
                            <CameraIcon className="w-4 h-4 mr-1" />
                            Tomar Foto
                          </button>
                        </div>

                        {/* Proof of Address */}
                        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                          <DocumentTextIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                          <h5 className="text-sm font-medium text-gray-900 mb-2">Comprobante de Domicilio</h5>
                          <p className="text-xs text-gray-500 mb-4">Recibo de servicio o estado de cuenta</p>
                          <button type="button" className="btn-secondary text-xs">
                            <ArrowUpTrayIcon className="w-4 h-4 mr-1" />
                            Subir Documento
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-primary disabled:opacity-50"
                    >
                      {isSubmitting ? 'Enviando...' : 'Enviar para Verificación'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}