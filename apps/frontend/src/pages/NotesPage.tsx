import { useState } from 'react'
import { Search, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import NfeDetailDrawer from '@/components/nfe/NfeDetailDrawer'
import { useNfes } from '@/hooks/useNfes'
import { useFilterStore } from '@/stores/filterStore'
import { formatCurrency, formatCNPJ, formatDate, getStatusColor, getStatusLabel } from '@/lib/utils'

const STATUSES = ['', 'AUTORIZADA', 'CANCELADA', 'DENEGADA', 'INUTILIZADA'] as const
const STATUS_LABELS: Record<string, string> = {
  '': 'Todas',
  AUTORIZADA: 'Autorizadas',
  CANCELADA: 'Canceladas',
  DENEGADA: 'Denegadas',
  INUTILIZADA: 'Inutilizadas',
}

export default function NotesPage() {
  const { selectedCompanyId, selectedCompetencia } = useFilterStore()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [selectedNfeId, setSelectedNfeId] = useState<string | null>(null)

  const { data, isLoading } = useNfes({
    companyId: selectedCompanyId,
    competencia: selectedCompetencia,
    status: status || undefined,
    search: search || undefined,
    page,
    limit: 50,
  })

  const nfes = data?.nfes || []
  const total = data?.total || 0
  const totalPages = data?.totalPages || 1

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Notas Fiscais</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {total.toLocaleString('pt-BR')} notas encontradas
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
          <TabsList className="h-9">
            {STATUSES.map((s) => (
              <TabsTrigger key={s} value={s} className="text-xs px-3 py-1">
                {STATUS_LABELS[s]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por número, emitente..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="h-9 w-full pl-9 pr-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nº / Série</TableHead>
              <TableHead>Mod</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Emitente</TableHead>
              <TableHead>Destinatário</TableHead>
              <TableHead className="text-right">Valor NF-e</TableHead>
              <TableHead className="text-right">ICMS</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : nfes.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12 text-gray-400">
                      Nenhuma nota fiscal encontrada
                    </TableCell>
                  </TableRow>
                )
                : nfes.map((nfe: {
                    id: string
                    nNF: string
                    serie: string
                    mod: number
                    dhEmi: string
                    emitCnpj: string
                    emitNome: string
                    destCnpj?: string
                    destNome?: string
                    vNF: number
                    vICMS: number
                    status: string
                    tpNF: number
                  }) => (
                    <TableRow
                      key={nfe.id}
                      className="cursor-pointer"
                      onClick={() => setSelectedNfeId(nfe.id)}
                    >
                      <TableCell>
                        <span className="font-medium text-gray-900">{nfe.nNF}</span>
                        <span className="text-xs text-gray-400 ml-1">/ {nfe.serie}</span>
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${nfe.mod === 65 ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {nfe.mod === 65 ? 'NFC-e' : 'NF-e'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">
                        {formatDate(nfe.dhEmi)}
                      </TableCell>
                      <TableCell>
                        <p className="text-sm truncate max-w-[140px]">{nfe.emitNome}</p>
                        <p className="text-xs text-gray-400">{formatCNPJ(nfe.emitCnpj)}</p>
                      </TableCell>
                      <TableCell>
                        <p className="text-sm truncate max-w-[140px]">{nfe.destNome || 'Consumidor Final'}</p>
                        {nfe.destCnpj && <p className="text-xs text-gray-400">{formatCNPJ(nfe.destCnpj)}</p>}
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        {formatCurrency(nfe.vNF)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-gray-600">
                        {formatCurrency(nfe.vICMS)}
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(nfe.status)}`}>
                          {getStatusLabel(nfe.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Eye className="h-4 w-4 text-gray-400" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
          </TableBody>
        </Table>

        {/* Pagination */}
        {total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              {((page - 1) * 50) + 1}–{Math.min(page * 50, total)} de {total.toLocaleString('pt-BR')}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-700 px-2">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      <NfeDetailDrawer nfeId={selectedNfeId} onClose={() => setSelectedNfeId(null)} />
    </div>
  )
}
