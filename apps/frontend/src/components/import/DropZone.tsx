import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, Archive, FileText, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DroppedFile {
  file: File
  status: 'pending' | 'uploading' | 'success' | 'error' | 'duplicate'
  error?: string
}

interface DropZoneProps {
  files: DroppedFile[]
  onFilesAdded: (files: File[]) => void
  onRemoveFile: (index: number) => void
  disabled?: boolean
}

const statusColors: Record<DroppedFile['status'], string> = {
  pending: 'text-gray-500 bg-gray-50',
  uploading: 'text-blue-500 bg-blue-50',
  success: 'text-green-600 bg-green-50',
  error: 'text-red-600 bg-red-50',
  duplicate: 'text-orange-500 bg-orange-50',
}

const statusLabels: Record<DroppedFile['status'], string> = {
  pending: 'Pendente',
  uploading: 'Enviando...',
  success: 'Importado',
  error: 'Erro',
  duplicate: 'Duplicado',
}

function FileIcon({ name }: { name: string }) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.zip')) return <Archive className="h-4 w-4 shrink-0 text-amber-500" />
  if (lower.endsWith('.rar')) return <Archive className="h-4 w-4 shrink-0 text-red-500" />
  return <FileText className="h-4 w-4 shrink-0 text-blue-400" />
}

export default function DropZone({ files, onFilesAdded, onRemoveFile, disabled }: DropZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const valid = acceptedFiles.filter((f) => {
        const name = f.name.toLowerCase()
        return name.endsWith('.xml') || name.endsWith('.zip') || name.endsWith('.rar')
      })
      if (valid.length > 0) onFilesAdded(valid)
    },
    [onFilesAdded]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/xml': ['.xml'],
      'text/xml': ['.xml'],
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip'],
      'application/vnd.rar': ['.rar'],
      'application/x-rar-compressed': ['.rar'],
    },
    disabled,
    multiple: true,
  })

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
          isDragActive
            ? 'border-primary-500 bg-primary-50'
            : disabled
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
              : 'border-gray-300 bg-white hover:border-primary-400 hover:bg-gray-50'
        )}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              'h-14 w-14 rounded-full flex items-center justify-center transition-colors',
              isDragActive ? 'bg-primary-100' : 'bg-gray-100'
            )}
          >
            <Upload className={cn('h-6 w-6', isDragActive ? 'text-primary-600' : 'text-gray-400')} />
          </div>

          {isDragActive ? (
            <p className="text-base font-semibold text-primary-700">Solte os arquivos aqui!</p>
          ) : (
            <div>
              <p className="text-base font-semibold text-gray-700">
                Arraste arquivos aqui ou{' '}
                <span className="text-primary-700 underline">clique para selecionar</span>
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Aceita <strong>.xml</strong>, <strong>.zip</strong> e <strong>.rar</strong> de NF-e e NFC-e · Múltiplos arquivos
              </p>
              <div className="flex items-center justify-center gap-3 mt-3">
                <span className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-600 font-mono">.xml</span>
                <span className="text-xs px-2 py-0.5 rounded bg-amber-50 text-amber-600 font-mono">.zip</span>
                <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 font-mono">.rar</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {files.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 flex items-center justify-between border-b border-gray-200">
            <span className="text-sm font-medium text-gray-700">
              {files.length} arquivo{files.length !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-3 text-xs text-gray-500">
              <span className="text-green-600">
                {files.filter((f) => f.status === 'success').length} importados
              </span>
              <span className="text-orange-500">
                {files.filter((f) => f.status === 'duplicate').length} duplicados
              </span>
              <span className="text-red-600">
                {files.filter((f) => f.status === 'error').length} erros
              </span>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {files.map((f, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50">
                <FileIcon name={f.file.name} />
                <p className="text-sm text-gray-700 flex-1 truncate">{f.file.name}</p>
                <span
                  className={cn(
                    'text-xs px-2 py-0.5 rounded-full font-medium shrink-0',
                    statusColors[f.status]
                  )}
                >
                  {statusLabels[f.status]}
                </span>
                {f.error && (
                  <span className="text-xs text-red-500 truncate max-w-[120px]" title={f.error}>
                    {f.error}
                  </span>
                )}
                {f.status === 'pending' && (
                  <button onClick={() => onRemoveFile(index)} className="p-1 hover:bg-gray-200 rounded">
                    <X className="h-3.5 w-3.5 text-gray-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
