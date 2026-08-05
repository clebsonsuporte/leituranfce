import prisma from '../../lib/prisma.js'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function fmtCur(val: number | string | null | undefined): string {
  return Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtQtd(val: number | string | null | undefined): string {
  return Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}
function fmtCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return ''
  const c = cnpj.replace(/\D/g, '')
  return c.length === 14 ? c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : cnpj
}

interface ReportFilters {
  companyId?: string
  competencia?: string
}

// Junta números faltantes consecutivos numa faixa (ex.: 81105,81106 -> "81105-81106"),
// mantendo números isolados como estão — mesmo formato do modelo de referência.
function compactRanges(nums: number[]): string {
  if (nums.length === 0) return ''
  const sorted = [...nums].sort((a, b) => a - b)
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i]
    if (cur === prev + 1) {
      prev = cur
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = cur
    prev = cur
  }
  return parts.join(', ')
}

// ─── Relatório de Documentos Fiscais (Entradas e Saídas) ─────────────────────
// HTML + Puppeteer (mesmo padrão de generatePisCofinsItemsReport abaixo) —
// reproduz o layout de referência do usuário: cards de resumo, tabela de
// notas autorizadas com status, notas faltantes agrupadas por série/modelo
// (com faixas compactadas) e um consolidado geral no final.

export async function generateEntradasSaidasReport(filters: ReportFilters): Promise<Buffer> {
  const where: Record<string, unknown> = {}
  if (filters.companyId) where.companyId = filters.companyId
  if (filters.competencia) where.competencia = filters.competencia

  const nfes = await prisma.nfe.findMany({
    where,
    orderBy: [{ serie: 'asc' }, { nNF: 'asc' }],
  })

  const company = filters.companyId
    ? await prisma.company.findUnique({ where: { id: filters.companyId } })
    : null

  const generatedAt = format(new Date(), "dd/MM/yyyy, HH:mm", { locale: ptBR })
  const competenciaLabel = filters.competencia
    ? (() => { const [y, m] = filters.competencia.split('-'); return `01/${m}/${y} a ${new Date(Number(y), Number(m), 0).getDate()}/${m}/${y}` })()
    : 'Todos os períodos'

  const saidas = nfes.filter((n) => n.tpNF === 1 && n.status !== 'CANCELADA' && n.status !== 'INUTILIZADA' && n.status !== 'SEM_PROTOCOLO')
  const entradas = nfes.filter((n) => n.tpNF === 0 && n.status !== 'CANCELADA' && n.status !== 'INUTILIZADA' && n.status !== 'SEM_PROTOCOLO')
  const canceladas = nfes.filter((n) => n.status === 'CANCELADA')
  const autorizadas = [...saidas, ...entradas].sort((a, b) => Number(a.nNF) - Number(b.nNF))

  const totalSaidas = saidas.reduce((s, n) => s + Number(n.vNF), 0)
  const totalEntradas = entradas.reduce((s, n) => s + Number(n.vNF), 0)
  const totalGeral = totalSaidas + totalEntradas

  const modelLabel = (mod: number) => (mod === 55 ? 'NF-e' : mod === 65 ? 'NFC-e' : `Modelo ${mod}`)
  // Agrupa uma lista de notas por modelo (55=NF-e, 65=NFC-e), na ordem em que
  // os modelos aparecem nos dados — cada grupo tem sua própria tabela/total.
  function porModelo(list: typeof nfes): { mod: number; label: string; list: typeof nfes }[] {
    const map = new Map<number, typeof nfes>()
    for (const n of list) {
      const arr = map.get(n.mod) ?? []
      arr.push(n)
      map.set(n.mod, arr)
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([mod, l]) => ({ mod, label: modelLabel(mod), list: l }))
  }
  const autorizadasPorModelo = porModelo(autorizadas)
  const canceladasPorModelo = porModelo(canceladas)
  const saidasPorModelo = porModelo(saidas)
  const entradasPorModelo = porModelo(entradas)

  function consolidadoRow(label: string, list: typeof nfes, opts: { totalOverride?: number } = {}): string {
    const qtd = list.length
    const vProd = list.reduce((s, n) => s + Number(n.vProd), 0)
    const vDesc = list.reduce((s, n) => s + Number(n.vDesc), 0)
    const vICMS = list.reduce((s, n) => s + Number(n.vICMS), 0)
    const total = opts.totalOverride ?? list.reduce((s, n) => s + Number(n.vNF), 0)
    return `<tr><td>${label}</td><td class="tr">${qtd}</td><td class="tr">${fmtCur(vProd)}</td><td class="tr">${fmtCur(vDesc)}</td><td class="tr">${fmtCur(vICMS)}</td><td class="tr fw">${fmtCur(total)}</td></tr>`
  }

  // ── Notas faltantes: quebras de sequência por modelo+série (mesma lógica
  // de checkSequenceBreaks, mas calculada aqui só para exibir no relatório) ──
  const bySerie = new Map<string, { mod: number; serie: string; nums: number[] }>()
  for (const n of nfes) {
    // Cancelada/Denegada/Inutilizada não são "lacuna" — só SEM_PROTOCOLO conta.
    if (n.status === 'SEM_PROTOCOLO') continue
    const key = `${n.mod}-${n.serie}`
    const entry = bySerie.get(key) ?? { mod: n.mod, serie: n.serie, nums: [] }
    const num = parseInt(n.nNF, 10)
    if (!isNaN(num)) entry.nums.push(num)
    bySerie.set(key, entry)
  }
  const faltantesGrupos: { mod: number; serie: string; faltantes: number[] }[] = []
  let totalFaltantes = 0
  for (const { mod, serie, nums } of bySerie.values()) {
    const sorted = [...nums].sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      for (let g = sorted[i - 1] + 1; g < sorted[i]; g++) gaps.push(g)
    }
    if (gaps.length > 0) {
      faltantesGrupos.push({ mod, serie, faltantes: gaps })
      totalFaltantes += gaps.length
    }
  }

  const vDescTotal = autorizadas.reduce((s, n) => s + Number(n.vDesc), 0)
  const vICMSTotal = autorizadas.reduce((s, n) => s + Number(n.vICMS), 0)
  const vProdTotal = autorizadas.reduce((s, n) => s + Number(n.vProd), 0)

function notaRow(n: (typeof autorizadas)[number]): string {
    return `<tr>
        <td class="mono">${n.nNF}</td>
        <td class="tc">${n.serie}</td>
        <td>${format(new Date(n.dhEmi), 'dd/MM/yyyy HH:mm')}</td>
        <td class="tr">${fmtCur(Number(n.vProd))}</td>
        <td class="tr fw">${fmtCur(Number(n.vNF))}</td>
        <td class="mono chave">${formatChave(n.chNFe)}</td>
        <td><span class="badge badge-green">Autorizada</span></td>
      </tr>`
  }

  function canceladaRow(n: (typeof canceladas)[number]): string {
    return `<tr>
        <td class="mono">${n.nNF}</td>
        <td class="tc">${n.serie}</td>
        <td class="mono chave">${formatChave(n.chNFe)}</td>
        <td><span class="badge badge-red">Cancelada</span></td>
      </tr>`
  }

  // Uma tabela + total por modelo (NF-e / NFC-e), em vez de uma lista única.
  const notasPorModeloHtml = autorizadasPorModelo
    .map(({ label, list }) => {
      const vProd = list.reduce((s, n) => s + Number(n.vProd), 0)
      const vTotal = list.reduce((s, n) => s + Number(n.vNF), 0)
      return `
<h2>Notas Autorizadas — ${label} <span class="count">${list.length} notas</span></h2>
<table>
  <thead>
    <tr><th>Nº NF</th><th>Série</th><th>Emissão</th><th class="tr">Vl. Prod.</th><th class="tr">Vl. Total</th><th>Chave de Acesso</th><th>Status</th></tr>
  </thead>
  <tbody>
    ${list.map(notaRow).join('')}
    <tr class="total-row">
      <td colspan="3"><strong>TOTAL ${label} — ${list.length} notas</strong></td>
      <td class="tr">${fmtCur(vProd)}</td>
      <td class="tr">${fmtCur(vTotal)}</td>
      <td colspan="2"></td>
    </tr>
  </tbody>
</table>`
    })
    .join('')

  // Notas canceladas: só número, série e chave — não entram no total de
  // faturamento, só servem pra conferência (igual ao card "Canceladas" do
  // resumo, mas com o detalhe de cada uma).
  const canceladasPorModeloHtml = canceladasPorModelo
    .map(
      ({ label, list }) => `
<h2>Notas Canceladas — ${label} <span class="count">${list.length} notas</span></h2>
<table>
  <thead>
    <tr><th>Nº NF</th><th>Série</th><th>Chave de Acesso</th><th>Status</th></tr>
  </thead>
  <tbody>
    ${list.map(canceladaRow).join('')}
  </tbody>
</table>`
    )
    .join('')

  const faltantesRows = faltantesGrupos
    .map(
      (g) => `<tr>
        <td class="tc">${g.mod === 65 ? 'NFC-e' : 'NF-e'}</td>
        <td class="tc">${g.serie}</td>
        <td class="ranges">${compactRanges(g.faltantes)}</td>
      </tr>`
    )
    .join('')

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:9px;color:#1f2937;margin:0}
  h1{font-size:20px;margin:0 0 2px}
  .subheader{color:#374151;font-size:9px;margin-bottom:2px}
  .subheader b{color:#111827}
  .cards{display:flex;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin:12px 0}
  .card{flex:1;text-align:center;padding:8px 4px;border-right:1px solid #e5e7eb}
  .card:last-child{border-right:none}
  .card .lbl{font-size:6.5px;text-transform:uppercase;color:#6b7280;letter-spacing:.03em}
  .card .val{font-size:13px;font-weight:bold;margin-top:3px;color:#111827}
  .card.saidas .val{color:#065f46}
  .card.cancel .val{color:#991b1b}
  .card.falt .val{color:#92400e}
  .card .val.periodo{font-size:9px;font-weight:normal;color:#374151}
  h2{font-size:11px;margin:14px 0 6px;display:flex;align-items:center;gap:6px}
  h2 .count{background:#eef2ff;color:#3730a3;border-radius:9999px;padding:1px 8px;font-size:8px;font-weight:normal;margin-left:auto}
  table{width:100%;border-collapse:collapse}
  thead{display:table-header-group}
  th{background:#374151;color:#fff;padding:4px 6px;text-align:left;font-size:8px;white-space:nowrap}
  td{padding:3px 6px;border-bottom:1px solid #f3f4f6}
  tr:nth-child(even){background:#f9fafb}
  .tr{text-align:right}
  .tc{text-align:center}
  .fw{font-weight:bold}
  .mono{font-family:Courier,monospace}
  .chave{font-size:7px;letter-spacing:.02em}
  .ranges{font-family:Courier,monospace;font-size:7.5px}
  .badge{padding:2px 7px;border-radius:9999px;font-size:7.5px;font-weight:bold}
  .badge-green{background:#d1fae5;color:#065f46}
  .badge-red{background:#fee2e2;color:#991b1b}
  tfoot tr,.total-row{background:#dbeafe!important;font-weight:bold}
  .falt-title{color:#92400e}
  .consolidado td{border-bottom:1px solid #e5e7eb}
  .consolidado .total{background:#dbeafe;font-weight:bold}
</style></head><body>

<h1>RELATÓRIO DE DOCUMENTOS FISCAIS</h1>
<div class="subheader"><b>Empresa:</b> ${company?.name || 'Todas as empresas'}${company?.cnpj ? ` &nbsp;•&nbsp; <b>CNPJ:</b> ${fmtCNPJ(company.cnpj)}` : ''}</div>
<div class="subheader"><b>Competência:</b> ${competenciaLabel} &nbsp;•&nbsp; <b>Gerado em:</b> ${generatedAt} &nbsp;•&nbsp; Software responsável: Fiscal Dashboard</div>

<div class="cards">
  <div class="card saidas"><div class="lbl">Saídas Autorizadas</div><div class="val">${saidas.length}</div></div>
  <div class="card saidas"><div class="lbl">Entradas Autorizadas</div><div class="val">${entradas.length}</div></div>
  <div class="card cancel"><div class="lbl">Canceladas</div><div class="val">${canceladas.length}</div></div>
  <div class="card falt"><div class="lbl">Faltantes</div><div class="val">${totalFaltantes}</div></div>
  <div class="card"><div class="lbl">Vl. Saídas</div><div class="val">${fmtCur(totalSaidas)}</div></div>
  <div class="card"><div class="lbl">Vl. Entradas</div><div class="val">${fmtCur(totalEntradas)}</div></div>
  <div class="card"><div class="lbl">Período</div><div class="val periodo">${competenciaLabel}</div></div>
</div>

${notasPorModeloHtml}

${canceladas.length > 0 ? canceladasPorModeloHtml : ''}

${faltantesGrupos.length > 0 ? `
<h2 class="falt-title">⚠ Notas Faltantes <span class="count">${totalFaltantes} notas</span></h2>
<table>
  <thead><tr><th>Mod.</th><th>Série</th><th>Números das Notas Faltantes</th></tr></thead>
  <tbody>${faltantesRows}</tbody>
</table>` : ''}

<h2>Consolidado Geral</h2>
<table class="consolidado">
  <thead><tr><th>Descrição</th><th class="tr">Qtd.</th><th class="tr">Vl. Produtos</th><th class="tr">Vl. Desc.</th><th class="tr">Vl. ICMS</th><th class="tr">Vl. Total</th></tr></thead>
  <tbody>
    ${saidasPorModelo.map((g) => consolidadoRow(`Notas de Saída — ${g.label}`, g.list)).join('')}
    ${entradasPorModelo.map((g) => consolidadoRow(`Notas de Entrada — ${g.label}`, g.list)).join('')}
    ${canceladasPorModelo.map((g) => consolidadoRow(`Notas Canceladas — ${g.label}`, g.list)).join('')}
    <tr><td>Notas Faltantes</td><td class="tr">${totalFaltantes}</td><td class="tr">–</td><td class="tr">–</td><td class="tr">–</td><td class="tr">–</td></tr>
    <tr class="total"><td><strong>TOTAL GERAL</strong></td><td class="tr fw">${autorizadas.length}</td><td class="tr fw">${fmtCur(vProdTotal)}</td><td class="tr fw">${fmtCur(vDescTotal)}</td><td class="tr fw">${fmtCur(vICMSTotal)}</td><td class="tr fw">${fmtCur(totalGeral)}</td></tr>
  </tbody>
</table>

</body></html>`

  const puppeteer = (await import('puppeteer')).default
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const headerLabel = `Relatório de Documentos Fiscais — ${competenciaLabel}`
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '10mm', bottom: '14mm', left: '10mm' },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:7px;color:#6b7280;width:100%;padding:0 10mm;display:flex;justify-content:space-between"><span>${headerLabel}</span><span>${generatedAt}</span></div>`,
      footerTemplate: `<div style="font-size:7px;color:#6b7280;width:100%;padding:0 10mm;text-align:center">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`,
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}

function formatChave(ch: string | null | undefined): string {
  if (!ch) return ''
  return ch.replace(/(\d{4})(?=\d)/g, '$1 ')
}

// ─── PIS/COFINS por Itens (Monofásico / ST) ───────────────────────────────────

export async function generatePisCofinsItemsReport(
  filters: ReportFilters,
  tributacao: string,
  cfops: string[]
): Promise<Buffer> {
  const whereNfe: Record<string, unknown> = { tpNF: 1 }
  if (filters.companyId) whereNfe.companyId = filters.companyId
  if (filters.competencia) whereNfe.competencia = filters.competencia

  const whereItem: Record<string, unknown> = { nfe: whereNfe }
  if (cfops.length > 0) whereItem.cfop = { in: cfops }

  if (tributacao === 'monofasico') {
    whereItem.cstPis = { in: ['04', '05', '06', '07', '08', '09', '70', '71', '72', '73', '74', '75'] }
  } else if (tributacao === 'st') {
    whereItem.OR = [
      { csosnIcms: { in: ['500', '201', '202', '203'] } },
      { cstIcms: { in: ['10', '30', '60', '70'] } },
    ]
  }

  const items = await prisma.nfeItem.findMany({
    where: whereItem,
    include: { nfe: { select: { nNF: true, dhEmi: true, emitNome: true, emitCnpj: true, mod: true } } },
    orderBy: [{ nfe: { dhEmi: 'asc' } }, { nfe: { nNF: 'asc' } }, { nItem: 'asc' }],
    take: 100000,
  })

  const company = filters.companyId
    ? await prisma.company.findUnique({ where: { id: filters.companyId } })
    : null

  const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

  const periodoLabel = filters.competencia
    ? (() => { const [y, m] = filters.competencia.split('-'); return `01/${m}/${y} até ${new Date(Number(y), Number(m), 0).getDate()}/${m}/${y}` })()
    : 'Todos os períodos'

  const cfopLabel = cfops.length > 0 ? cfops.map(c => c.replace('.', '.')).join(', ') : 'Todos'
  const tributacaoLabel = tributacao === 'monofasico'
    ? '04-Operação Tributável Monofásica - Revenda Alíquota Zero'
    : tributacao === 'st'
      ? 'Substituição Tributária (ICMS-ST)'
      : 'Todos'

  const titulos: Record<string, string> = {
    monofasico: 'RELATÓRIO DE PRODUTOS VENDIDOS COM PIS E COFINS - NOTA E CUPOM',
    st: 'RELATÓRIO DE PRODUTOS VENDIDOS - SUBSTITUIÇÃO TRIBUTÁRIA',
    todos: 'RELATÓRIO DE PRODUTOS VENDIDOS',
  }

  // Group rows by nota
  const rows = items.map(i => `
    <tr>
      <td>${i.nfe.nNF}</td>
      <td>${format(new Date(i.nfe.dhEmi), 'dd/MM/yyyy')}</td>
      <td>${i.cProd || ''}</td>
      <td class="desc">${i.xProd || ''}</td>
      <td class="tr">${fmtQtd(Number(i.qCom))}</td>
      <td class="tr">${fmtCur(Number(i.vUnCom))}</td>
      <td class="tr fw">${fmtCur(Number(i.vProd))}</td>
      <td class="tr">${fmtCur(0)}</td>
      <td class="tr c6">0,00%</td>
      <td class="tr c6">0,00%</td>
      <td class="tr">${fmtCur(Number(i.vCOFINS))}</td>
      <td class="tr">${fmtCur(0)}</td>
      <td class="tr c6">0,00%</td>
      <td class="tr c6">0,00%</td>
      <td class="tr">${fmtCur(Number(i.vPIS))}</td>
      <td class="tr fw">${fmtCur(Number(i.vPIS || 0) + Number(i.vCOFINS || 0))}</td>
    </tr>`).join('')

  const totalVProd = items.reduce((s, i) => s + Number(i.vProd || 0), 0)
  const totalPIS = items.reduce((s, i) => s + Number(i.vPIS || 0), 0)
  const totalCOFINS = items.reduce((s, i) => s + Number(i.vCOFINS || 0), 0)

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<style>
  body{font-family:Arial,sans-serif;font-size:7.5px;margin:10px;color:#1f2937}
  h1{font-size:11px;color:#1e40af;margin:0 0 1px;text-align:center}
  h2{font-size:9px;color:#1f2937;margin:0 0 1px;text-align:center}
  .info{color:#6b7280;font-size:7px;margin-bottom:3px;text-align:center}
  .filters{background:#f9fafb;border:1px solid #e5e7eb;border-radius:3px;padding:4px 6px;font-size:7px;color:#374151;margin-bottom:8px}
  table{width:100%;border-collapse:collapse}
  th{background:#374151;color:white;padding:3px 4px;text-align:left;font-size:7px;white-space:nowrap}
  td{padding:2.5px 4px;border-bottom:1px solid #f3f4f6}
  tr:nth-child(even){background:#f9fafb}
  .tr{text-align:right}
  .fw{font-weight:bold}
  .desc{max-width:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
  .c6{color:#6b7280;font-size:6.5px}
  tfoot tr{background:#dbeafe!important;font-weight:bold;font-size:7.5px}
  .footer{margin-top:8px;text-align:center;font-size:6.5px;color:#9ca3af}
</style></head><body>
<h1>${titulos[tributacao] || titulos['todos']}</h1>
<h2>${company?.name || 'Todas as Empresas'}</h2>
<div class="info">Relatório emitido em: ${generatedAt}</div>
<div class="filters">
  <strong>Filtros Ativos:</strong>
  Período de.: ${periodoLabel} |
  Notas/Cupons Listados..: Transmitidas/Impressas (Vendas efetivas) |
  Origem do Documento..: NF-e / NFC-e |
  ST PIS/COFINS..: ${tributacaoLabel}${cfops.length > 0 ? ' | CFOP(s): ' + cfopLabel : ''}
</div>

<table>
  <thead>
    <tr>
      <th rowspan="2">Nota</th>
      <th rowspan="2">Data</th>
      <th rowspan="2">Cód.</th>
      <th rowspan="2">Produto</th>
      <th rowspan="2" class="tr">Qtd</th>
      <th rowspan="2" class="tr">V.Unit.</th>
      <th rowspan="2" class="tr">V.Total</th>
      <th colspan="4" style="text-align:center;background:#4b5563">Totais COFINS</th>
      <th colspan="4" style="text-align:center;background:#4b5563">Totais PIS</th>
      <th rowspan="2" class="tr">V.Pis/Cofins</th>
    </tr>
    <tr>
      <th class="tr">Bas.Cal.Cof</th><th class="tr">Aliq.</th><th class="tr">Base</th><th class="tr">V. Cofins</th>
      <th class="tr">Bas.Cal.Pis</th><th class="tr">Aliq.</th><th class="tr">Base</th><th class="tr">V. Pis</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr>
      <td colspan="4"><strong>Registros Listados = ${items.length} &nbsp;&nbsp; Total..</strong></td>
      <td></td><td></td>
      <td class="tr">${fmtCur(totalVProd)}</td>
      <td class="tr">${fmtCur(0)}</td><td></td><td></td>
      <td class="tr">${fmtCur(totalCOFINS)}</td>
      <td class="tr">${fmtCur(0)}</td><td></td><td></td>
      <td class="tr">${fmtCur(totalPIS)}</td>
      <td class="tr">${fmtCur(totalPIS + totalCOFINS)}</td>
    </tr>
  </tfoot>
</table>
<div class="footer">Fiscal Dashboard · Gerado automaticamente em ${generatedAt}</div>
</body></html>`

  // Gerar PDF via puppeteer (carregado dinamicamente para não travar o startup)
  const puppeteer = (await import('puppeteer')).default
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0' })
    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: false,
      margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
