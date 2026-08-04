import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Upload,
  Trash2,
  RefreshCw,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { cn, formatCNPJ, formatDateTime } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import {
  useCompanyCertificate,
  useUploadCertificate,
  useDeleteCertificate,
  useDfeSyncConfig,
  useUpdateDfeSyncConfig,
  useTriggerDfeSync,
  useDfeSyncStatus,
  useDfeSyncHistory,
  type DfeSyncLog,
} from '@/hooks/useDfe'

const INTERVAL_OPTIONS = [
  { value: '60', label: 'A cada 1 hora' },
  { value: '120', label: 'A cada 2 horas' },
  { value: '240', label: 'A cada 4 horas' },
  { value: '360', label: 'A cada 6 horas' },
  { value: '1440', label: '1 vez por dia' },
]

const STATUS_BADGE: Record<DfeSyncLog['status'], { label: string; variant: 'default' | 'success' | 'destructive'; icon: typeof Clock }> = {
  PROCESSING: { label: 'Em andamento', variant: 'default', icon: Loader2 },
  COMPLETED: { label: 'Concluído', variant: 'success', icon: CheckCircle2 },
  FAILED: { label: 'Falhou', variant: 'destructive', icon: XCircle },
}

interface CertificateTabProps {
  companyId: string
}

export default function CertificateTab({ companyId }: CertificateTabProps) {
  const isAdmin = useAuthStore((s) => s.isAdmin())
  const queryClient = useQueryClient()

  const { data: certificate, isLoading: loadingCert } = useCompanyCertificate(companyId)
  const { data: syncConfig } = useDfeSyncConfig(companyId)
  const { data: history } = useDfeSyncHistory(companyId)

  const uploadMutation = useUploadCertificate(companyId)
  const deleteMutation = useDeleteCertificate(companyId)
  const configMutation = useUpdateDfeSyncConfig(companyId)
  const triggerMutation = useTriggerDfeSync(companyId)

  const [file, setFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [intervalMinutes, setIntervalMinutes] = useState('60')
  const [activeLogId, setActiveLogId] = useState<string | undefined>(undefined)

  const { data: activeLog } = useDfeSyncStatus(activeLogId)
  const processedLogId = useRef<string | undefined>(undefined)

  // Sync the interval selector once the persisted config loads
  useEffect(() => {
    if (syncConfig) setIntervalMinutes(String(syncConfig.intervalMinutes))
  }, [syncConfig])

  // ✅ Toast + invalidation só em useEffect, nunca durante o render (mesmo padrão do ImportPage)
  useEffect(() => {
    if (!activeLog) return
    if (activeLog.status === 'PROCESSING') return
    if (processedLogId.current === activeLog.id) return
    processedLogId.current = activeLog.id

    if (activeLog.status === 'COMPLETED') {
      toast.success('Sincronização concluída', activeLog.message || `${activeLog.docsFound} documento(s) baixado(s)`)
    } else {
      toast.error('Sincronização falhou', activeLog.message || 'Verifique o certificado e tente novamente')
    }

    queryClient.invalidateQueries({ queryKey: ['nfes'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    queryClient.invalidateQueries({ queryKey: ['company-certificate', companyId] })
    queryClient.invalidateQueries({ queryKey: ['dfe-sync-history', companyId] })
  }, [activeLog, queryClient, companyId])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      toast.warning('Arquivo obrigatório', 'Selecione o arquivo .pfx ou .p12 do certificado')
      return
    }
    if (!password) {
      toast.warning('Senha obrigatória', 'Informe a senha do certificado digital')
      return
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('password', password)

    try {
      await uploadMutation.mutateAsync(formData)
      toast.success('Certificado salvo', 'O certificado digital foi validado e armazenado com segurança')
      setFile(null)
      setPassword('')
    } catch (err: any) {
      toast.error('Erro ao salvar certificado', err?.response?.data?.error || 'Verifique o arquivo e a senha informados')
    }
  }

  async function handleDelete() {
    if (!confirm('Remover o certificado digital desta empresa? A sincronização automática será desativada.')) return
    try {
      await deleteMutation.mutateAsync()
      toast.info('Certificado removido', 'A empresa não possui mais um certificado configurado')
    } catch {
      toast.error('Erro', 'Não foi possível remover o certificado')
    }
  }

  async function handleToggleAutoSync() {
    const enabling = !syncConfig?.enabled
    try {
      await configMutation.mutateAsync({ enabled: enabling, intervalMinutes: parseInt(intervalMinutes, 10) })
      toast.success(
        enabling ? 'Sincronização automática ativada' : 'Sincronização automática desativada',
        enabling ? `O sistema buscará novas notas periodicamente` : 'As buscas automáticas foram interrompidas'
      )
    } catch (err: any) {
      toast.error('Erro', err?.response?.data?.error || 'Não foi possível atualizar a configuração')
    }
  }

  async function handleIntervalChange(value: string) {
    setIntervalMinutes(value)
    if (syncConfig?.enabled) {
      try {
        await configMutation.mutateAsync({ enabled: true, intervalMinutes: parseInt(value, 10) })
      } catch {
        // silencioso — o seletor já refletiu a escolha; o usuário pode tentar de novo
      }
    }
  }

  async function handleTriggerSync() {
    try {
      const result = await triggerMutation.mutateAsync()
      setActiveLogId(result.logId)
      processedLogId.current = undefined
      toast.info('Sincronização iniciada', 'Buscando novos documentos na SEFAZ...')
    } catch (err: any) {
      toast.error('Não foi possível iniciar', err?.response?.data?.error || 'Tente novamente em instantes')
    }
  }

  const isSyncing = activeLog?.status === 'PROCESSING' || (!!activeLogId && !activeLog)

  if (loadingCert) {
    return <p className="text-sm text-gray-400 py-8 text-center">Carregando…</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Configure o certificado digital A1 (e-CNPJ) da empresa para que o sistema baixe automaticamente as notas
        fiscais emitidas diretamente da SEFAZ, via Distribuição DFe — sem upload manual.
      </p>

      {/* Status do certificado */}
      <div
        className={cn(
          'rounded-lg border p-3 space-y-2',
          !certificate
            ? 'border-gray-200 bg-gray-50'
            : certificate.expired || !certificate.active
              ? 'border-red-200 bg-red-50/40'
              : 'border-green-200 bg-green-50/40'
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            {!certificate ? (
              <>
                <ShieldX className="h-4 w-4 text-gray-400" />
                Nenhum certificado configurado
              </>
            ) : certificate.expired ? (
              <>
                <ShieldAlert className="h-4 w-4 text-red-500" />
                Certificado expirado
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4 text-green-600" />
                Certificado ativo
              </>
            )}
          </div>
          {certificate && isAdmin && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="h-7 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {certificate && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
            <span>CNPJ: <strong className="text-gray-800">{formatCNPJ(certificate.cnpj)}</strong></span>
            <span>
              Validade:{' '}
              <strong className={cn(certificate.expired ? 'text-red-600' : 'text-gray-800')}>
                {formatDateTime(certificate.validUntil)}
              </strong>
            </span>
            <span>Última sincronização: <strong className="text-gray-800">{certificate.lastSyncAt ? formatDateTime(certificate.lastSyncAt) : 'nunca'}</strong></span>
            <span>NSU atual: <strong className="text-gray-800 font-mono">{certificate.lastNsu}</strong></span>
          </div>
        )}
      </div>

      {/* Upload / substituição (admin) */}
      {isAdmin && (
        <form onSubmit={handleUpload} className="space-y-2 rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-medium text-gray-700">
            {certificate ? 'Substituir certificado digital' : 'Enviar certificado digital (.pfx / .p12)'}
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              type="file"
              accept=".pfx,.p12"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-xs file:mr-2 file:rounded-md file:border-0 file:bg-primary-50 file:px-2 file:py-1 file:text-xs file:font-medium file:text-primary-700"
            />
            <Input
              type="password"
              placeholder="Senha do certificado"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="sm:max-w-[200px]"
            />
            <Button type="submit" size="sm" disabled={uploadMutation.isPending} className="gap-1.5 shrink-0">
              {uploadMutation.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {certificate ? 'Substituir' : 'Validar e salvar'}
            </Button>
          </div>
          <p className="text-[10px] text-gray-400">
            O arquivo é validado, criptografado (AES-256) e armazenado com segurança. A senha nunca é exibida novamente.
          </p>
        </form>
      )}

      {/* Sincronização automática */}
      {certificate && !certificate.expired && (
        <div className="space-y-2 rounded-lg border border-gray-200 p-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  syncConfig?.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
                )}
              />
              <p className="text-xs font-medium text-gray-700">
                Busca automática de notas {syncConfig?.enabled ? 'ativada' : 'desativada'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={intervalMinutes} onValueChange={handleIntervalChange}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAdmin && (
                <Button
                  type="button"
                  size="sm"
                  variant={syncConfig?.enabled ? 'outline' : 'default'}
                  onClick={handleToggleAutoSync}
                  disabled={configMutation.isPending}
                  className={cn('h-8 text-xs', syncConfig?.enabled && 'border-red-200 text-red-600 hover:bg-red-50')}
                >
                  {syncConfig?.enabled ? 'Desativar' : 'Ativar'}
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-[10px] text-gray-400">
              Busca incremental por NSU — respeita o limite de consultas da SEFAZ.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleTriggerSync}
              disabled={isSyncing || triggerMutation.isPending}
              className="gap-1.5 h-8 text-xs"
            >
              {isSyncing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {isSyncing ? 'Sincronizando…' : 'Sincronizar agora'}
            </Button>
          </div>
        </div>
      )}

      {/* Histórico de sincronizações */}
      {certificate && history && history.logs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-700">Histórico recente</p>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {history.logs.map((log) => {
              const badge = STATUS_BADGE[log.status]
              const Icon = badge.icon
              return (
                <div key={log.id} className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-white px-2.5 py-1.5 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant={badge.variant} className="gap-1 shrink-0">
                      <Icon className={cn('h-3 w-3', log.status === 'PROCESSING' && 'animate-spin')} />
                      {badge.label}
                    </Badge>
                    <span className="text-gray-500 truncate">{log.message || `${log.docsFound} documento(s)`}</span>
                  </div>
                  <span className="text-gray-400 shrink-0">{formatDateTime(log.createdAt)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
