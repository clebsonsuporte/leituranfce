import { useState, useCallback, useEffect, useRef } from 'react'
import { Upload, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import DropZone from '@/components/import/DropZone'
import WatchFolder from '@/components/import/WatchFolder'
import WatchDrive from '@/components/import/WatchDrive'
import { useImport, useImportStatus, useImportLogs } from '@/hooks/useNfes'
import { useCompanies } from '@/hooks/useCompanies'
import { toast } from '@/components/ui/toast'
import { formatDateTime, formatCNPJ } from '@/lib/utils'

interface DroppedFile {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error' | 'duplicate'
  error?: string
}

export default function ImportPage() {
  const [files, setFiles] = useState<DroppedFile[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('auto')
  const [currentLogId, setCurrentLogId] = useState<string | undefined>()
  const [isImporting, setIsImporting] = useState(false)

  const { data: companies = [] } = useCompanies()
  const { mutateAsync: importFiles } = useImport()
  const { data: importLog } = useImportStatus(currentLogId)
  const { data: logsData, refetch: refetchLogs } = useImportLogs()

  // Track which log IDs we've already processed to avoid toast duplicates
  const processedLogId = useRef<string | undefined>(undefined)

  // ✅ Correto: atualiza estado e dispara toast SOMENTE via useEffect, nunca no render
  useEffect(() => {
    if (!importLog) return
    if (importLog.status !== 'COMPLETED' && importLog.status !== 'FAILED') return
    if (processedLogId.current === importLog.id) return   // já processado, evitar duplicata

    processedLogId.current = importLog.id

    const details = (importLog.details || []) as Array<{
      filename: string
      status: string
      error?: string
    }>

    setFiles((prev) => {
      const hasUploading = prev.some((f) => f.status === 'uploading')
      if (!hasUploading) return prev
      return prev.map((f) => {
        if (f.status !== 'uploading') return f
        const detail = details.find((d) => d.filename === f.file.name)
        if (!detail) return { ...f, status: 'error' as const, error: 'Sem retorno do servidor' }
        if (detail.status === 'success' || detail.status === 'event_applied') {
          return { ...f, status: 'success' as const }
        } else if (detail.status === 'duplicate') {
          return { ...f, status: 'duplicate' as const }
        } else if (detail.status === 'error') {
          return { ...f, status: 'error' as const, error: detail.error }
        }
        return f
      })
    })

    refetchLogs()

    if (importLog.status === 'COMPLETED') {
      toast.success(
        'Importação concluída',
        `${importLog.success} importados · ${importLog.duplicates} duplicados · ${importLog.errors} erros`
      )
    } else {
      toast.error('Importação falhou', 'Verifique os arquivos e tente novamente')
    }
  }, [importLog?.id, importLog?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilesAdded = useCallback((newFiles: File[]) => {
    setFiles((prev) => [
      ...prev,
      ...newFiles.map((f) => ({ file: f, status: 'pending' as const })),
    ])
  }, [])

  const handleRemoveFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  async function handleImport() {
    const pendingFiles = files.filter((f) => f.status === 'pending')
    if (pendingFiles.length === 0) {
      toast.warning('Nenhum arquivo pendente', 'Adicione arquivos XML para importar')
      return
    }

    setIsImporting(true)

    // Set all files to uploading
    setFiles((prev) =>
      prev.map((f) => (f.status === 'pending' ? { ...f, status: 'uploading' } : f))
    )

    try {
      const formData = new FormData()
      if (selectedCompanyId && selectedCompanyId !== 'auto') {
        formData.append('companyId', selectedCompanyId)
      }
      for (const f of pendingFiles) {
        formData.append('files', f.file)
      }

      const result = await importFiles(formData)
      setCurrentLogId(result.logId)
      toast.info('Importação iniciada', `${pendingFiles.length} arquivo(s) sendo processados`)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } }
      toast.error('Erro na importação', error.response?.data?.error || 'Tente novamente')
      setFiles((prev) =>
        prev.map((f) => (f.status === 'uploading' ? { ...f, status: 'error' } : f))
      )
    } finally {
      setIsImporting(false)
    }
  }

  const pendingCount = files.filter((f) => f.status === 'pending').length
  const isProcessing = importLog?.status === 'PROCESSING'
  const progress =
    importLog && importLog.totalFiles > 0
      ? Math.round((importLog.processed / importLog.totalFiles) * 100)
      : 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Importar XML</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Importe XMLs de NF-e e NFC-e autorizados ou cancelados
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-4">

          {/* Company selector */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-700 shrink-0">Empresa:</label>
                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="Detectar automaticamente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Detectar automaticamente</SelectItem>
                    {companies.filter((c) => c.active).map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name} · {formatCNPJ(company.cnpj)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Drop zone */}
          <Card>
            <CardContent className="p-5">
              <DropZone
                files={files}
                onFilesAdded={handleFilesAdded}
                onRemoveFile={handleRemoveFile}
                disabled={isImporting || isProcessing}
              />
            </CardContent>
          </Card>

          {/* Progress */}
          {isProcessing && importLog && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />
                  <p className="text-sm font-medium text-blue-800">
                    Processando... {importLog.processed}/{importLog.totalFiles}
                  </p>
                </div>
                <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action button */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setFiles([])}
              disabled={files.length === 0 || isImporting || isProcessing}
            >
              Limpar lista
            </Button>
            <Button
              onClick={handleImport}
              disabled={pendingCount === 0 || isImporting || isProcessing}
              className="gap-2 min-w-32"
            >
              {isImporting || isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Importar {pendingCount > 0 ? `(${pendingCount})` : ''}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Right panel: Watch folder + Import log */}
        <div className="space-y-4">
          <WatchDrive />
          <WatchFolder />
          <Card>
            <CardHeader>
              <CardTitle>Importações Recentes</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!logsData?.logs?.length ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  Nenhuma importação ainda
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                  {logsData.logs.map((log: {
                    id: string
                    filename: string
                    totalFiles: number
                    success: number
                    duplicates: number
                    errors: number
                    status: string
                    createdAt: string
                    company: { name: string }
                  }) => (
                    <div key={log.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">
                          {log.filename}
                        </p>
                        <LogStatusBadge status={log.status} />
                      </div>
                      <p className="text-xs text-gray-400 mb-1">{log.company?.name}</p>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-green-600">{log.success} ok</span>
                        <span className="text-orange-500">{log.duplicates} dup</span>
                        <span className="text-red-600">{log.errors} err</span>
                      </div>
                      <p className="text-xs text-gray-300 mt-1">
                        {formatDateTime(log.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function LogStatusBadge({ status }: { status: string }) {
  if (status === 'COMPLETED') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
        <CheckCircle className="h-3.5 w-3.5" /> Concluído
      </span>
    )
  }
  if (status === 'PROCESSING') {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
        <Clock className="h-3.5 w-3.5 animate-pulse" /> Processando
      </span>
    )
  }
  return (
    <span className="text-xs text-red-600 font-medium">Falha</span>
  )
}
