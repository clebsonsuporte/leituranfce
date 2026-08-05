import prisma from '../../lib/prisma.js'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function formatCurrency(val: number | string | null | undefined): string {
  const n = Number(val || 0)
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return ''
  const clean = cnpj.replace(/\D/g, '')
  if (clean.length !== 14) return cnpj
  return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

function formatChNFe(ch: string): string {
  return ch.replace(/(\d{4})/g, '$1 ').trim()
}

interface ReportFilters {
  companyId?: string
  competencia?: string
  dateFrom?: string
  dateTo?: string
  tpNF?: number
  status?: string
}

async function getSyntheticHtml(filters: ReportFilters): Promise<string> {
  const where: Record<string, unknown> = {}
  if (filters.companyId) where.companyId = filters.companyId
  if (filters.competencia) where.competencia = filters.competencia
  if (filters.tpNF !== undefined) where.tpNF = filters.tpNF
  if (filters.status) where.status = filters.status

  const nfes = await prisma.nfe.findMany({
    where,
    orderBy: { dhEmi: 'asc' },
  })

  const company = filters.companyId
    ? await prisma.company.findUnique({ where: { id: filters.companyId } })
    : null

  const totals = nfes.reduce(
    (acc, n) => ({
      vNF: acc.vNF + Number(n.vNF),
      vICMS: acc.vICMS + Number(n.vICMS),
      vICMSST: acc.vICMSST + Number(n.vICMSST),
      vIPI: acc.vIPI + Number(n.vIPI),
      vPIS: acc.vPIS + Number(n.vPIS),
      vCOFINS: acc.vCOFINS + Number(n.vCOFINS),
    }),
    { vNF: 0, vICMS: 0, vICMSST: 0, vIPI: 0, vPIS: 0, vCOFINS: 0 }
  )

  const entradas = nfes.filter((n) => n.tpNF === 0)
  const saidas = nfes.filter((n) => n.tpNF === 1)
  const canceladas = nfes.filter((n) => n.status === 'CANCELADA')

  const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #333; }
  h1 { font-size: 16px; color: #1e40af; margin-bottom: 4px; }
  h2 { font-size: 13px; color: #374151; margin: 16px 0 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }
  .header-info { color: #6b7280; font-size: 10px; }
  .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px; }
  .summary-card { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; background: #f9fafb; }
  .summary-card .label { color: #6b7280; font-size: 10px; text-transform: uppercase; }
  .summary-card .value { font-size: 14px; font-weight: bold; color: #1e40af; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  th { background: #1e40af; color: white; padding: 6px 8px; text-align: left; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
  tr:nth-child(even) { background: #f9fafb; }
  .total-row { background: #dbeafe !important; font-weight: bold; }
  .text-right { text-align: right; }
  .badge { padding: 2px 6px; border-radius: 9999px; font-size: 9px; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>Relatório Sintético de NF-e</h1>
    <div class="header-info">
      ${company ? `<strong>${company.name}</strong> - CNPJ: ${formatCNPJ(company.cnpj)}<br>` : ''}
      Competência: ${filters.competencia || 'Todos os períodos'} &nbsp;|&nbsp; Gerado em: ${generatedAt}
    </div>
  </div>
</div>

<h2>Resumo Executivo</h2>
<div class="summary-grid">
  <div class="summary-card">
    <div class="label">Total NF-e</div>
    <div class="value">${nfes.length}</div>
  </div>
  <div class="summary-card">
    <div class="label">Entradas</div>
    <div class="value">${entradas.length}</div>
  </div>
  <div class="summary-card">
    <div class="label">Saídas</div>
    <div class="value">${saidas.length}</div>
  </div>
  <div class="summary-card">
    <div class="label">Canceladas</div>
    <div class="value">${canceladas.length}</div>
  </div>
  <div class="summary-card">
    <div class="label">Valor Total NF-e</div>
    <div class="value">${formatCurrency(totals.vNF)}</div>
  </div>
  <div class="summary-card">
    <div class="label">Total Impostos</div>
    <div class="value">${formatCurrency(totals.vICMS + totals.vICMSST + totals.vIPI + totals.vPIS + totals.vCOFINS)}</div>
  </div>
</div>

<h2>Resumo por Imposto</h2>
<table>
  <thead>
    <tr>
      <th>Imposto</th>
      <th class="text-right">Valor Total</th>
      <th class="text-right">% sobre NF-e</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>ICMS</td><td class="text-right">${formatCurrency(totals.vICMS)}</td><td class="text-right">${totals.vNF ? ((totals.vICMS / totals.vNF) * 100).toFixed(2) + '%' : '0%'}</td></tr>
    <tr><td>ICMS-ST</td><td class="text-right">${formatCurrency(totals.vICMSST)}</td><td class="text-right">${totals.vNF ? ((totals.vICMSST / totals.vNF) * 100).toFixed(2) + '%' : '0%'}</td></tr>
    <tr><td>IPI</td><td class="text-right">${formatCurrency(totals.vIPI)}</td><td class="text-right">${totals.vNF ? ((totals.vIPI / totals.vNF) * 100).toFixed(2) + '%' : '0%'}</td></tr>
    <tr><td>PIS</td><td class="text-right">${formatCurrency(totals.vPIS)}</td><td class="text-right">${totals.vNF ? ((totals.vPIS / totals.vNF) * 100).toFixed(2) + '%' : '0%'}</td></tr>
    <tr><td>COFINS</td><td class="text-right">${formatCurrency(totals.vCOFINS)}</td><td class="text-right">${totals.vNF ? ((totals.vCOFINS / totals.vNF) * 100).toFixed(2) + '%' : '0%'}</td></tr>
    <tr class="total-row"><td>Total Impostos</td><td class="text-right">${formatCurrency(totals.vICMS + totals.vICMSST + totals.vIPI + totals.vPIS + totals.vCOFINS)}</td><td class="text-right">-</td></tr>
  </tbody>
</table>

<div class="footer">Fiscal Dashboard - Relatório gerado automaticamente em ${generatedAt}</div>
</body>
</html>`
}

async function getAnalyticalHtml(filters: ReportFilters): Promise<string> {
  const where: Record<string, unknown> = {}
  if (filters.companyId) where.companyId = filters.companyId
  if (filters.competencia) where.competencia = filters.competencia
  if (filters.tpNF !== undefined) where.tpNF = filters.tpNF
  if (filters.status) where.status = filters.status

  const nfes = await prisma.nfe.findMany({
    where,
    orderBy: { dhEmi: 'asc' },
    take: 1000,
  })

  const company = filters.companyId
    ? await prisma.company.findUnique({ where: { id: filters.companyId } })
    : null

  const generatedAt = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

  const rows = nfes
    .map((n) => {
      const statusBadge =
        n.status === 'AUTORIZADA'
          ? `<span class="badge badge-green">Autorizada</span>`
          : `<span class="badge badge-red">${n.status}</span>`

      return `<tr>
        <td>${n.tpNF === 0 ? 'E' : 'S'}</td>
        <td>${n.mod}</td>
        <td>${n.serie}</td>
        <td>${n.nNF}</td>
        <td>${format(new Date(n.dhEmi), 'dd/MM/yyyy')}</td>
        <td>${n.tpNF === 0 ? (n.emitNome || '') : (n.destNome || 'Consumidor Final')}</td>
        <td class="text-right">${formatCurrency(Number(n.vNF))}</td>
        <td class="text-right">${formatCurrency(Number(n.vICMS))}</td>
        <td class="text-right">${formatCurrency(Number(n.vPIS))}</td>
        <td class="text-right">${formatCurrency(Number(n.vCOFINS))}</td>
        <td>${statusBadge}</td>
      </tr>`
    })
    .join('')

  const totals = nfes.reduce(
    (acc, n) => ({
      vNF: acc.vNF + Number(n.vNF),
      vICMS: acc.vICMS + Number(n.vICMS),
      vPIS: acc.vPIS + Number(n.vPIS),
      vCOFINS: acc.vCOFINS + Number(n.vCOFINS),
    }),
    { vNF: 0, vICMS: 0, vPIS: 0, vCOFINS: 0 }
  )

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 9px; margin: 16px; color: #333; }
  h1 { font-size: 14px; color: #1e40af; }
  h2 { font-size: 11px; color: #374151; margin: 12px 0 6px; }
  .header-info { color: #6b7280; font-size: 9px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #1e40af; color: white; padding: 5px 6px; text-align: left; font-size: 9px; }
  td { padding: 4px 6px; border-bottom: 1px solid #f3f4f6; }
  tr:nth-child(even) { background: #f9fafb; }
  .total-row { background: #dbeafe !important; font-weight: bold; }
  .text-right { text-align: right; }
  .badge { padding: 1px 5px; border-radius: 9999px; font-size: 8px; }
  .badge-green { background: #d1fae5; color: #065f46; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .footer { margin-top: 16px; text-align: center; font-size: 8px; color: #9ca3af; }
</style>
</head>
<body>
<h1>Relatório Analítico de NF-e</h1>
<div class="header-info">
  ${company ? `<strong>${company.name}</strong> - CNPJ: ${formatCNPJ(company.cnpj)}<br>` : ''}
  Competência: ${filters.competencia || 'Todos os períodos'} &nbsp;|&nbsp; Total: ${nfes.length} notas &nbsp;|&nbsp; Gerado em: ${generatedAt}
</div>

<table>
  <thead>
    <tr>
      <th>Tp</th><th>Mod</th><th>Série</th><th>Nº</th><th>Data</th>
      <th>Emitente/Destinatário</th><th class="text-right">Valor NF</th>
      <th class="text-right">ICMS</th><th class="text-right">PIS</th>
      <th class="text-right">COFINS</th><th>Status</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr class="total-row">
      <td colspan="6"><strong>TOTAL (${nfes.length} notas)</strong></td>
      <td class="text-right"><strong>${formatCurrency(totals.vNF)}</strong></td>
      <td class="text-right"><strong>${formatCurrency(totals.vICMS)}</strong></td>
      <td class="text-right"><strong>${formatCurrency(totals.vPIS)}</strong></td>
      <td class="text-right"><strong>${formatCurrency(totals.vCOFINS)}</strong></td>
      <td></td>
    </tr>
  </tbody>
</table>

<div class="footer">Fiscal Dashboard - Relatório gerado automaticamente em ${generatedAt}</div>
</body>
</html>`
}

export async function generateSyntheticReport(filters: ReportFilters): Promise<Buffer> {
  const html = await getSyntheticHtml(filters)
  return htmlToPdf(html)
}

export async function generateAnalyticalReport(filters: ReportFilters): Promise<Buffer> {
  const html = await getAnalyticalHtml(filters)
  return htmlToPdf(html)
}

async function htmlToPdf(html: string): Promise<Buffer> {
  const puppeteer = (await import('puppeteer')).default
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    protocolTimeout: 300_000,
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 120_000 })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      timeout: 180_000,
      margin: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
