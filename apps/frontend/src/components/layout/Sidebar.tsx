import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Upload,
  FileText,
  Building2,
  Package,
  BarChart3,
  Bell,
  Users,
  Settings,
  TrendingUp,
  Calculator,
  Mail,
  Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useUnreadAlertCount } from '@/hooks/useAlerts'

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  badge?: number
  adminOnly?: boolean
}

export default function Sidebar() {
  const { isAdmin } = useAuthStore()
  const { data: alertCount = 0 } = useUnreadAlertCount()

  const navItems: NavItem[] = [
    { label: 'Dashboard', path: '/', icon: <LayoutDashboard className="h-4 w-4" /> },
    { label: 'Importar XML', path: '/import', icon: <Upload className="h-4 w-4" /> },
    { label: 'Notas Fiscais', path: '/notes', icon: <FileText className="h-4 w-4" /> },
    { label: 'Empresas', path: '/companies', icon: <Building2 className="h-4 w-4" /> },
    { label: 'Produtos', path: '/products', icon: <Package className="h-4 w-4" /> },
    { label: 'Relatórios', path: '/reports', icon: <BarChart3 className="h-4 w-4" /> },
    { label: 'E-mail Fiscal', path: '/email', icon: <Mail className="h-4 w-4" /> },
    { label: 'Segregação PGDAS-D', path: '/segregacao', icon: <Calculator className="h-4 w-4" /> },
    { label: 'Consulta Tributária', path: '/tax', icon: <Receipt className="h-4 w-4" /> },
    {
      label: 'Alertas',
      path: '/alerts',
      icon: <Bell className="h-4 w-4" />,
      badge: alertCount,
    },
  ]

  const adminItems: NavItem[] = [
    {
      label: 'Usuários',
      path: '/settings/users',
      icon: <Users className="h-4 w-4" />,
      adminOnly: true,
    },
  ]

  return (
    <aside className="w-60 flex-shrink-0 bg-sidebar flex flex-col h-screen fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/10">
        <div className="h-8 w-8 rounded-lg bg-primary-600 flex items-center justify-center">
          <TrendingUp className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-white font-bold text-sm leading-tight">Fiscal</h1>
          <p className="text-sidebar-text text-xs">Dashboard</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-sidebar-text text-[10px] font-semibold uppercase tracking-widest px-2 mb-2">
          Principal
        </p>
        {navItems.map((item) => (
          <SidebarLink key={item.path} item={item} />
        ))}

        {isAdmin() && (
          <>
            <p className="text-sidebar-text text-[10px] font-semibold uppercase tracking-widest px-2 mt-4 mb-2">
              Administração
            </p>
            {adminItems.map((item) => (
              <SidebarLink key={item.path} item={item} />
            ))}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-white/10">
        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-2 py-2 rounded-md text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active text-sm transition-colors"
        >
          <Settings className="h-4 w-4" />
          <span>Configurações</span>
        </NavLink>
      </div>
    </aside>
  )
}

function SidebarLink({ item }: { item: NavItem }) {
  const location = useLocation()
  const isActive = item.path === '/'
    ? location.pathname === '/'
    : location.pathname.startsWith(item.path)

  return (
    <NavLink
      to={item.path}
      end={item.path === '/'}
      className={cn(
        'flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors relative',
        isActive
          ? 'bg-primary-800 text-white'
          : 'text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active'
      )}
    >
      {item.icon}
      <span>{item.label}</span>
      {!!item.badge && item.badge > 0 && (
        <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </NavLink>
  )
}
