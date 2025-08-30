import { useState, useEffect } from 'react'
import { useRequireAuth } from '../../lib/auth'
import DashboardLayout from '../../components/DashboardLayout'
import { CogIcon, QrCodeIcon, BanknotesIcon } from '@heroicons/react/24/outline'
import Link from 'next/link'
import { useRouter } from 'next/router'

export default function AdminDashboard() {
  const { user } = useRequireAuth()
  const router = useRouter()
  
  // Check if user is admin (in a real app, this should be checked on the backend)
  useEffect(() => {
    // For now, we'll just check if user exists
    // In production, you'd want to check user.role === 'admin'
    if (!user) {
      return
    }
  }, [user])

  const adminModules = [
    {
      title: 'Gestión de QR Depósitos',
      description: 'Subir y gestionar códigos QR para depósitos por moneda',
      icon: QrCodeIcon,
      href: '/admin/deposit-qr',
      color: 'bg-blue-500',
    },
    {
      title: 'Cuentas Bancarias',
      description: 'Gestionar cuentas bancarias para depósitos y retiros',
      icon: BanknotesIcon,
      href: '/admin/bank-accounts',
      color: 'bg-green-500',
    },
    {
      title: 'Configuración General',
      description: 'Configurar parámetros del sistema y límites',
      icon: CogIcon,
      href: '/admin/settings',
      color: 'bg-purple-500',
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-red-600 to-red-800 rounded-lg p-6 text-white">
          <h1 className="text-2xl font-bold mb-2">
            Panel de Administrador
          </h1>
          <p className="text-red-100">
            Gestiona la configuración del sistema P2P Bolivia
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminModules.map((module) => (
            <Link key={module.href} href={module.href}>
              <div className="card hover:shadow-lg transition-shadow cursor-pointer">
                <div className="flex items-center mb-4">
                  <div className={`w-12 h-12 ${module.color} rounded-lg flex items-center justify-center`}>
                    <module.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900">{module.title}</h3>
                  </div>
                </div>
                <p className="text-sm text-gray-600">{module.description}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <CogIcon className="h-5 w-5 text-yellow-400 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">
                Acceso de Administrador
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                Solo los administradores pueden acceder a estas funciones. Cualquier cambio afectará a todos los usuarios del sistema.
              </p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}