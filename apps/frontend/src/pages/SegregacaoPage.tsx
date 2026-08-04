import { useState, useMemo } from 'react'
import { Download, FileSpreadsheet, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCompanies } from '@/hooks/useCompanies'
import { useSegregacaoItems } from '@/hooks/useWatcher'
import { cn, formatCurrency, formatCNPJ } from '@/lib/utils'

// ─── TIPOS ───────────────────────────────────────────────────────────────────

interface NfeItem {
  nItem: number
  cProd?: string
  xProd: string
  ncm?: string
  cfop: string
  uCom?: string
  qCom: number
  vProd: number
  vDesc: number
  cstIcms?: string
  csosnIcms?: string
  vBCIcms: number
  pICMS: number
  vICMS: number
  vST: number
  cstPis?: string
  vPIS: number
  cstCofins?: string
  vCOFINS: number
  vIPI: number
  tribIcms?: string
  tribPis?: string
}

interface Nfe {
  id: string
  chNFe: string
  nNF: string
  serie: string
  mod: number
  dhEmi: string
  competencia: string
  tpNF: number
  status: string
  natOp?: string
  emitCnpj: string
  emitNome: string
  destNome?: string
  vNF: number
  vProd: number
  vDesc: number
  vICMS: number
  vICMSST: number
  vPIS: number
  vCOFINS: number
  vFrete: number
  items: NfeItem[]
}

interface FlatItem {
  // NF-e fields
  chNFe: string
  nNF: string
  serie: string
  mod: number
  dhEmi: string
  sit: string
  emitNome: string
  emitCnpj: string
  // Item fields
  nItem: number
  cProd?: string
  xProd: string
  ncm?: string
  cfop: string
  uCom?: string
  qCom: number
  vProd: number
  vDesc: number
  cstIcms?: string
  csosnIcms?: string
  cstPis?: string
  vICMS: number
  vST: number
  vPIS: number
  vCOFINS: number
  // Derived
  tribPis: string
  tribIcms: string
  // NF-e totals (per-nota, not per-item)
  _vNF: number
  _vICMSnf: number
  _vSTnf: number
  _vPISnf: number
  _vCOFINSnf: number
  _vFrete: number
}

// ─── CLASSIFICAÇÃO ──────────────────────────────────────────────────────────
// tribIcms/tribPis agora vêm calculados pelo backend (parser.ts), fonte única
// de verdade — evita divergência entre o que é gravado no banco e o que é
// exibido aqui.

// ─── FLATTEN NF-e → items ────────────────────────────────────────────────────

function flattenNfes(nfes: Nfe[]): FlatItem[] {
  const items: FlatItem[] = []
  for (const nfe of nfes) {
    const sit = nfe.status === 'CANCELADA' ? 'CANCELADO' : 'REGULAR'
    for (const item of nfe.items) {
      items.push({
        chNFe: nfe.chNFe,
        nNF: nfe.nNF,
        serie: nfe.serie,
        mod: nfe.mod,
        dhEmi: nfe.dhEmi,
        sit,
        emitNome: nfe.emitNome,
        emitCnpj: nfe.emitCnpj,
        nItem: item.nItem,
        cProd: item.cProd,
        xProd: item.xProd,
        ncm: item.ncm,
        cfop: item.cfop,
        uCom: item.uCom,
        qCom: Number(item.qCom),
        vProd: Number(item.vProd),
        vDesc: Number(item.vDesc),
        cstIcms: item.cstIcms,
        csosnIcms: item.csosnIcms,
        cstPis: item.cstPis,
        vICMS: Number(item.vICMS),
        vST: Number(item.vST),
        vPIS: Number(item.vPIS),
        vCOFINS: Number(item.vCOFINS),
        tribPis: item.tribPis || 'Tributado',
        tribIcms: item.tribIcms || 'Tributado',
        _vNF: Number(nfe.vNF),
        _vICMSnf: Number(nfe.vICMS),
        _vSTnf: Number(nfe.vICMSST),
        _vPISnf: Number(nfe.vPIS),
        _vCOFINSnf: Number(nfe.vCOFINS),
        _vFrete: Number(nfe.vFrete),
      })
    }
  }
  return items
}

// ─── SEGREGAÇÃO PGDAS-D ──────────────────────────────────────────────────────

interface SegGroup {
  v: number
  c: number
  label: string
  desc: string
}

function buildSegregacao(items: FlatItem[]) {
  const auth = items.filter(i => i.sit !== 'CANCELADO')
  const G1: SegGroup = { v: 0, c: 0, label: 'Grupo 1', desc: 'Sem ST / Monofásica — tributação integral no DAS' }
  const GA: SegGroup = { v: 0, c: 0, label: 'Grupo 2-A', desc: 'PIS/COFINS Monofásico + ICMS com ST — COFINS, ICMS e PIS excluídos do DAS' }
  const GB: SegGroup = { v: 0, c: 0, label: 'Grupo 2-B', desc: 'ICMS com ST (PIS/COFINS tributado normal) — apenas ICMS excluído do DAS' }
  const GC: SegGroup = { v: 0, c: 0, label: 'Grupo 2-C', desc: 'PIS/COFINS Monofásico (ICMS tributado normal) — COFINS e PIS excluídos do DAS' }
  const GD: SegGroup = { v: 0, c: 0, label: 'Grupo 2-D', desc: 'PIS/COFINS por ST + ICMS com ST — COFINS, ICMS e PIS excluídos do DAS' }

  for (const it of auth) {
    const isMono  = it.tribPis === 'Tributação Monofásica'
    const isSTpis = it.tribPis === 'Substituição Tributária'
    const isSTicms= it.tribIcms === 'Substituição Tributária'
    const isTrib  = it.tribPis === 'Tributado'
    const v = it.vProd

    if (isMono && isSTicms)       { GA.v += v; GA.c++ }
    else if (isTrib && isSTicms)  { GB.v += v; GB.c++ }
    else if (isMono && !isSTicms) { GC.v += v; GC.c++ }
    else if (isSTpis && isSTicms) { GD.v += v; GD.c++ }
    else                          { G1.v += v; G1.c++ }
  }

  const total = auth.reduce((s, i) => s + i.vProd, 0)
  return { G1, GA, GB, GC, GD, total }
}

// ─── CSV EXPORT ──────────────────────────────────────────────────────────────

function exportCSV(type: 'items' | 'notas' | 'seg', data: FlatItem[], nfes: Nfe[]) {
  let rows: (string | number)[][]
  let header: string[]

  const fmtDate = (s: string) => s ? s.split('T')[0].split('-').reverse().join('/') : '—'
  const fmtN = (n: number) => n.toFixed(2).replace('.', ',')

  if (type === 'items') {
    header = ['Nº Doc','Série','Data','Mod','Cód.Int.','NCM','Descrição','Trib.PIS/COFINS','Trib.ICMS','CFOP','CST ICMS','CSOSN','Situação','Qtd','Valor Produto','Desconto','ICMS','ICMS-ST','PIS','COFINS','Chave']
    rows = data.map(it => [
      it.nNF, it.serie, fmtDate(it.dhEmi), it.mod === 55 ? 'NF-e' : 'NFC-e',
      it.cProd || '—', it.ncm || '—', it.xProd,
      it.tribPis, it.tribIcms, it.cfop,
      it.cstIcms || '—', it.csosnIcms || '—', it.sit,
      fmtN(it.qCom), fmtN(it.vProd), fmtN(it.vDesc),
      fmtN(it.vICMS), fmtN(it.vST), fmtN(it.vPIS), fmtN(it.vCOFINS),
      it.chNFe
    ])
  } else if (type === 'notas') {
    header = ['Nº Doc','Série','Data','Modelo','CFOPs','Situação','Valor NF','ICMS','ICMS-ST','PIS','COFINS','Chave']
    const nfeMap = new Map<string, { cfops: Set<string>; sit: string; n: Nfe }>()
    for (const nfe of nfes) {
      if (!nfeMap.has(nfe.chNFe)) nfeMap.set(nfe.chNFe, { cfops: new Set(), sit: nfe.status === 'CANCELADA' ? 'CANCELADO' : 'REGULAR', n: nfe })
      for (const it of nfe.items) if (it.cfop) nfeMap.get(nfe.chNFe)!.cfops.add(it.cfop)
    }
    rows = [...nfeMap.values()].map(({ cfops, sit, n }) => [
      n.nNF, n.serie, fmtDate(n.dhEmi), n.mod === 55 ? 'NF-e' : 'NFC-e',
      [...cfops].join(';'), sit,
      fmtN(Number(n.vNF)), fmtN(Number(n.vICMS)), fmtN(Number(n.vICMSST)),
      fmtN(Number(n.vPIS)), fmtN(Number(n.vCOFINS)), n.chNFe
    ])
  } else {
    const { G1, GA, GB, GC, GD } = buildSegregacao(data)
    header = ['Grupo PGDAS-D','Receita (R$)','COFINS','CSLL','ICMS','INSS/CPP','IRPJ','PIS','Qtd.Itens']
    rows = [
      G1.v > 0 ? ['Grupo 1 – Sem ST/Monofásica', fmtN(G1.v), '', '', '', '', '', '', G1.c] : null,
      GA.v > 0 ? ['Grupo 2-A – Mono+ST', fmtN(GA.v), 'Tributação Monofásica', '', 'Substituição Tributária', '', '', 'Tributação Monofásica', GA.c] : null,
      GB.v > 0 ? ['Grupo 2-B – Tributado+ST', fmtN(GB.v), '', '', 'Substituição Tributária', '', '', '', GB.c] : null,
      GC.v > 0 ? ['Grupo 2-C – Mono+Tributado', fmtN(GC.v), 'Tributação Monofásica', '', '', '', '', 'Tributação Monofásica', GC.c] : null,
      GD.v > 0 ? ['Grupo 2-D – ST+ST', fmtN(GD.v), 'Substituição Tributária', '', 'Substituição Tributária', '', '', 'Substituição Tributária', GD.c] : null,
    ].filter(Boolean) as (string | number)[][]
  }

  const csv = [header, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const a = document.createElement('a')
  a.href = 'data:text/csv;charset=utf-8,﻿' + encodeURIComponent(csv)
  a.download = `segregacao-${type}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
}

// ─── BADGE HELPERS ───────────────────────────────────────────────────────────

const TRIB_COLORS: Record<string, string> = {
  'Tributado': 'bg-blue-50 text-blue-700 border border-blue-200',
  'Tributação Monofásica': 'bg-teal-50 text-teal-700 border border-teal-200',
  'Simples Nacional': 'bg-green-50 text-green-700 border border-green-200',
  'Substituição Tributária': 'bg-purple-50 text-purple-700 border border-purple-200',
  'Isento/NT': 'bg-gray-100 text-gray-600 border border-gray-200',
}

function TribBadge({ label }: { label: string }) {
  return (
    <span className={cn('inline-block text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap', TRIB_COLORS[label] || 'bg-gray-100 text-gray-600')}>
      {label || '—'}
    </span>
  )
}

function fmtDate(s: string) {
  if (!s) return '—'
  const p = s.split('T')[0].split('-')
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

type TabId = 'items' | 'notas' | 'cfop' | 'seg'

export default function SegregacaoPage() {
  const [companyId, setCompanyId] = useState('all')
  const [competencia, setCompetencia] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [tab, setTab] = useState<TabId>('items')
  const [search, setSearch] = useState('')
  const [filterTribPis, setFilterTribPis] = useState('')
  const [filterTribIcms, setFilterTribIcms] = useState('')
  const [filterCfop, setFilterCfop] = useState('')
  const [filterSit, setFilterSit] = useState('')
  const [sortCol, setSortCol] = useState('nNF')
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(1)
  const PAGE = 100

  const { data: companies = [] } = useCompanies()
  const { data, isLoading } = useSegregacaoItems(
    companyId === 'all' ? undefined : companyId,
    competencia
  )

  const nfes: Nfe[] = data?.nfes ?? []
  const allItems = useMemo(() => flattenNfes(nfes), [nfes])

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase()
    return allItems.filter(it => {
      if (filterTribPis && it.tribPis !== filterTribPis) return false
      if (filterTribIcms && it.tribIcms !== filterTribIcms) return false
      if (filterCfop && it.cfop !== filterCfop) return false
      if (filterSit && it.sit !== filterSit) return false
      if (q && !`${it.cProd} ${it.xProd} ${it.ncm} ${it.chNFe} ${it.cfop}`.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => {
      const va = (a as unknown as Record<string, unknown>)[sortCol] ?? ''
      const vb = (b as unknown as Record<string, unknown>)[sortCol] ?? ''
      if (typeof va === 'number') return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number)
      return sortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va))
    })
  }, [allItems, search, filterTribPis, filterTribIcms, filterCfop, filterSit, sortCol, sortAsc])

  const seg = useMemo(() => buildSegregacao(allItems), [allItems])

  const authItems = allItems.filter(i => i.sit !== 'CANCELADO')
  const cancelItems = allItems.filter(i => i.sit === 'CANCELADO')
  const allNfeList = nfes
  const nfeCount = allNfeList.length
  const authNfeCount = allNfeList.filter(n => n.status !== 'CANCELADA').length

  function doSort(col: string) {
    if (sortCol === col) setSortAsc(!sortAsc)
    else { setSortCol(col); setSortAsc(true) }
    setPage(1)
  }

  const paged = filteredItems.slice((page - 1) * PAGE, page * PAGE)
  const totalPages = Math.ceil(filteredItems.length / PAGE)

  const tribPisOpts = [...new Set(allItems.map(i => i.tribPis))].sort()
  const tribIcmsOpts = [...new Set(allItems.map(i => i.tribIcms))].sort()
  const cfopOpts = [...new Set(allItems.map(i => i.cfop).filter(Boolean))].sort()

  // Competência months
  const compMonths: string[] = []
  const now = new Date()
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    compMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const fmtComp = (c: string) => {
    const [y, m] = c.split('-')
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    return `${months[parseInt(m) - 1]}/${y}`
  }

  // CFOP / trib stats
  const cfopStats = useMemo(() => {
    const m: Record<string, { c: number; v: number }> = {}
    authItems.forEach(it => {
      if (!m[it.cfop]) m[it.cfop] = { c: 0, v: 0 }
      m[it.cfop].c++; m[it.cfop].v += it.vProd
    })
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v)
  }, [authItems])

  const pisStats = useMemo(() => {
    const m: Record<string, { c: number; v: number }> = {}
    authItems.forEach(it => {
      if (!m[it.tribPis]) m[it.tribPis] = { c: 0, v: 0 }
      m[it.tribPis].c++; m[it.tribPis].v += it.vProd
    })
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v)
  }, [authItems])

  const icmsStats = useMemo(() => {
    const m: Record<string, { c: number; v: number }> = {}
    authItems.forEach(it => {
      if (!m[it.tribIcms]) m[it.tribIcms] = { c: 0, v: 0 }
      m[it.tribIcms].c++; m[it.tribIcms].v += it.vProd
    })
    return Object.entries(m).sort((a, b) => b[1].v - a[1].v)
  }, [authItems])

  const ncmStats = useMemo(() => {
    const m: Record<string, { c: number; v: number; descs: Set<string> }> = {}
    authItems.forEach(it => {
      if (!it.ncm) return
      if (!m[it.ncm]) m[it.ncm] = { c: 0, v: 0, descs: new Set() }
      m[it.ncm].c++; m[it.ncm].v += it.vProd
      if (it.xProd) m[it.ncm].descs.add(it.xProd)
    })
    return Object.entries(m).sort((a, b) => b[1].c - a[1].c).slice(0, 30)
  }, [authItems])

  const emitInfo = nfes[0]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Segregação PGDAS-D</h1>
          <p className="text-sm text-gray-500 mt-0.5">Segregação de receitas por tributação · Simples Nacional</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportCSV('items', filteredItems, nfes)} disabled={!allItems.length}>
            <Download className="h-3.5 w-3.5 mr-1" /> CSV Itens
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV('notas', filteredItems, nfes)} disabled={!nfes.length}>
            <Download className="h-3.5 w-3.5 mr-1" /> CSV Notas
          </Button>
          <Button size="sm" onClick={() => exportCSV('seg', allItems, nfes)} disabled={!allItems.length}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> CSV Segregação
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Empresa:</label>
              <Select value={companyId} onValueChange={v => { setCompanyId(v); setPage(1) }}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as empresas</SelectItem>
                  {companies.filter(c => c.active).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} · {formatCNPJ(c.cnpj)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Competência:</label>
              <Select value={competencia} onValueChange={v => { setCompetencia(v); setPage(1) }}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {compMonths.map(m => (
                    <SelectItem key={m} value={m}>{fmtComp(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empresa info */}
      {emitInfo && (
        <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap text-sm shadow-sm">
          <span className="text-gray-500">🏢</span>
          <strong className="text-gray-900">{emitInfo.emitNome}</strong>
          <span className="text-gray-500">CNPJ: <strong>{formatCNPJ(emitInfo.emitCnpj)}</strong></span>
          <span className="ml-auto text-xs text-gray-400">{allItems.length.toLocaleString()} itens · {nfeCount} notas</span>
        </div>
      )}

      {/* KPIs */}
      {allItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { label: 'Total notas', value: nfeCount, color: 'text-blue-600' },
            { label: 'Autorizadas', value: authNfeCount, color: 'text-green-600' },
            { label: 'Canceladas', value: cancelItems.length > 0 ? [...new Set(cancelItems.map(i => i.chNFe))].length : 0, color: 'text-red-600' },
            { label: 'Total itens', value: allItems.length, color: 'text-blue-600' },
            { label: 'Valor autorizado', value: formatCurrency(authItems.reduce((s, i) => s + i.vProd, 0)), color: 'text-green-600', sm: true },
            { label: 'Descontos', value: formatCurrency(authItems.reduce((s, i) => s + i.vDesc, 0)), color: 'text-amber-600', sm: true },
            { label: 'ICMS Total', value: formatCurrency(authItems.reduce((s, i) => s + i.vICMS + i.vST, 0)), color: 'text-purple-600', sm: true },
          ].map(k => (
            <Card key={k.label} className="shadow-sm">
              <CardContent className="p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{k.label}</div>
                <div className={cn('font-bold leading-tight', k.sm ? 'text-sm' : 'text-2xl', k.color)}>{k.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isLoading ? (
        <Card><CardContent className="p-12 text-center text-gray-400">Carregando dados…</CardContent></Card>
      ) : allItems.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-gray-400">
          Nenhuma NF-e encontrada para {fmtComp(competencia)}. Importe XMLs primeiro.
        </CardContent></Card>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex border-b-2 border-gray-200 overflow-x-auto">
            {([
              { id: 'items', label: '📄 Itens por documento' },
              { id: 'notas', label: '🧾 Notas fiscais' },
              { id: 'cfop',  label: '🏷 CFOP / Tributação' },
              { id: 'seg',   label: '📊 Segregação PGDAS-D' },
            ] as { id: TabId; label: string }[]).map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'text-xs font-medium px-4 py-2.5 whitespace-nowrap border-b-2 -mb-0.5 transition-colors',
                  tab === t.id
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-500 border-transparent hover:text-gray-700'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── ABA ITENS ── */}
          {tab === 'items' && (
            <Card>
              <CardContent className="p-4">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Código, descrição, NCM, chave…"
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(1) }}
                    className="h-8 px-3 text-xs border border-gray-300 rounded-md flex-1 min-w-40 focus:outline-none focus:border-blue-400"
                  />
                  <select value={filterTribPis} onChange={e => { setFilterTribPis(e.target.value); setPage(1) }}
                    className="h-8 px-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:border-blue-400">
                    <option value="">Tributação PIS/COFINS</option>
                    {tribPisOpts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <select value={filterTribIcms} onChange={e => { setFilterTribIcms(e.target.value); setPage(1) }}
                    className="h-8 px-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:border-blue-400">
                    <option value="">Tributação ICMS</option>
                    {tribIcmsOpts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <select value={filterCfop} onChange={e => { setFilterCfop(e.target.value); setPage(1) }}
                    className="h-8 px-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:border-blue-400">
                    <option value="">CFOP</option>
                    {cfopOpts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <select value={filterSit} onChange={e => { setFilterSit(e.target.value); setPage(1) }}
                    className="h-8 px-2 text-xs border border-gray-300 rounded-md focus:outline-none focus:border-blue-400">
                    <option value="">Situação</option>
                    <option>REGULAR</option>
                    <option>CANCELADO</option>
                  </select>
                  <button onClick={() => exportCSV('items', filteredItems, nfes)}
                    className="h-8 px-3 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50 flex items-center gap-1">
                    <Download className="h-3 w-3" /> CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        {[
                          ['nNF','Nº Doc'],['dhEmi','Data'],['mod','Mod'],['cProd','Cód.'],
                          ['ncm','NCM'],['xProd','Descrição'],['tribPis','Trib.PIS/COFINS'],
                          ['tribIcms','Trib.ICMS'],['cfop','CFOP'],['cstIcms','CST ICMS'],
                          ['csosnIcms','CSOSN'],['sit','Situação'],['qCom','Qtd'],
                          ['vProd','Valor'],['vDesc','Desconto'],['vICMS','ICMS'],
                          ['vST','ICMS-ST'],['vPIS','PIS'],['vCOFINS','COFINS'],['chNFe','Chave'],
                        ].map(([col, lbl]) => (
                          <th key={col} onClick={() => doSort(col)}
                            className="text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500 px-2 py-2 border-b-2 border-gray-200 cursor-pointer hover:text-blue-600 whitespace-nowrap">
                            {lbl} {sortCol === col ? (sortAsc ? '↑' : '↓') : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((it, i) => (
                        <tr key={`${it.chNFe}-${it.nItem}-${i}`}
                          className={cn('border-b border-gray-100 hover:bg-gray-50', it.sit === 'CANCELADO' && 'opacity-50')}>
                          <td className="px-2 py-1.5 font-medium">{it.nNF}<span className="text-gray-400 font-normal">/{it.serie}</span></td>
                          <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(it.dhEmi)}</td>
                          <td className="px-2 py-1.5"><span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', it.mod === 55 ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700')}>{it.mod === 55 ? 'NF-e' : 'NFC-e'}</span></td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-gray-500">{it.cProd || '—'}</td>
                          <td className="px-2 py-1.5 font-mono text-[10px]">{it.ncm || '—'}</td>
                          <td className="px-2 py-1.5 max-w-32"><span className="block truncate" title={it.xProd}>{it.xProd}</span></td>
                          <td className="px-2 py-1.5"><TribBadge label={it.tribPis} /></td>
                          <td className="px-2 py-1.5"><TribBadge label={it.tribIcms} /></td>
                          <td className="px-2 py-1.5 font-mono text-[10px]">{it.cfop}</td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-gray-500">{it.cstIcms || '—'}</td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-gray-500">{it.csosnIcms || '—'}</td>
                          <td className="px-2 py-1.5">
                            <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', it.sit === 'CANCELADO' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700')}>{it.sit}</span>
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-[11px]">{it.qCom.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-[11px] font-medium">{formatCurrency(it.vProd)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-[11px]">{it.vDesc > 0 ? formatCurrency(it.vDesc) : '—'}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-[11px]">{it.vICMS > 0 ? formatCurrency(it.vICMS) : '—'}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-[11px]">{it.vST > 0 ? formatCurrency(it.vST) : '—'}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-[11px]">{it.vPIS > 0 ? formatCurrency(it.vPIS) : '—'}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-[11px]">{it.vCOFINS > 0 ? formatCurrency(it.vCOFINS) : '—'}</td>
                          <td className="px-2 py-1.5 font-mono text-[9px] text-gray-400 max-w-20"><span className="block truncate" title={it.chNFe}>{it.chNFe}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Footer totals */}
                <div className="flex flex-wrap border-t-2 border-gray-200 mt-3">
                  {[
                    { l: 'Itens filtrados', v: filteredItems.length.toLocaleString(), c: 'text-blue-600' },
                    { l: 'Valor total', v: formatCurrency(filteredItems.filter(i=>i.sit!=='CANCELADO').reduce((s,i)=>s+i.vProd,0)), c: 'text-green-600' },
                    { l: 'Descontos', v: formatCurrency(filteredItems.filter(i=>i.sit!=='CANCELADO').reduce((s,i)=>s+i.vDesc,0)), c: 'text-amber-600' },
                    { l: 'ICMS', v: formatCurrency(filteredItems.filter(i=>i.sit!=='CANCELADO').reduce((s,i)=>s+i.vICMS,0)), c: 'text-purple-600' },
                    { l: 'ICMS-ST', v: formatCurrency(filteredItems.filter(i=>i.sit!=='CANCELADO').reduce((s,i)=>s+i.vST,0)), c: 'text-purple-600' },
                  ].map(f => (
                    <div key={f.l} className="flex-1 min-w-24 px-3 py-2 border-r border-gray-100 last:border-0">
                      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-0.5">{f.l}</div>
                      <div className={cn('text-sm font-bold', f.c)}>{f.v}</div>
                    </div>
                  ))}
                </div>
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                    <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}
                      className="h-7 px-3 border rounded text-xs disabled:opacity-40">← Anterior</button>
                    <span>Pág. {page} / {totalPages}</span>
                    <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
                      className="h-7 px-3 border rounded text-xs disabled:opacity-40">Próximo →</button>
                    <span className="ml-auto">Total: <strong>{filteredItems.length.toLocaleString()}</strong></span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── ABA NOTAS ── */}
          {tab === 'notas' && (
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <button onClick={() => exportCSV('notas', filteredItems, nfes)}
                    className="h-8 px-3 text-xs border border-gray-300 rounded-md bg-white hover:bg-gray-50 flex items-center gap-1 ml-auto">
                    <Download className="h-3 w-3" /> CSV Notas
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        {['Nº/Série','Data','Modelo','CFOPs','Tributação predom.','Situação','Valor NF','ICMS','ICMS-ST','PIS','COFINS','Chave'].map(h => (
                          <th key={h} className="text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500 px-2 py-2 border-b-2 border-gray-200 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nfes.map(n => {
                        const cfops = [...new Set(n.items.map(i => i.cfop).filter(Boolean))]
                        const tribs = [...new Set(n.items.map(i => i.tribIcms || 'Tributado'))]
                        const sit = n.status === 'CANCELADA' ? 'CANCELADO' : 'REGULAR'
                        return (
                          <tr key={n.id} className={cn('border-b border-gray-100 hover:bg-gray-50', n.status === 'CANCELADA' && 'opacity-50')}>
                            <td className="px-2 py-1.5 font-medium">{n.nNF}<span className="text-gray-400 font-normal">/{n.serie}</span></td>
                            <td className="px-2 py-1.5 whitespace-nowrap">{fmtDate(n.dhEmi)}</td>
                            <td className="px-2 py-1.5"><span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', n.mod === 55 ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700')}>{n.mod === 55 ? 'NF-e' : 'NFC-e'}</span></td>
                            <td className="px-2 py-1.5 font-mono text-[10px]">{cfops.join(', ') || '—'}</td>
                            <td className="px-2 py-1.5">{tribs.map(t => <TribBadge key={t} label={t} />)}</td>
                            <td className="px-2 py-1.5"><span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', sit === 'CANCELADO' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700')}>{sit}</span></td>
                            <td className="px-2 py-1.5 text-right font-mono text-[11px] font-medium">{formatCurrency(Number(n.vNF))}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-[11px]">{Number(n.vICMS) > 0 ? formatCurrency(Number(n.vICMS)) : '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-[11px]">{Number(n.vICMSST) > 0 ? formatCurrency(Number(n.vICMSST)) : '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-[11px]">{Number(n.vPIS) > 0 ? formatCurrency(Number(n.vPIS)) : '—'}</td>
                            <td className="px-2 py-1.5 text-right font-mono text-[11px]">{Number(n.vCOFINS) > 0 ? formatCurrency(Number(n.vCOFINS)) : '—'}</td>
                            <td className="px-2 py-1.5 font-mono text-[9px] text-gray-400 max-w-20"><span className="block truncate" title={n.chNFe}>{n.chNFe}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── ABA CFOP / TRIBUTAÇÃO ── */}
          {tab === 'cfop' && (
            <div className="space-y-3">
              {[
                { title: '🏷 Totais por CFOP', items: cfopStats },
                { title: '🧾 Tributação PIS/COFINS', items: pisStats },
                { title: '🧾 Tributação ICMS', items: icmsStats },
              ].map(s => (
                <Card key={s.title}>
                  <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-gray-500">{s.title}</CardTitle></CardHeader>
                  <CardContent className="p-4 pt-0 flex flex-wrap gap-2">
                    {s.items.map(([k, v], idx) => {
                      const cls = ['bg-blue-50 text-blue-700 border-blue-200','bg-green-50 text-green-700 border-green-200','bg-purple-50 text-purple-700 border-purple-200','bg-teal-50 text-teal-700 border-teal-200','bg-amber-50 text-amber-700 border-amber-200','bg-red-50 text-red-700 border-red-200','bg-gray-100 text-gray-600 border-gray-200'][idx % 7]
                      return <span key={k} className={cn('px-3 py-1.5 rounded-md text-xs font-medium border', cls)}>{k} · {v.c} itens · {formatCurrency(v.v)}</span>
                    })}
                  </CardContent>
                </Card>
              ))}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-gray-500">🔢 NCMs mais frequentes</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase text-[10px]">NCM</th>
                      <th className="text-right px-4 py-2 font-semibold text-gray-500 uppercase text-[10px]">Qtd.Itens</th>
                      <th className="text-right px-4 py-2 font-semibold text-gray-500 uppercase text-[10px]">Valor Total</th>
                      <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase text-[10px]">Principais descrições</th>
                    </tr></thead>
                    <tbody>
                      {ncmStats.map(([ncm, v]) => (
                        <tr key={ncm} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-[11px]">{ncm}</td>
                          <td className="px-4 py-2 text-right">{v.c}</td>
                          <td className="px-4 py-2 text-right font-mono">{formatCurrency(v.v)}</td>
                          <td className="px-4 py-2 text-[11px] text-gray-500">{[...v.descs].slice(0, 4).join(', ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── ABA SEGREGAÇÃO PGDAS-D ── */}
          {tab === 'seg' && (
            <div className="space-y-4">
              {/* Bloco 1: Sem ST */}
              <SegBlock
                titulo="Revenda de mercadorias, exceto para o exterior"
                subtitulo="Sem substituição tributária / tributação monofásica / antecipação com encerramento de tributação"
                subtituloNote="(O substituto tributário do ICMS deve utilizar essa opção)"
                rows={seg.G1.v > 0 ? [{
                  receita: seg.G1.v, itens: seg.G1.c,
                  pct: seg.total > 0 ? seg.G1.v / seg.total * 100 : 0,
                  cofins: null, csll: null, icms: null, inss: null, irpj: null, pis: null,
                }] : []}
                total={seg.G1.v}
                totalItens={seg.G1.c}
                totalGeral={seg.total}
                totalLabel="Total Grupo 1"
              />

              {/* Bloco 2: Com ST */}
              <SegBlock
                titulo="Revenda de mercadorias, exceto para o exterior"
                subtitulo="Com substituição tributária / tributação monofásica / antecipação com encerramento de tributação"
                subtituloNote="(O substituído tributário do ICMS deve utilizar essa opção)"
                rows={[
                  seg.GA.v > 0 ? { receita: seg.GA.v, itens: seg.GA.c, pct: seg.total > 0 ? seg.GA.v/seg.total*100 : 0, cofins: 'mono', csll: null, icms: 'st', inss: null, irpj: null, pis: 'mono' } : null,
                  seg.GB.v > 0 ? { receita: seg.GB.v, itens: seg.GB.c, pct: seg.total > 0 ? seg.GB.v/seg.total*100 : 0, cofins: null, csll: null, icms: 'st', inss: null, irpj: null, pis: null } : null,
                  seg.GC.v > 0 ? { receita: seg.GC.v, itens: seg.GC.c, pct: seg.total > 0 ? seg.GC.v/seg.total*100 : 0, cofins: 'mono', csll: null, icms: null, inss: null, irpj: null, pis: 'mono' } : null,
                  seg.GD.v > 0 ? { receita: seg.GD.v, itens: seg.GD.c, pct: seg.total > 0 ? seg.GD.v/seg.total*100 : 0, cofins: 'st', csll: null, icms: 'st', inss: null, irpj: null, pis: 'st' } : null,
                ].filter(Boolean) as SegRow[]}
                total={seg.GA.v + seg.GB.v + seg.GC.v + seg.GD.v}
                totalItens={seg.GA.c + seg.GB.c + seg.GC.c + seg.GD.c}
                totalGeral={seg.total}
                totalLabel="Total Grupo 2"
              />

              {/* Resumo Geral */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-gray-500">📋 Resumo Geral do Período</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-gray-100 border-b border-gray-200">
                      {['Grupo','Descrição','Receita (R$)','Itens','%'].map(h => (
                        <th key={h} className={cn('px-4 py-2 font-semibold uppercase text-[10px] text-gray-500', h === 'Receita (R$)' || h === 'Itens' || h === '%' ? 'text-right' : 'text-left')}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {[
                        seg.G1.v > 0 && { badge: 'Grupo 1', color: 'bg-blue-50 text-blue-700', desc: 'Sem ST / Monofásica — tributação integral no DAS', v: seg.G1.v, c: seg.G1.c },
                        seg.GA.v > 0 && { badge: 'Grupo 2-A', color: 'bg-purple-50 text-purple-700', desc: 'PIS/COFINS Monofásico + ICMS com ST', v: seg.GA.v, c: seg.GA.c },
                        seg.GB.v > 0 && { badge: 'Grupo 2-B', color: 'bg-purple-50 text-purple-700', desc: 'ICMS com ST (PIS/COFINS tributado normal)', v: seg.GB.v, c: seg.GB.c },
                        seg.GC.v > 0 && { badge: 'Grupo 2-C', color: 'bg-purple-50 text-purple-700', desc: 'PIS/COFINS Monofásico (ICMS tributado normal)', v: seg.GC.v, c: seg.GC.c },
                        seg.GD.v > 0 && { badge: 'Grupo 2-D', color: 'bg-purple-50 text-purple-700', desc: 'PIS/COFINS por ST + ICMS com ST', v: seg.GD.v, c: seg.GD.c },
                      ].filter(Boolean).map((r, i) => {
                        const row = r as { badge: string; color: string; desc: string; v: number; c: number }
                        return (
                          <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-2"><span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', row.color)}>{row.badge}</span></td>
                            <td className="px-4 py-2 text-gray-500 text-[11px]">{row.desc}</td>
                            <td className="px-4 py-2 text-right font-mono font-semibold">{formatCurrency(row.v)}</td>
                            <td className="px-4 py-2 text-right">{row.c}</td>
                            <td className="px-4 py-2 text-right">{seg.total > 0 ? (row.v/seg.total*100).toFixed(2).replace('.',',') : '0,00'}%</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot><tr className="bg-blue-50 font-bold text-blue-900">
                      <td className="px-4 py-2" colSpan={2}>TOTAL GERAL DO PERÍODO</td>
                      <td className="px-4 py-2 text-right font-mono">{formatCurrency(seg.total)}</td>
                      <td className="px-4 py-2 text-right">{authItems.length}</td>
                      <td className="px-4 py-2 text-right">100,00%</td>
                    </tr></tfoot>
                  </table>
                </CardContent>
              </Card>

              {/* Nota orientativa */}
              <div className="border-l-4 border-blue-500 bg-blue-50 rounded-r-xl px-5 py-4 text-sm text-blue-800">
                <strong className="text-blue-900">📋 Como lançar no PGDAS-D (Simples Nacional):</strong>
                <ol className="mt-2 space-y-1.5 pl-5 list-decimal leading-relaxed">
                  <li>Acesse o PGDAS-D → <em>Atividades Econômicas com Receita no PA</em> → selecione <strong>Revenda de mercadorias, exceto para o exterior</strong>.</li>
                  {seg.G1.v > 0 && <li><strong>Grupo 1 — Sem ST:</strong> informe o valor <strong>{formatCurrency(seg.G1.v)}</strong> na linha padrão. Deixe todos os campos de tributos em branco (tributação integral no DAS).</li>}
                  {(seg.GA.v + seg.GB.v + seg.GC.v + seg.GD.v) > 0 && (
                    <li><strong>Grupo 2 — Com ST/Monofásica:</strong> clique em <em>"+"</em> para adicionar novas linhas:
                      <ul className="mt-1 pl-5 space-y-0.5 list-disc">
                        {seg.GA.v > 0 && <li>Linha A: <strong>{formatCurrency(seg.GA.v)}</strong> → COFINS: Monofásico · ICMS: ST · PIS: Monofásico</li>}
                        {seg.GB.v > 0 && <li>Linha B: <strong>{formatCurrency(seg.GB.v)}</strong> → ICMS: Substituição Tributária (demais em branco)</li>}
                        {seg.GC.v > 0 && <li>Linha C: <strong>{formatCurrency(seg.GC.v)}</strong> → COFINS: Monofásico · PIS: Monofásico (ICMS em branco)</li>}
                        {seg.GD.v > 0 && <li>Linha D: <strong>{formatCurrency(seg.GD.v)}</strong> → COFINS: ST · ICMS: ST · PIS: Substituição Tributária</li>}
                      </ul>
                    </li>
                  )}
                  <li>O PGDAS-D calculará o DAS <strong>descontando automaticamente</strong> os percentuais dos tributos marcados, evitando bitributação.</li>
                </ol>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── SEG BLOCK COMPONENT ─────────────────────────────────────────────────────

type TribTag = 'mono' | 'st' | null

interface SegRow {
  receita: number
  itens: number
  pct: number
  cofins: TribTag
  csll: TribTag
  icms: TribTag
  inss: TribTag
  irpj: TribTag
  pis: TribTag
}

function TribCell({ tag }: { tag: TribTag }) {
  if (!tag) return <span className="text-gray-400 text-xs">—</span>
  if (tag === 'mono') return <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 whitespace-nowrap">Tributação Monofásica</span>
  return <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">Substituição Tributária</span>
}

function SegBlock({ titulo, subtitulo, subtituloNote, rows, total, totalItens, totalGeral, totalLabel }: {
  titulo: string
  subtitulo: string
  subtituloNote: string
  rows: SegRow[]
  total: number
  totalItens: number
  totalGeral: number
  totalLabel: string
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-[#0A2F5A] text-white text-sm font-semibold px-5 py-3 text-center leading-snug">{titulo}</div>
      <div className="bg-blue-50 border-b border-blue-200 px-5 py-2 text-xs font-medium text-blue-800">
        {subtitulo}<br />
        <span className="opacity-75 text-[10.5px]">{subtituloNote}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b-2 border-gray-200">
              <th className="text-left px-4 py-2 font-semibold uppercase text-[10px] text-gray-500 min-w-36">Receita (R$)</th>
              {['COFINS','CSLL','ICMS','INSS/CPP','IRPJ','PIS'].map(h => (
                <th key={h} className="text-center px-3 py-2 font-semibold uppercase text-[10px] text-gray-500 min-w-36">{h}</th>
              ))}
              <th className="text-right px-3 py-2 font-semibold uppercase text-[10px] text-gray-500 min-w-16">Itens</th>
              <th className="text-right px-3 py-2 font-semibold uppercase text-[10px] text-gray-500 min-w-14">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-6 text-gray-400">Nenhuma receita neste grupo</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2.5 text-right font-mono font-semibold">{formatCurrency(r.receita)}</td>
                <td className="px-3 py-2.5 text-center"><TribCell tag={r.cofins} /></td>
                <td className="px-3 py-2.5 text-center"><TribCell tag={r.csll} /></td>
                <td className="px-3 py-2.5 text-center"><TribCell tag={r.icms} /></td>
                <td className="px-3 py-2.5 text-center"><TribCell tag={r.inss} /></td>
                <td className="px-3 py-2.5 text-center"><TribCell tag={r.irpj} /></td>
                <td className="px-3 py-2.5 text-center"><TribCell tag={r.pis} /></td>
                <td className="px-3 py-2.5 text-right">{r.itens}</td>
                <td className="px-3 py-2.5 text-right">{r.pct.toFixed(2).replace('.',',')}%</td>
              </tr>
            ))}
          </tbody>
          {total > 0 && (
            <tfoot>
              <tr className="bg-blue-100 text-blue-900 font-bold border-t-2 border-blue-200">
                <td className="px-4 py-2">{totalLabel}</td>
                <td colSpan={6}></td>
                <td className="px-3 py-2 text-right">{totalItens}</td>
                <td className="px-3 py-2 text-right">{totalGeral > 0 ? (total/totalGeral*100).toFixed(2).replace('.',',') : '0,00'}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
