import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, ChevronLeft, ChevronRight, LogOut, User, Building2 } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useFilterStore } from '@/stores/filterStore'
import { useCompanies } from '@/hooks/useCompanies'
import { useUnreadAlertCount } from '@/hooks/useAlerts'
import { formatCNPJ, formatCompetencia, competenciaOptions } from '@/lib/utils'
import api from '@/lib/api'

export default function Header() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const { selectedCompanyId, selectedCompetencia, setCompany, setCompetencia } = useFilterStore()
  const { data: companies = [] } = useCompanies()
  const { data: alertCount = 0 } = useUnreadAlertCount()

  const [showCompanyMenu, setShowCompanyMenu] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)

  const selectedCompany = companies.find((c) => c.id === selectedCompanyId)
  const competOpts = competenciaOptions(36)

  const currentIndex = competOpts.findIndex((o) => o.value === selectedCompetencia)

  function prevMonth() {
    if (currentIndex < competOpts.length - 1) {
      setCompetencia(competOpts[currentIndex + 1].value)
    }
  }

  function nextMonth() {
    if (currentIndex > 0) {
      setCompetencia(competOpts[currentIndex - 1].value)
    }
  }

  async function handleLogout() {
    try {
      await api.post('/auth/logout')
    } catch {}
    logout()
    navigate('/login')
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center gap-4 px-6 sticky top-0 z-20">
      {/* Company Selector */}
      <div className="relative">
        <button
          onClick={() => setShowCompanyMenu(!showCompanyMenu)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm hover:bg-gray-100 transition-colors"
        >
          <Building2 className="h-4 w-4 text-gray-500" />
          <div className="text-left max-w-[200px]">
            {selectedCompany ? (
              <>
                <p className="font-medium text-gray-900 leading-tight truncate">{selectedCompany.name}</p>
                <p className="text-[11px] text-gray-400">{formatCNPJ(selectedCompany.cnpj)}</p>
              </>
            ) : (
              <p className="text-gray-500">Todas as empresas</p>
            )}
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>

        {showCompanyMenu && (
          <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
            <button
              onClick={() => { setCompany(undefined); setShowCompanyMenu(false) }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 text-gray-500"
            >
              Todas as empresas
            </button>
            {companies.filter((c) => c.active).map((company) => (
              <button
                key={company.id}
                onClick={() => { setCompany(company.id); setShowCompanyMenu(false) }}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-primary-50 flex flex-col"
              >
                <span className="font-medium text-gray-900">{company.name}</span>
                <span className="text-xs text-gray-400">{formatCNPJ(company.cnpj)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Competência picker */}
      <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-1 py-0.5">
        <button
          onClick={prevMonth}
          disabled={currentIndex >= competOpts.length - 1}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-gray-600" />
        </button>
        <select
          value={selectedCompetencia}
          onChange={(e) => setCompetencia(e.target.value)}
          className="bg-transparent text-sm font-medium text-gray-800 outline-none cursor-pointer px-1"
        >
          {competOpts.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          onClick={nextMonth}
          disabled={currentIndex <= 0}
          className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors"
        >
          <ChevronRight className="h-4 w-4 text-gray-600" />
        </button>
      </div>

      <div className="flex-1" />

      {/* Alert bell */}
      <button
        onClick={() => navigate('/alerts')}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Bell className="h-5 w-5 text-gray-600" />
        {alertCount > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {alertCount > 9 ? '9+' : alertCount}
          </span>
        )}
      </button>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 transition-colors"
        >
          <div className="h-7 w-7 rounded-full bg-primary-700 flex items-center justify-center text-white text-xs font-bold">
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="text-left hidden sm:block">
            <p className="text-sm font-medium text-gray-900 leading-tight">{user?.name}</p>
            <p className="text-xs text-gray-400">{user?.role}</p>
          </div>
          <ChevronDown className="h-4 w-4 text-gray-400" />
        </button>

        {showUserMenu && (
          <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-medium text-gray-900">{user?.name}</p>
              <p className="text-xs text-gray-400">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 rounded-b-lg"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        )}
      </div>

      {/* Overlay to close menus */}
      {(showCompanyMenu || showUserMenu) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setShowCompanyMenu(false); setShowUserMenu(false) }}
        />
      )}
    </header>
  )
}
