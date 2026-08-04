import { useState } from 'react'
import { FolderOpen, Play, Square, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useWatcherStatus, useStartWatcher, useStopWatcher } from '@/hooks/useWatcher'
import { useCompanies } from '@/hooks/useCompanies'
import { toast } from '@/components/ui/toast'
import { cn, formatCNPJ, formatDateTime } from '@/lib/utils'

export default function WatchFolder() {
  const { data: status, isLoading } = useWatcherStatus()
  const { mutateAsync: start, isPending: starting } = useStartWatcher()
  const { mutateAsync: stop, isPending: stopping } = useStopWatcher()
  const { data: companies = [] } = useCompanies()

  const [folderPath, setFolderPath] = useState(status?.config?.folderPath || '')
  const [companyId, setCompanyId] = useState(status?.config?.companyId || 'auto')

  // Sync folderPath with loaded config
  if (status?.config?.folderPath && !folderPath) {
    setFolderPath(status.config.folderPath)
  }

  async function handleStart() {
    const path = folderPath.trim()
    if (!path) {
      toast.warning('Caminho obrigatório', 'Informe o caminho da pasta a monitorar')
      return
    }
    try {
      await start({ folderPath: path, companyId: companyId || 'auto' })
      toast.success('Monitoramento iniciado', `Pasta: ${path}`)
    } catch {
      toast.error('Erro', 'Não foi possível iniciar o monitoramento')
    }
  }

  async function handleStop() {
    try {
      await stop()
      toast.info('Monitoramento parado', 'A pasta não está mais sendo monitorada')
    } catch {
      toast.error('Erro', 'Não foi possível parar o monitoramento')
    }
  }

  const isRunning = status?.running ?? false

  return (
    <Card className={cn('border', isRunning ? 'border-green-200 bg-green-50/30' : 'border-gray-200')}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-amber-500" />
          Monitoramento de Pasta
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
          Aponte para uma pasta e o sistema detectará automaticamente novos arquivos <strong>.xml</strong>, <strong>.zip</strong> e <strong>.rar</strong> e os importará sem precisar clicar no botão.
        </p>

        {/* Folder path input */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">Caminho da pasta</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={folderPath}
              onChange={e => setFolderPath(e.target.value)}
              disabled={isRunning}
              placeholder="/Users/seu-usuario/Downloads/nfe-xmls"
              className={cn(
                'flex-1 h-9 px-3 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500 font-mono',
                isRunning ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'border-gray-300 bg-white'
              )}
            />
          </div>
          <p className="text-[10px] text-gray-400">
            Cole o caminho completo da pasta. Ex: <code className="bg-gray-100 px-1 rounded">/Users/joao/Documents/XMLs-NF-e</code>
          </p>
        </div>

        {/* Company selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-700">Empresa</label>
          <Select value={companyId} onValueChange={setCompanyId} disabled={isRunning}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Detectar automaticamente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Detectar automaticamente pelo CNPJ</SelectItem>
              {companies.filter(c => c.active).map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {formatCNPJ(c.cnpj)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status info */}
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

        {/* Last activity */}
        {status?.config?.lastActivity && (
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-500" />
            Última atividade: {formatDateTime(status.config.lastActivity)}
          </p>
        )}

        {/* Errors */}
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

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {!isRunning ? (
            <Button onClick={handleStart} disabled={starting || !folderPath.trim()} className="gap-1.5 flex-1" size="sm">
              {starting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Iniciar monitoramento
            </Button>
          ) : (
            <Button onClick={handleStop} disabled={stopping} variant="outline" className="gap-1.5 flex-1 border-red-200 text-red-600 hover:bg-red-50" size="sm">
              {stopping ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
              Parar monitoramento
            </Button>
          )}
        </div>

        <p className="text-[10px] text-gray-400">
          💡 O monitoramento persiste entre sessões — a pasta será verificada automaticamente ao reiniciar o servidor.
        </p>
      </CardContent>
    </Card>
  )
}
