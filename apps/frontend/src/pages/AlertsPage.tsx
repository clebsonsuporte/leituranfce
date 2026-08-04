import { AlertTriangle, AlertCircle, Info, Bell, CheckCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAlerts, useMarkAlertRead, useMarkAllAlertsRead } from '@/hooks/useAlerts'
import { toast } from '@/components/ui/toast'
import { formatDateTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  CRITICAL: <AlertCircle className="h-5 w-5 text-red-600" />,
  ERROR: <AlertCircle className="h-5 w-5 text-red-500" />,
  WARNING: <AlertTriangle className="h-5 w-5 text-orange-500" />,
  INFO: <Info className="h-5 w-5 text-blue-500" />,
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'border-l-red-600 bg-red-50',
  ERROR: 'border-l-red-400 bg-red-50',
  WARNING: 'border-l-orange-400 bg-orange-50',
  INFO: 'border-l-blue-400 bg-blue-50',
}

const TYPE_LABELS: Record<string, string> = {
  DUPLICATE_XML: 'XML Duplicado',
  MISSING_NOTE: 'Nota Faltando',
  TAX_DIVERGENCE: 'Divergência Fiscal',
  SEQUENCE_BREAK: 'Quebra de Sequência',
  IMPORT_ERROR: 'Erro de Importação',
  FISCAL_AUDIT: 'Auditoria Fiscal',
}

export default function AlertsPage() {
  const { data, isLoading, refetch } = useAlerts({ read: false })
  const { data: readData, isLoading: readLoading } = useAlerts({ read: true })
  const markRead = useMarkAlertRead()
  const markAllRead = useMarkAllAlertsRead()

  const unreadAlerts = data?.alerts || []
  const readAlerts = readData?.alerts || []

  async function handleMarkAllRead() {
    try {
      await markAllRead.mutateAsync()
      toast.success('Todos alertas marcados como lidos')
    } catch {
      toast.error('Erro ao marcar alertas')
    }
  }

  async function handleMarkRead(id: string) {
    try {
      await markRead.mutateAsync(id)
    } catch {
      toast.error('Erro ao marcar alerta')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Alertas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.unreadCount || 0} alerta(s) não lido(s)
          </p>
        </div>
        {(data?.unreadCount || 0) > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending}
            className="gap-2"
          >
            <CheckCheck className="h-4 w-4" />
            Marcar todos como lidos
          </Button>
        )}
      </div>

      {/* Unread alerts */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
          Não lidos ({data?.unreadCount || 0})
        </h2>
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))
        ) : unreadAlerts.length === 0 ? (
          <Card>
            <CardContent className="py-10 flex flex-col items-center gap-3 text-gray-400">
              <Bell className="h-8 w-8 text-gray-200" />
              <p className="text-sm">Nenhum alerta não lido</p>
            </CardContent>
          </Card>
        ) : (
          unreadAlerts.map((alert: {
            id: string
            type: string
            severity: string
            title: string
            message: string
            createdAt: string
            read: boolean
          }) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onMarkRead={() => handleMarkRead(alert.id)}
            />
          ))
        )}
      </div>

      {/* Read alerts */}
      {readAlerts.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Lidos recentes
          </h2>
          {readLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))
          ) : (
            readAlerts.slice(0, 10).map((alert: {
              id: string
              type: string
              severity: string
              title: string
              message: string
              createdAt: string
              read: boolean
            }) => (
              <AlertCard key={alert.id} alert={alert} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function AlertCard({
  alert,
  onMarkRead,
}: {
  alert: {
    id: string
    type: string
    severity: string
    title: string
    message: string
    createdAt: string
    read: boolean
  }
  onMarkRead?: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-4 p-4 rounded-lg border border-l-4 transition-all',
        SEVERITY_COLORS[alert.severity] || 'border-l-gray-300 bg-gray-50',
        alert.read && 'opacity-60'
      )}
    >
      <div className="mt-0.5 shrink-0">
        {SEVERITY_ICONS[alert.severity] || <Bell className="h-5 w-5 text-gray-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">{alert.title}</p>
            <span className="text-xs text-gray-500">{TYPE_LABELS[alert.type] || alert.type}</span>
          </div>
          <span className="text-xs text-gray-400 shrink-0">{formatDateTime(alert.createdAt)}</span>
        </div>
        <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
      </div>

      {!alert.read && onMarkRead && (
        <button
          onClick={onMarkRead}
          className="text-gray-400 hover:text-gray-600 p-1 rounded"
          title="Marcar como lido"
        >
          <CheckCheck className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
