import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useAuth } from '../../lib/auth'
import { EyeIcon, EyeSlashIcon, CurrencyDollarIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const { register, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user) {
      router.push('/dashboard')
    }
  }, [user, router])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const validateForm = () => {
    const { firstName, lastName, email, password, confirmPassword } = formData

    if (!firstName.trim()) {
      toast.error('El nombre es requerido')
      return false
    }

    if (!lastName.trim()) {
      toast.error('El apellido es requerido')
      return false
    }

    if (!email.trim()) {
      toast.error('El email es requerido')
      return false
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Por favor ingresa un email válido')
      return false
    }

    if (password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres')
      return false
    }

    if (password !== confirmPassword) {
      toast.error('Las contraseñas no coinciden')
      return false
    }

    if (!agreedToTerms) {
      toast.error('Por favor acepta los Términos de Servicio y Política de Privacidad')
      return false
    }

    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    console.log('📝 FORM: Registration form submitted')
    console.log('📝 FORM: Form data:', {
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      passwordLength: formData.password?.length,
      confirmPasswordLength: formData.confirmPassword?.length,
      agreedToTerms
    })
    
    if (!validateForm()) {
      console.log('❌ FORM: Form validation failed')
      return
    }

    console.log('✅ FORM: Form validation passed, starting registration')
    setIsLoading(true)
    
    try {
      const registrationData = {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim() || undefined,
        password: formData.password,
      }
      
      console.log('📤 FORM: Calling register function with data:', {
        ...registrationData,
        password: '[HIDDEN]'
      })
      
      const success = await register(registrationData)
      
      console.log('📥 FORM: Register function returned:', success)
      
      if (success) {
        console.log('🎯 FORM: Registration successful, redirecting to dashboard')
        router.push('/dashboard')
      } else {
        console.log('❌ FORM: Registration failed but no error thrown')
      }
    } catch (error) {
      console.error('💥 FORM: Registration error caught:', error)
    } finally {
      setIsLoading(false)
      console.log('🏁 FORM: Registration process completed, loading state cleared')
    }
  }

  const passwordStrength = (password: string) => {
    let strength = 0
    if (password.length >= 6) strength++
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++
    if (password.match(/\d/)) strength++
    if (password.match(/[^a-zA-Z\d]/)) strength++
    return strength
  }

  const getPasswordStrengthColor = (strength: number) => {
    if (strength === 0) return 'bg-gray-200'
    if (strength === 1) return 'bg-red-400'
    if (strength === 2) return 'bg-yellow-400'
    if (strength === 3) return 'bg-blue-400'
    return 'bg-green-400'
  }

  const getPasswordStrengthText = (strength: number) => {
    if (strength === 0) return 'Muy Débil'
    if (strength === 1) return 'Débil'
    if (strength === 2) return 'Regular'
    if (strength === 3) return 'Buena'
    return 'Fuerte'
  }

  if (user) {
    return null // Will redirect to dashboard
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center text-primary-600 hover:text-primary-700">
            <CurrencyDollarIcon className="h-10 w-10" />
            <span className="ml-2 text-2xl font-bold">P2P Bolivia</span>
          </Link>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Crea tu cuenta
          </h2>
          <p className="mt-2 text-gray-600">
            Únete a miles de traders en P2P Bolivia
          </p>
        </div>

        {/* Registration Form */}
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  required
                  className="input"
                  placeholder="Nombre"
                  value={formData.firstName}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-2">
                  Apellido
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  required
                  className="input"
                  placeholder="Apellido"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Dirección de Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                placeholder="Ingresa tu email"
                value={formData.email}
                onChange={handleInputChange}
                disabled={isLoading}
              />
            </div>

            {/* Phone (optional) */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                Número de Teléfono <span className="text-gray-400">(Opcional)</span>
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                className="input"
                placeholder="+591 12345678"
                value={formData.phone}
                onChange={handleInputChange}
                disabled={isLoading}
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="input pr-10"
                  placeholder="Crea una contraseña"
                  value={formData.password}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              
              {/* Password strength indicator */}
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Fortaleza de la contraseña:</span>
                    <span className={`font-medium ${
                      passwordStrength(formData.password) >= 3 ? 'text-green-600' : 'text-gray-600'
                    }`}>
                      {getPasswordStrengthText(passwordStrength(formData.password))}
                    </span>
                  </div>
                  <div className="mt-1 flex space-x-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className={`h-1 flex-1 rounded-full ${
                          level <= passwordStrength(formData.password)
                            ? getPasswordStrengthColor(passwordStrength(formData.password))
                            : 'bg-gray-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirmar Contraseña
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  className="input pr-10"
                  placeholder="Confirma tu contraseña"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              
              {/* Password match indicator */}
              {formData.confirmPassword && (
                <div className="mt-2 flex items-center">
                  {formData.password === formData.confirmPassword ? (
                    <>
                      <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
                      <span className="text-sm text-green-600">Las contraseñas coinciden</span>
                    </>
                  ) : (
                    <span className="text-sm text-red-600">Las contraseñas no coinciden</span>
                  )}
                </div>
              )}
            </div>

            {/* Terms and Privacy */}
            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="agreedToTerms"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="agreedToTerms" className="text-gray-700">
                  Acepto los{' '}
                  <Link href="/terms" className="text-primary-600 hover:text-primary-500">
                    Términos de Servicio
                  </Link>{' '}
                  y la{' '}
                  <Link href="/privacy" className="text-primary-600 hover:text-primary-500">
                    Política de Privacidad
                  </Link>
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary w-full flex justify-center py-3"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center">
                  <div className="loading-spinner w-4 h-4 mr-2"></div>
                  Creando cuenta...
                </div>
              ) : (
                'Crear Cuenta'
              )}
            </button>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">¿Ya tienes una cuenta?</span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                href="/auth/login"
                className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
              >
                Inicia sesión en tu cuenta
              </Link>
            </div>
          </div>
        </div>

        {/* Security notice */}
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="text-sm text-green-800">
            <p className="font-medium mb-1">🔒 Tu seguridad es nuestra prioridad</p>
            <p>Tu información personal está encriptada y almacenada de forma segura. Nunca compartimos tus datos con terceros.</p>
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-8 text-center">
          <div className="flex justify-center space-x-6 text-sm text-gray-500">
            <Link href="/terms" className="hover:text-gray-700">Terms</Link>
            <Link href="/privacy" className="hover:text-gray-700">Privacy</Link>
            <Link href="/support" className="hover:text-gray-700">Support</Link>
          </div>
        </div>
      </div>
    </div>
  )
}