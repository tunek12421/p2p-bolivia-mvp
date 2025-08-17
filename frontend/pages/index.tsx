import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useAuth } from '../lib/auth'
import { p2pAPI, walletAPI } from '../lib/api'
import { 
  ArrowUpIcon, 
  ArrowDownIcon, 
  CurrencyDollarIcon,
  ChartBarIcon,
  UserGroupIcon,
  SparklesIcon,
  ArrowTrendingUpIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline'

interface Stats {
  totalOrders: number
  totalVolume: number
  activeUsers: number
  dailyTrades: number
}

interface Rate {
  best_buy?: number
  best_sell?: number
  spread_percent?: number
  last_update?: string
}

export default function HomePage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [stats, setStats] = useState<Stats>({
    totalOrders: 0,
    totalVolume: 0,
    activeUsers: 0,
    dailyTrades: 0
  })
  const [rates, setRates] = useState<Record<string, Rate>>({})
  const [loadingRates, setLoadingRates] = useState(true)

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/dashboard')
    }
  }, [user, isLoading, router])

  useEffect(() => {
    fetchRates()
    fetchStats()
  }, [])

  const fetchRates = async () => {
    try {
      const response = await p2pAPI.getRates()
      setRates(response.data)
    } catch (error) {
      console.error('Error fetching rates:', error)
    } finally {
      setLoadingRates(false)
    }
  }

  const fetchStats = async () => {
    try {
      // Simulate stats - in real app would come from analytics API
      setStats({
        totalOrders: 12547,
        totalVolume: 2849621,
        activeUsers: 8934,
        dailyTrades: 1247
      })
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'BOB' ? 'USD' : currency,
      minimumFractionDigits: currency === 'BOB' ? 2 : 4,
      maximumFractionDigits: currency === 'BOB' ? 2 : 4,
    }).format(amount).replace('$', currency === 'BOB' ? 'Bs. ' : '$')
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loading-spinner w-8 h-8 text-primary-600"></div>
      </div>
    )
  }

  if (user) {
    return null // Will redirect to dashboard
  }

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="flex items-center">
                  <CurrencyDollarIcon className="h-8 w-8 text-primary-600" />
                  <span className="ml-2 text-xl font-bold text-gray-900">P2P Bolivia</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/auth/login" className="btn-secondary">
                Sign In
              </Link>
              <Link href="/auth/register" className="btn-primary">
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary-50 to-indigo-100 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6 animate-fade-in">
              Trade Bolivianos & USD{' '}
              <span className="text-primary-600">Securely</span>
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto animate-fade-in animation-delay-200">
              The most trusted peer-to-peer exchange platform in Bolivia. 
              Trade BOB, USD, and USDT with zero fees and instant settlements.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in animation-delay-400">
              <Link href="/auth/register" className="btn-primary text-lg px-8 py-3">
                Start Trading Now
              </Link>
              <Link href="#features" className="btn-secondary text-lg px-8 py-3">
                Learn More
              </Link>
            </div>
          </div>
        </div>
        
        {/* Decorative elements */}
        <div className="absolute top-0 left-0 w-72 h-72 bg-primary-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-bounce-subtle"></div>
        <div className="absolute top-0 right-0 w-72 h-72 bg-purple-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-bounce-subtle animation-delay-200"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-300 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-bounce-subtle animation-delay-400"></div>
      </section>

      {/* Real-time Rates */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Live Exchange Rates</h2>
            <p className="text-gray-600">Real-time market prices from active trades</p>
          </div>
          
          {loadingRates ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card shimmer h-32"></div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(rates).slice(0, 3).map(([pair, rate]) => {
                const [from, to] = pair.split('_')
                const isUp = Math.random() > 0.5 // Simulate price movement
                
                return (
                  <div key={pair} className="card hover:shadow-medium transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center">
                        <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center mr-3">
                          <span className="text-primary-600 font-semibold text-sm">{from}</span>
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{pair.replace('_', '/')}</h3>
                          <p className="text-sm text-gray-500">{from} to {to}</p>
                        </div>
                      </div>
                      {isUp ? (
                        <ArrowUpIcon className="w-5 h-5 text-success-500" />
                      ) : (
                        <ArrowDownIcon className="w-5 h-5 text-danger-500" />
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      {rate.best_buy && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">Buy</span>
                          <span className="font-semibold text-success-600">
                            {formatCurrency(rate.best_buy, to)}
                          </span>
                        </div>
                      )}
                      {rate.best_sell && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">Sell</span>
                          <span className="font-semibold text-danger-600">
                            {formatCurrency(rate.best_sell, to)}
                          </span>
                        </div>
                      )}
                      {rate.spread_percent && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">Spread</span>
                          <span className="text-sm text-gray-700">
                            {rate.spread_percent.toFixed(2)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Trusted by Thousands</h2>
            <p className="text-gray-600">Join the growing community of P2P traders in Bolivia</p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ChartBarIcon className="w-8 h-8 text-primary-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-2">
                {formatNumber(stats.totalOrders)}
              </div>
              <div className="text-gray-600">Total Orders</div>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CurrencyDollarIcon className="w-8 h-8 text-success-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-2">
                ${formatNumber(stats.totalVolume)}
              </div>
              <div className="text-gray-600">Trading Volume</div>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserGroupIcon className="w-8 h-8 text-purple-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-2">
                {formatNumber(stats.activeUsers)}
              </div>
              <div className="text-gray-600">Active Users</div>
            </div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ArrowTrendingUpIcon className="w-8 h-8 text-orange-600" />
              </div>
              <div className="text-3xl font-bold text-gray-900 mb-2">
                {formatNumber(stats.dailyTrades)}
              </div>
              <div className="text-gray-600">Daily Trades</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Why Choose P2P Bolivia?
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Experience the future of currency exchange with our secure, fast, and user-friendly platform
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center group">
              <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-primary-200 transition-colors">
                <ShieldCheckIcon className="w-10 h-10 text-primary-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Bank-Level Security</h3>
              <p className="text-gray-600">
                Your funds are protected with enterprise-grade encryption and multi-signature wallets
              </p>
            </div>
            
            <div className="text-center group">
              <div className="w-20 h-20 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-success-200 transition-colors">
                <SparklesIcon className="w-10 h-10 text-success-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Zero Trading Fees</h3>
              <p className="text-gray-600">
                Trade without worrying about fees. Keep 100% of your profits with our zero-fee structure
              </p>
            </div>
            
            <div className="text-center group">
              <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:bg-purple-200 transition-colors">
                <CurrencyDollarIcon className="w-10 h-10 text-purple-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Multiple Payment Methods</h3>
              <p className="text-gray-600">
                Support for bank transfers, PayPal, Stripe, and QR payments for maximum convenience
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-primary-600 to-primary-800">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            Ready to Start Trading?
          </h2>
          <p className="text-xl text-primary-100 mb-8">
            Join thousands of traders who trust P2P Bolivia for their currency exchange needs
          </p>
          <Link href="/auth/register" className="btn bg-white text-primary-600 hover:bg-gray-50 text-lg px-8 py-3 font-semibold">
            Create Your Account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center mb-4">
                <CurrencyDollarIcon className="h-8 w-8 text-primary-400" />
                <span className="ml-2 text-xl font-bold">P2P Bolivia</span>
              </div>
              <p className="text-gray-300 mb-4">
                The most trusted peer-to-peer exchange platform in Bolivia. 
                Trade BOB, USD, and USDT securely and efficiently.
              </p>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Platform</h3>
              <ul className="space-y-2 text-gray-300">
                <li><Link href="/auth/login" className="hover:text-white transition-colors">Sign In</Link></li>
                <li><Link href="/auth/register" className="hover:text-white transition-colors">Register</Link></li>
                <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
              </ul>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-4">Support</h3>
              <ul className="space-y-2 text-gray-300">
                <li><a href="mailto:support@p2pbolivia.com" className="hover:text-white transition-colors">Contact Us</a></li>
                <li><a href="/help" className="hover:text-white transition-colors">Help Center</a></li>
                <li><a href="/terms" className="hover:text-white transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2024 P2P Bolivia. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}