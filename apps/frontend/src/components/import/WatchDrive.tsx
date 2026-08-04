import { useState } from 'react'
import { Cloud, Play, Square, RefreshCw, CheckCircle, AlertCircle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useDriveWatcherStatus, useStartDriveWatcher, useStopDriveWatcher, useSyncDriveNow } from '@/hooks/useDriveWatcher'
import { useCompanies } from '@/hooks/useCompanies'
import { toast } from '@/components/ui/toast'
import { cn, formatCNPJ, formatDateTime } from '@/lib/utils'

export default function WatchDrive() {
  const { data: status, isLoading } = useDriveWatcherStatus()
  const { mutateAsync: start, isPending: starting } = useStartDriveWatcher()
  const { mutateAsync: stop, isPending: stopping } = useStopDriveWatcher()
  const { mutateAsync: syncNow, isPending: syncing } = useSyncDriveNow()
  const { data: companies = [] } = useCompanies()

  const [rootFolderId, setRootFolderId] = useState(status?.config?.rootFolderId || '')
  const [companyId, setCompanyId] = useState(status?.config?.companyId || 'auto')

  if (status?.config?.rootFolderId && !rootFolderId) {
    setRootFolderId(status.config.rootFolderId)
  }

  async function handleStart() {
    const id = rootFolderId.trim()
    try {
      // Se o campo ficar vazio, o backend usa GOOGLE_DRIVE_ROOT_FOLDER_ID do .env como padrão.
      await start({ rootFolderId: id, companyId: companyId || 'auto' })
      toast.success('Monitoramento do Drive iniciado', id ? `Pasta: ${id}` : 'Usando pasta padrão do .env')
    } catch (err) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error('Erro', message || 'Não foi possível iniciar o monitoramento do Drive')
    }
  }

  async function handleStop() {
    try {
      await stop()
      toast.info('Monitoramento parado', 'A pasta do Drive não está mais sendo monitorada')
    } catch {
      toast.error('Erro', 'Não foi possível parar o monitoramento')
    }
  }

  async function handleSyncNow() {
    try {
      await syncNow()
      toast.info('Sincronização iniciada', 'Verificando novos arquivos no Drive agora')
    } catch {
      toast.error('Erro', 'Não foi possível iniciar a sincronização')
    }
  }

  const isRunning = status?.running ?? false

  return (
    <Card className={cn('border', isRunning ? 'border-green-200 bg-green-50/30' : 'border-gray-200')}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Cloud className="h-4 w-4 text-blue-500" />
          Google Drive
          {isRunning && (
            <span className="ml-1 flex items-center gap-1 text-xs font-medium text-green-600">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              Ativo
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-gray-500">
          Captura automática de XMLs direto da pasta do Google Drive (mesma estrutura do dashboard antigo: uma subpasta por cliente). Verifica novos arquivos a cada {status?.config?.intervalMinutes ?? 15} minutos.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">ID da pasta raiz no Drive</label>
          <input
            type="text"
            value={rootFolderId}
            onChange={(e) => setRootFolderId(e.target.value)}
            disabled={isRunning}
            placeholder="1NFNXvOHZGfotWZzeEwpz10MLUhbhiHAe"
            className={cn(
              'w-full h-9 px-3 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 font-mono',
              isRunning ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'border-gray-300 bg-white'
            )}
          />
          <p className="text-[10px] text-gray-400">
            O ID fica no final da URL da pasta no Drive: drive.google.com/drive/folders/<code className="bg-gray-100 px-1 rounded">ID</code>
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">Empresa</label>
          <Select value={companyId} onValueChange={setCompanyId} disabled={isRunning}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Detectar automaticamente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Detectar automaticamente pelo CNPJ</SelectItem>
              {companies.filter((c) => c.active).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {formatCNPJ(c.cnpj)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {status && !isLoading && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white rounded-lg border border-gray-200 p-2">
              <div className="text-lg font-bold text-blue-600">{status.filesDetected}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Detectados</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-2">
              <div className="text-lg font-bold text-green-600">{status.filesProcessed}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Processados</div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-2">
              <div className="text-lg font-bold text-red-600">{status.errors?.length ?? 0}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">Erros</div>
            </div>
          </div>
        )}

        {status?.config?.lastActivity && (
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-500" />
            Última atividade: {formatDateTime(status.config.lastActivity)}
          </p>
        )}

        {status?.errors && status.errors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-md p-2 max-h-24 overflow-y-auto">
            {status.errors.slice(-5).map((e, i) => (
              <p key={i} className="text-[10px] text-red-700 flex gap-1 items-start">
                <AlertCircle className="h-3 w-3 shrink-0 mt-0.5" />
                {e}
              </p>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {!isRunning ? (
            <Button onClick={handleStart} disabled={starting} className="gap-1.5 flex-1" size="sm">
              {starting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Iniciar monitoramento
            </Button>
          ) : (
            <>
              <Button onClick={handleSyncNow} disabled={syncing} variant="outline" size="sm" className="gap-1.5">
                <RotateCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
                Sincronizar agora
              </Button>
              <Button onClick={handleStop} disabled={stopping} variant="outline" className="gap-1.5 flex-1 border-red-200 text-red-600 hover:bg-red-50" size="sm">
                {stopping ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                Parar monitoramento
              </Button>
            </>
          )}
        </div>

        <p className="text-[10px] text-gray-400">
          💡 Requer uma conta de serviço do Google configurada no backend (GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_PATH) com acesso de leitura à pasta. Veja o README.
        </p>
      </CardContent>
    </Card>
  )
}
