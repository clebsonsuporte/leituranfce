import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Shield, AlertTriangle, XCircle, CheckCircle2, HelpCircle, Download, RefreshCw, Loader2, Printer, ChevronDown } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import KpiCard from '@/components/dashboard/KpiCard'
import PisCofinsCfopCard from '@/components/audit/PisCofinsCfopCard'
import ReformaPendenteCard from '@/components/audit/ReformaPendenteCard'
import api from '@/lib/api'
import { useFilterStore } from '@/stores/filterStore'
import { useCompanies } from '@/hooks/useCompanies'
import {
  cfopValidationKey,
  usePisCofinsCfop,
  useReformaPendentes,
  type AuditItem,
  type AuditSummary,
  type CfopValidationResult,
} from '@/hooks/useAudit'
import { printAuditReport, type PrintEscopo } from '@/lib/printAuditReport'
import { formatCurrency } from '@/lib/utils'

type FilterType = 'todos' | 'alto' | 'medio' | 'ok' | 'nao_validado' | 'pis_cofins'

const REGIME_BADGE = {
  normal: { label: 'Normal', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  st: { label: 'Subst. Tributária', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  monofasico: { label: 'Monofásico', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
}

const RISCO_CONFIG = {
  alto: { label: 'Alto Risco', color: 'text-red-700', bg: 'bg-red-50 border-red-200', dot: 'bg-red-500' },
  medio: { label: 'Atenção', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', dot: 'bg-amber-400' },
  ok: { label: 'OK', color: 'text-green-700', bg: 'bg-green-50 border-green-200', dot: 'bg-green-500' },
  nao_validado: { label: 'Não validado', color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-300' },
}

function RiscoBadge({ risco }: { risco: AuditItem['risco'] }) {
  const cfg = RISCO_CONFIG[risco]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function NcmStatusIcon({ status }: { status: AuditItem['ncmStatus'] }) {
  if (!status) return <HelpCircle className="h-4 w-4 text-gray-300" />
  if (status === 'compativel') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'incompativel') return <XCircle className="h-4 w-4 text-red-500" />
  return <HelpCircle className="h-4 w-4 text-amber-400" />
}

function CfopStatusIcon({ status }: { status: AuditItem['cfopStatus'] }) {
  if (status === 'ok') return <CheckCircle2 className="h-4 w-4 text-green-500" />
  if (status === 'erro') return <XCircle className="h-4 w-4 text-red-500" />
  return <AlertTriangle className="h-4 w-4 text-amber-400" />
}

export default function AuditPage() {
  const { selectedCompanyId, selectedCompetencia } = useFilterStore()
  const [filter, setFilter] = useState<FilterType>('todos')
  const [printOpen, setPrintOpen] = useState(false)
  const { data: companies } = useCompanies()
  const pisCofins = usePisCofinsCfop(selectedCompanyId, selectedCompetencia)
  const reforma = useReformaPendentes(selectedCompanyId, selectedCompetencia)

  const params = new URLSearchParams()
  if (selectedCompanyId) params.set('companyId', selectedCompanyId)
  if (selectedCompetencia) params.set('competencia', selectedCompetencia)

  const [cfopValidations, setCfopValidations] = useState<Record<string, CfopValidationResult>>({})

  const cfopMutation = useMutation({
    mutationFn: async ({ items, forceRevalidate }: { items: Array<{ xProd: string; ncm: string; cfop: string; tpNF: number; ncmDesc?: string }>; forceRevalidate?: boolean }) => {
      const { data } = await api.post('/tax/cfop/validate-items', { items, forceRevalidate })
      return data as Record<string, CfopValidationResult>
    },
    onSuccess: (data) => setCfopValidations(prev => ({ ...prev, ...data })),
  })

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['audit', selectedCompanyId, selectedCompetencia],
    queryFn: async () => {
      const { data } = await api.get(`/tax/audit?${params}`)
      return data as { items: AuditItem[]; summary: AuditSummary; truncated: boolean }
    },
  })

  const items = data?.items ?? []
  const summary = data?.summary
  const filtered = filter === 'todos' ? items
    : filter === 'pis_cofins' ? items.filter(i => i.pisCofins.divergencia)
    : items.filter(i => i.risco === filter)

  function refreshAll() {
    refetch()
    pisCofins.refetch()
    reforma.refetch()
  }

  function print(escopo: PrintEscopo) {
    setPrintOpen(false)
    const company = companies?.find(c => c.id === selectedCompanyId)
    printAuditReport({
      escopo,
      empresa: company ? { name: company.name, cnpj: company.cnpj } : null,
      competencia: selectedCompetencia,
      items: filtered,
      cfopValidations,
      pisCofins: pisCofins.data,
      reforma: reforma.data,
    })
  }

  function exportCsv() {
    const header = ['Produto', 'NCM Atual', 'NCM Status', 'NCM Sugerido', 'CFOP', 'CFOP Status', 'CFOP Descrição', 'PIS/COFINS (lei)', 'CST PIS nota', 'PIS/COFINS divergência', 'Nº Notas', 'Valor Total', 'Risco']
    const rows = filtered.map(i => [
      `"${i.xProd}"`,
      i.ncm ?? '',
      i.ncmStatus ?? 'não validado',
      i.ncmSugerido ?? '',
      i.cfop,
      i.cfopStatus,
      `"${i.cfopMotivo}"`,
      REGIME_BADGE[i.pisCofins.regime].label,
      i.cstPis ?? '',
      `"${i.pisCofins.divergencia?.mensagem ?? ''}"`,
      i.count,
      i.vTotal.toFixed(2),
      i.risco,
    ])
    const csv = [header, ...rows].map(r => r.join(';')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `auditoria-tributaria-${selectedCompetencia ?? 'geral'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const pctCompliance = summary && summary.total > 0
    ? Math.round((summary.ok / summary.total) * 100)
    : 0

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Auditoria Tributária</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Diagnóstico de NCM e CFOP — identifica erros de classificação fiscal
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refreshAll}
            disabled={isFetching}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            onClick={() => {
              const toValidate = items
                .filter(i => i.ncm && i.cfop)
                .map(i => ({ xProd: i.xProd, ncm: i.ncm!, cfop: i.cfop, tpNF: i.tpNF, ncmDesc: i.ncmDesc ?? undefined }))
              cfopMutation.mutate({ items: toValidate })
            }}
            disabled={!data || cfopMutation.isPending || items.length === 0}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-purple-300 bg-purple-50 text-purple-800 text-sm font-medium hover:bg-purple-100 disabled:opacity-50"
          >
            {cfopMutation.isPending
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Validando CFOP...</>
              : '🧾 Validar CFOP com IA'}
          </button>
          <button
            onClick={() => {
              const toValidate = items
                .filter(i => i.ncm && i.cfop)
                .map(i => ({ xProd: i.xProd, ncm: i.ncm!, cfop: i.cfop, tpNF: i.tpNF, ncmDesc: i.ncmDesc ?? undefined }))
              cfopMutation.mutate({ items: toValidate, forceRevalidate: true })
            }}
            disabled={!data || cfopMutation.isPending || items.length === 0}
            title="Ignora o cache e reconsulta a IA com o prompt atualizado"
            className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-purple-200 bg-white text-purple-700 text-sm hover:bg-purple-50 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Revalidar CFOP
          </button>
          <div className="relative">
            <button
              onClick={() => setPrintOpen(o => !o)}
              disabled={!data}
              className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {printOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPrintOpen(false)} />
                <div className="absolute right-0 mt-1 w-72 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm">
                  <PrintOption
                    titulo="Itens com NCM"
                    desc={`Os ${filtered.length} produto(s) do filtro atual, com NCM, CFOP e PIS/COFINS`}
                    onClick={() => print('itens')}
                  />
                  <PrintOption
                    titulo="Somente pendências"
                    desc="Itens em alto risco ou atenção, com a segregação por CFOP"
                    onClick={() => print('pendencias')}
                  />
                  <PrintOption
                    titulo="PIS/COFINS por CFOP"
                    desc="Tabela Normal / ST / Monofásico e produtos divergentes"
                    onClick={() => print('pis-cofins')}
                  />
                </div>
              </>
            )}
          </div>
          <button
            onClick={exportCsv}
            disabled={!data}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-primary-300 bg-primary-50 text-primary-800 text-sm font-medium hover:bg-primary-100 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Produtos"
          value={summary?.total ?? 0}
          icon={<Shield className="h-5 w-5 text-primary-700" />}
          iconBg="bg-primary-100"
          isLoading={isLoading}
        />
        <KpiCard
          label="Alto Risco"
          value={summary?.alto ?? 0}
          icon={<XCircle className="h-5 w-5 text-red-600" />}
          iconBg="bg-red-100"
          isLoading={isLoading}
        />
        <KpiCard
          label="Atenção"
          value={summary?.medio ?? 0}
          icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
          iconBg="bg-amber-100"
          isLoading={isLoading}
        />
        <KpiCard
          label="Conformidade"
          value={`${pctCompliance}%`}
          icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
          iconBg="bg-green-100"
          isLoading={isLoading}
        />
      </div>

      <ReformaPendenteCard data={reforma.data} isLoading={reforma.isLoading} />

      {/* Resumo NCM + CFOP + PIS/COFINS */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">NCM — Classificação do Produto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label="Incompatível (erro grave)" value={summary.ncmIncompativel} color="text-red-600" />
              <Row label="Incerto (verificar)" value={summary.ncmIncerto} color="text-amber-600" />
              <Row label="Compatível" value={summary.ncmCompativel} color="text-green-600" />
              <Row label="Não validado" value={summary.naoValidado} color="text-gray-400" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">CFOP — Natureza da Operação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label="Erro de direção" value={summary.cfopErro} color="text-red-600" />
              <Row label="Interestadual (verificar)" value={summary.cfopAtencao} color="text-amber-600" />
              <Row label="Correto" value={summary.total - summary.cfopErro - summary.cfopAtencao} color="text-green-600" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-700">PIS/COFINS — Regime do Produto</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label="Nota diverge da lei" value={summary.pisCofinsDivergente} color="text-amber-600" />
              <Row label="Monofásico (por NCM)" value={summary.pisCofinsMonofasico} color="text-teal-700" />
              <Row label="Substituição tributária" value={summary.pisCofinsSt} color="text-purple-700" />
              <Row label="Normal" value={summary.total - summary.pisCofinsMonofasico - summary.pisCofinsSt} color="text-gray-600" />
            </CardContent>
          </Card>
        </div>
      )}

      <PisCofinsCfopCard data={pisCofins.data} isLoading={pisCofins.isLoading} />

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {(['todos', 'alto', 'medio', 'ok', 'nao_validado', 'pis_cofins'] as FilterType[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === f
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {f === 'todos' ? `Todos (${items.length})`
              : f === 'alto' ? `🔴 Alto Risco (${summary?.alto ?? 0})`
              : f === 'medio' ? `🟡 Atenção (${summary?.medio ?? 0})`
              : f === 'ok' ? `🟢 OK (${summary?.ok ?? 0})`
              : f === 'pis_cofins' ? `PIS/COFINS divergente (${summary?.pisCofinsDivergente ?? 0})`
              : `⚪ Não validado (${summary?.naoValidado ?? 0})`}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>NCM Atual</TableHead>
              <TableHead>NCM Sugerido</TableHead>
              <TableHead>CFOP + Análise IA</TableHead>
              <TableHead>PIS/COFINS</TableHead>
              <TableHead className="text-right">Valor Total</TableHead>
              <TableHead>Risco</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              : filtered.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                      {items.length === 0 ? 'Nenhum dado. Clique em Atualizar para carregar.' : 'Nenhum item neste filtro.'}
                    </TableCell>
                  </TableRow>
                )
                : filtered.map((item, i) => (
                  <TableRow key={i} className={item.risco === 'alto' ? 'bg-red-50/40' : item.risco === 'medio' ? 'bg-amber-50/30' : ''}>
                    <TableCell>
                      <p className="text-sm font-medium max-w-[200px] truncate">{item.xProd}</p>
                      <p className="text-xs text-gray-400">{item.count} nota(s)</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <NcmStatusIcon status={item.ncmStatus} />
                        <div>
                          <p className="text-xs font-mono">{item.ncm ?? '—'}</p>
                          {item.ncmDesc && (
                            <p className="text-xs text-gray-400 max-w-[160px] truncate" title={item.ncmDesc}>
                              {item.ncmDesc}
                            </p>
                          )}
                          {item.motivo && (
                            <p className="text-xs text-gray-500 italic max-w-[160px] truncate" title={item.motivo}>
                              {item.motivo}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {item.ncmSugerido ? (
                        <span className="text-xs text-blue-700 font-medium" title={item.ncmSugerido}>
                          → {item.ncmSugerido.slice(0, 40)}{item.ncmSugerido.length > 40 ? '…' : ''}
                        </span>
                      ) : item.ncmStatus === 'compativel' ? (
                        <span className="text-xs text-green-600">Correto</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const cfopAi = cfopValidations[cfopValidationKey(item)]
                        const icon = cfopAi
                          ? cfopAi.status === 'correto' ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                            : cfopAi.status === 'incorreto' ? <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                            : <HelpCircle className="h-4 w-4 text-amber-400 shrink-0" />
                          : <CfopStatusIcon status={item.cfopStatus} />
                        return (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              {icon}
                              <span className="text-xs font-mono font-semibold">{item.cfop}</span>
                            </div>
                            <p className="text-xs text-gray-500 max-w-[160px] truncate" title={cfopAi?.motivo ?? item.cfopMotivo}>
                              {cfopAi?.motivo ?? item.cfopMotivo}
                            </p>
                            {cfopAi?.cfopSugerido && (
                              <span className="text-xs text-blue-700 font-medium">
                                → Sugerido: {cfopAi.cfopSugerido}
                              </span>
                            )}
                          </div>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${REGIME_BADGE[item.pisCofins.regime].cls}`}>
                        {REGIME_BADGE[item.pisCofins.regime].label}
                      </span>
                      <p className="text-xs text-gray-400 mt-0.5" title={item.pisCofins.base ?? undefined}>
                        {item.cstPis ? `CST ${item.cstPis} na nota` : 'Sem CST na nota'}
                      </p>
                      {item.pisCofins.divergencia && (
                        <p
                          className="text-xs text-amber-700 max-w-[190px] flex gap-1"
                          title={item.pisCofins.divergencia.mensagem}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">{item.pisCofins.divergencia.mensagem}</span>
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {formatCurrency(item.vTotal)}
                    </TableCell>
                    <TableCell>
                      <RiscoBadge risco={item.risco} />
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
        {data?.truncated && (
          <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
            Mostrando os 300 produtos de maior valor no período.
          </p>
        )}
      </div>
    </div>
  )
}

function PrintOption({ titulo, desc, onClick }: { titulo: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left px-3 py-2 hover:bg-gray-50">
      <p className="font-medium text-gray-800">{titulo}</p>
      <p className="text-xs text-gray-500">{desc}</p>
    </button>
  )
}

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  )
}
