import { useState } from 'react'
import { createPortal } from 'react-dom'
import {
  FileText, ArrowDownCircle, ArrowUpCircle, XCircle, ShoppingCart, DollarSign,
  Receipt, TrendingUp, AlertTriangle, ListX, X, ChevronDown, ChevronRight, ShieldAlert,
} from 'lucide-react'
import KpiCard from '@/components/dashboard/KpiCard'
import MonthlyTrendChart from '@/components/dashboard/MonthlyTrendChart'
import TaxBreakdownChart from '@/components/dashboard/TaxBreakdownChart'
import ProductsRankingTable from '@/components/dashboard/ProductsRankingTable'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useDashboardSummary,
  useCfopRanking,
  useTopClients,
  useMissingNotes,
  type MissingNotesGroup,
  useSemProtocoloNotes,
  type SemProtocoloGroup,
} from '@/hooks/useDashboard'
import { useFilterStore } from '@/stores/filterStore'
import { formatCurrency, formatCompetencia, formatCNPJ, formatChNFe, formatDateTime } from '@/lib/utils'

export default function DashboardPage() {
  const { selectedCompetencia } = useFilterStore()
  const { data: summary, isLoading } = useDashboardSummary()
  const { data: cfopData = [], isLoading: cfopLoading } = useCfopRanking(8)
  const { data: clients = [], isLoading: clientsLoading } = useTopClients(5)
  const { data: missingData, isLoading: missingLoading } = useMissingNotes()
  const [showMissingModal, setShowMissingModal] = useState(false)
  const { data: semProtocoloData, isLoading: semProtocoloLoading } = useSemProtocoloNotes()
  const [showSemProtocoloModal, setShowSemProtocoloModal] = useState(false)

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard Fiscal</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Competência: {formatCompetencia(selectedCompetencia)}
        </p>
      </div>

      {/* Missing Notes + Sem Protocolo Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MissingNotesCard
          total={missingData?.total ?? 0}
          isLoading={missingLoading}
          onClick={() => setShowMissingModal(true)}
        />
        <SemProtocoloCard
          total={semProtocoloData?.total ?? 0}
          isLoading={semProtocoloLoading}
          onClick={() => setShowSemProtocoloModal(true)}
        />
      </div>

      {/* Missing Notes Modal — rendered via portal so it escapes overflow:hidden */}
      {showMissingModal && createPortal(
        <MissingNotesModal
          groups={missingData?.groups ?? []}
          competencia={selectedCompetencia}
          onClose={() => setShowMissingModal(false)}
        />,
        document.body
      )}

      {/* Sem Protocolo Modal */}
      {showSemProtocoloModal && createPortal(
        <SemProtocoloModal
          groups={semProtocoloData?.groups ?? []}
          competencia={selectedCompetencia}
          onClose={() => setShowSemProtocoloModal(false)}
        />,
        document.body
      )}

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          label="Total NF-e"
          value={summary?.totalNfes ?? 0}
          icon={<FileText className="h-5 w-5 text-primary-700" />}
          iconBg="bg-primary-100"
          isLoading={isLoading}
        />
        <KpiCard
          label="Entradas"
          value={summary?.entradas ?? 0}
          icon={<ArrowDownCircle className="h-5 w-5 text-green-700" />}
          iconBg="bg-green-100"
          isLoading={isLoading}
        />
        <KpiCard
          label="Saídas"
          value={summary?.saidas ?? 0}
          icon={<ArrowUpCircle className="h-5 w-5 text-blue-700" />}
          iconBg="bg-blue-100"
          isLoading={isLoading}
        />
        <KpiCard
          label="NFC-e"
          value={summary?.nfce ?? 0}
          icon={<ShoppingCart className="h-5 w-5 text-purple-700" />}
          iconBg="bg-purple-100"
          isLoading={isLoading}
        />
        <KpiCard
          label="Canceladas"
          value={summary?.canceladas ?? 0}
          icon={<XCircle className="h-5 w-5 text-red-700" />}
          iconBg="bg-red-100"
          isLoading={isLoading}
        />
        <KpiCard
          label="Faturamento"
          value={formatCurrency(summary?.vNF)}
          icon={<DollarSign className="h-5 w-5 text-emerald-700" />}
          iconBg="bg-emerald-100"
          trend={summary?.trend}
          trendLabel="vs mês anterior"
          isLoading={isLoading}
          valueSize="sm"
        />
      </div>

      {/* KPI Row 2 - Tax */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <KpiCard
          label="ICMS Total"
          value={formatCurrency(summary?.vICMS)}
          icon={<Receipt className="h-5 w-5 text-orange-700" />}
          iconBg="bg-orange-100"
          isLoading={isLoading}
          valueSize="sm"
        />
        <KpiCard
          label="ICMS-ST"
          value={formatCurrency(summary?.vICMSST)}
          icon={<Receipt className="h-5 w-5 text-amber-700" />}
          iconBg="bg-amber-100"
          isLoading={isLoading}
          valueSize="sm"
        />
        <KpiCard
          label="PIS + COFINS"
          value={formatCurrency((summary?.vPIS ?? 0) + (summary?.vCOFINS ?? 0))}
          icon={<TrendingUp className="h-5 w-5 text-cyan-700" />}
          iconBg="bg-cyan-100"
          isLoading={isLoading}
          valueSize="sm"
        />
        <KpiCard
          label="Total Impostos"
          value={formatCurrency(summary?.totalImpostos)}
          icon={<AlertTriangle className="h-5 w-5 text-rose-700" />}
          iconBg="bg-rose-100"
          isLoading={isLoading}
          valueSize="sm"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <MonthlyTrendChart />
        </div>
        <TaxBreakdownChart />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <ProductsRankingTable />
        </div>

        <div className="space-y-4">
          {/* CFOP Ranking */}
          <Card>
            <CardHeader>
              <CardTitle>Top CFOPs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {cfopLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : cfopData.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">Nenhum dado</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {cfopData.slice(0, 6).map((item) => (
                    <div key={item.cfop} className="flex items-center justify-between px-5 py-2.5">
                      <div>
                        <span className="text-sm font-bold text-primary-800">{item.cfop}</span>
                        <span className="text-xs text-gray-400 ml-2">{item.count} notas</span>
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        {formatCurrency(item.vProd)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Clients */}
          <Card>
            <CardHeader>
              <CardTitle>Top Clientes</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {clientsLoading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : clients.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">Nenhum dado</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {clients.map((client, i) => (
                    <div key={i} className="px-5 py-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 truncate max-w-[140px]">
                          {client.destNome}
                        </p>
                        <p className="text-sm font-medium text-gray-700 shrink-0">
                          {formatCurrency(client.vNF)}
                        </p>
                      </div>
                      {client.destCnpj && (
                        <p className="text-xs text-gray-400">{formatCNPJ(client.destCnpj)}</p>
                      )}
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

// ─── Missing Notes Card ────────────────────────────────────────────────────────

function MissingNotesCard({
  total,
  isLoading,
  onClick,
}: {
  total: number
  isLoading: boolean
  onClick: () => void
}) {
  if (isLoading) {
    return <Skeleton className="h-16 w-full rounded-xl" />
  }

  const hasGaps = total > 0

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border px-5 py-4 flex items-center gap-4 transition-all hover:shadow-md active:scale-[0.99] ${
        hasGaps
          ? 'bg-red-50 border-red-200 hover:bg-red-100'
          : 'bg-green-50 border-green-200 hover:bg-green-100'
      }`}
    >
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
        hasGaps ? 'bg-red-100' : 'bg-green-100'
      }`}>
        <ListX className={`h-5 w-5 ${hasGaps ? 'text-red-600' : 'text-green-600'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-wide ${hasGaps ? 'text-red-500' : 'text-green-600'}`}>
          Notas Ausentes no Mês
        </p>
        <p className={`text-2xl font-bold leading-tight ${hasGaps ? 'text-red-700' : 'text-green-700'}`}>
          {total}
        </p>
        <p className={`text-xs mt-0.5 ${hasGaps ? 'text-red-400' : 'text-green-500'}`}>
          {hasGaps
            ? `${total} número(s) faltando na sequência · clique para ver`
            : 'Sequência sem lacunas ✓'}
        </p>
      </div>
      {hasGaps && (
        <ChevronRight className="h-5 w-5 text-red-400 shrink-0" />
      )}
    </button>
  )
}

// ─── Missing Notes Modal ───────────────────────────────────────────────────────

function MissingNotesModal({
  groups,
  competencia,
  onClose,
}: {
  groups: MissingNotesGroup[]
  competencia: string
  onClose: () => void
}) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    () => new Set(groups.map((g) => `${g.companyId}|${g.mod}|${g.serie}`))
  )

  function toggleGroup(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const modLabel = (mod: number) => mod === 55 ? 'NF-e' : mod === 65 ? 'NFC-e' : `Mod ${mod}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center">
              <ListX className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Notas Ausentes</h2>
              <p className="text-xs text-gray-500">
                Competência: {formatCompetencia(competencia)} · {groups.reduce((s, g) => s + g.count, 0)} número(s) faltando
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ListX className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma nota ausente neste período</p>
            </div>
          ) : (
            groups.map((group) => {
              const key = `${group.companyId}|${group.mod}|${group.serie}`
              const isOpen = expandedKeys.has(key)
              return (
                <div key={key} className="border border-gray-200 rounded-xl overflow-hidden">
                  {/* Group header */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    onClick={() => toggleGroup(key)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-md">
                        {modLabel(group.mod)} · Série {group.serie}
                      </span>
                      <span className="text-sm font-medium text-gray-800 truncate max-w-[220px]">
                        {group.companyName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                        {group.count} ausente{group.count > 1 ? 's' : ''}
                      </span>
                      {isOpen
                        ? <ChevronDown className="h-4 w-4 text-gray-400" />
                        : <ChevronRight className="h-4 w-4 text-gray-400" />
                      }
                    </div>
                  </button>

                  {/* Gap numbers */}
                  {isOpen && (
                    <div className="px-4 py-3">
                      <p className="text-[11px] text-gray-400 mb-2 font-medium uppercase tracking-wide">
                        Números faltando:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.gaps.map((n) => (
                          <span
                            key={n}
                            className="inline-flex items-center px-2.5 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-mono font-semibold"
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                      {group.gaps.length > 50 && (
                        <p className="text-xs text-gray-400 mt-2">
                          Mostrando todos os {group.gaps.length} números ausentes
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400">
            💡 Notas ausentes podem indicar XMLs não importados, cancelamentos sem evento ou falhas no envio.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Sem Protocolo Card ────────────────────────────────────────────────────────

function SemProtocoloCard({
  total,
  isLoading,
  onClick,
}: {
  total: number
  isLoading: boolean
  onClick: () => void
}) {
  if (isLoading) {
    return <Skeleton className="h-16 w-full rounded-xl" />
  }

  const hasIssues = total > 0

  return (
    <button
      onClick={onClick}
      disabled={!hasIssues}
      className={`w-full text-left rounded-xl border px-5 py-4 flex items-center gap-4 transition-all ${
        hasIssues
          ? 'bg-amber-50 border-amber-200 hover:bg-amber-100 hover:shadow-md active:scale-[0.99]'
          : 'bg-green-50 border-green-200'
      }`}
    >
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
        hasIssues ? 'bg-amber-100' : 'bg-green-100'
      }`}>
        <ShieldAlert className={`h-5 w-5 ${hasIssues ? 'text-amber-600' : 'text-green-600'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-semibold uppercase tracking-wide ${hasIssues ? 'text-amber-600' : 'text-green-600'}`}>
          Notas Sem Protocolo SEFAZ
        </p>
        <p className={`text-2xl font-bold leading-tight ${hasIssues ? 'text-amber-700' : 'text-green-700'}`}>
          {total}
        </p>
        <p className={`text-xs mt-0.5 ${hasIssues ? 'text-amber-500' : 'text-green-500'}`}>
          {hasIssues
            ? `${total} nota(s) sem confirmação da SEFAZ · clique para ver`
            : 'Todas as notas têm protocolo ✓'}
        </p>
      </div>
      {hasIssues && (
        <ChevronRight className="h-5 w-5 text-amber-400 shrink-0" />
      )}
    </button>
  )
}

// ─── Sem Protocolo Modal ───────────────────────────────────────────────────────

function SemProtocoloModal({
  groups,
  competencia,
  onClose,
}: {
  groups: SemProtocoloGroup[]
  competencia: string
  onClose: () => void
}) {
  const modLabel = (mod: number) => mod === 55 ? 'NF-e' : mod === 65 ? 'NFC-e' : `Mod ${mod}`
  const total = groups.reduce((s, g) => s + g.notes.length, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Notas Sem Protocolo SEFAZ</h2>
              <p className="text-xs text-gray-500">
                Competência: {formatCompetencia(competencia)} · {total} nota(s)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {groups.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ShieldAlert className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma nota sem protocolo neste período</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.companyId} className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                  <span className="text-sm font-medium text-gray-800 truncate max-w-[220px]">
                    {group.companyName}
                  </span>
                  <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                    {group.notes.length} nota{group.notes.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {group.notes.map((n) => (
                    <div key={n.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">
                          {modLabel(n.mod)} {n.nNF}/{n.serie}
                        </p>
                        <p className="text-[11px] text-gray-400 font-mono truncate">{formatChNFe(n.chNFe)}</p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">{formatDateTime(n.dhEmi)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <p className="text-xs text-gray-400">
            💡 O XML importado é só o documento assinado pelo emitente, sem o protocolo de autorização da SEFAZ (sem cStat/nProt). Procure o arquivo correto (nfeProc/procNFe) ou confira a situação direto no site da SEFAZ.
          </p>
        </div>
      </div>
    </div>
  )
}
