import type ExcelJS from 'exceljs'
import prisma from '../../lib/prisma.js'
import { format } from 'date-fns'

interface ReportFilters {
  companyId?: string
  competencia?: string
  tpNF?: number
  status?: string
}

function formatCNPJ(cnpj: string | null | undefined): string {
  if (!cnpj) return ''
  const clean = cnpj.replace(/\D/g, '')
  if (clean.length !== 14) return cnpj
  return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
}

const headerStyle = { bold: true, color: { argb: 'FFFFFFFF' } }
const headerFill = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FF1E40AF' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyHeaderRow(row: any): void {
  row.font = headerStyle
  row.fill = headerFill
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  row.height = 20
}

function currencyFormat(): string {
  return '"R$"#,##0.00'
}

export async function generateExcel(filters: ReportFilters): Promise<Buffer> {
  const where: Record<string, unknown> = {}
  if (filters.companyId) where.companyId = filters.companyId
  if (filters.competencia) where.competencia = filters.competencia
  if (filters.tpNF !== undefined) where.tpNF = filters.tpNF
  if (filters.status) where.status = filters.status

  const nfes = await prisma.nfe.findMany({
    where,
    include: { items: true },
    orderBy: { dhEmi: 'asc' },
    take: 50000,
  })

  const company = filters.companyId
    ? await prisma.company.findUnique({ where: { id: filters.companyId } })
    : null

  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Fiscal Dashboard'
  workbook.created = new Date()

  // === Sheet 1: Resumo ===
  const resumoSheet = workbook.addWorksheet('Resumo', {
    properties: { tabColor: { argb: 'FF1E40AF' } },
  })

  resumoSheet.columns = [
    { key: 'label', width: 30 },
    { key: 'value', width: 20 },
  ]

  resumoSheet.addRow(['Fiscal Dashboard - Relatório de NF-e', ''])
  resumoSheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF1E40AF' } }
  resumoSheet.addRow([])

  resumoSheet.addRow(['Empresa', company?.name || 'Todas'])
  resumoSheet.addRow(['CNPJ', company ? formatCNPJ(company.cnpj) : 'Todos'])
  resumoSheet.addRow(['Competência', filters.competencia || 'Todos os períodos'])
  resumoSheet.addRow(['Gerado em', format(new Date(), 'dd/MM/yyyy HH:mm')])
  resumoSheet.addRow([])

  const totals = nfes.reduce(
    (acc, n) => ({
      vNF: acc.vNF + Number(n.vNF),
      vProd: acc.vProd + Number(n.vProd),
      vICMS: acc.vICMS + Number(n.vICMS),
      vICMSST: acc.vICMSST + Number(n.vICMSST),
      vIPI: acc.vIPI + Number(n.vIPI),
      vPIS: acc.vPIS + Number(n.vPIS),
      vCOFINS: acc.vCOFINS + Number(n.vCOFINS),
      total: nfes.length,
      entradas: acc.entradas + (n.tpNF === 0 ? 1 : 0),
      saidas: acc.saidas + (n.tpNF === 1 ? 1 : 0),
      canceladas: acc.canceladas + (n.status === 'CANCELADA' ? 1 : 0),
    }),
    {
      vNF: 0,
      vProd: 0,
      vICMS: 0,
      vICMSST: 0,
      vIPI: 0,
      vPIS: 0,
      vCOFINS: 0,
      total: 0,
      entradas: 0,
      saidas: 0,
      canceladas: 0,
    }
  )

  const summaryData = [
    ['Indicador', 'Valor'],
    ['Total NF-e', totals.total],
    ['Entradas', totals.entradas],
    ['Saídas', totals.saidas],
    ['Canceladas', totals.canceladas],
    ['Valor Total Produtos', totals.vProd],
    ['Valor Total NF-e', totals.vNF],
    ['ICMS', totals.vICMS],
    ['ICMS-ST', totals.vICMSST],
    ['IPI', totals.vIPI],
    ['PIS', totals.vPIS],
    ['COFINS', totals.vCOFINS],
    ['Total Impostos', totals.vICMS + totals.vICMSST + totals.vIPI + totals.vPIS + totals.vCOFINS],
  ]

  for (const [i, row] of summaryData.entries()) {
    const r = resumoSheet.addRow(row)
    if (i === 0) {
      applyHeaderRow(r)
    } else if (i >= 5) {
      r.getCell(2).numFmt = currencyFormat()
    }
  }

  // === Sheet 2: Notas ===
  const notasSheet = workbook.addWorksheet('Notas', {
    properties: { tabColor: { argb: 'FF059669' } },
  })

  notasSheet.columns = [
    { header: 'Tipo', key: 'tipo', width: 6 },
    { header: 'Mod', key: 'mod', width: 6 },
    { header: 'Série', key: 'serie', width: 8 },
    { header: 'Número', key: 'nNF', width: 12 },
    { header: 'Data Emissão', key: 'dhEmi', width: 14 },
    { header: 'Competência', key: 'competencia', width: 12 },
    { header: 'CNPJ Emitente', key: 'emitCnpj', width: 18 },
    { header: 'Emitente', key: 'emitNome', width: 35 },
    { header: 'CNPJ/CPF Dest.', key: 'destDoc', width: 18 },
    { header: 'Destinatário', key: 'destNome', width: 35 },
    { header: 'Nat. Operação', key: 'natOp', width: 30 },
    { header: 'Valor Produtos', key: 'vProd', width: 16 },
    { header: 'Desconto', key: 'vDesc', width: 14 },
    { header: 'Frete', key: 'vFrete', width: 14 },
    { header: 'ICMS', key: 'vICMS', width: 14 },
    { header: 'ICMS-ST', key: 'vICMSST', width: 14 },
    { header: 'IPI', key: 'vIPI', width: 14 },
    { header: 'PIS', key: 'vPIS', width: 14 },
    { header: 'COFINS', key: 'vCOFINS', width: 14 },
    { header: 'Valor NF-e', key: 'vNF', width: 16 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Chave', key: 'chNFe', width: 48 },
  ]

  applyHeaderRow(notasSheet.getRow(1))

  const currencyCols = [
    'vProd',
    'vDesc',
    'vFrete',
    'vICMS',
    'vICMSST',
    'vIPI',
    'vPIS',
    'vCOFINS',
    'vNF',
  ]

  for (const nfe of nfes) {
    const row = notasSheet.addRow({
      tipo: nfe.tpNF === 0 ? 'Entrada' : 'Saída',
      mod: nfe.mod,
      serie: nfe.serie,
      nNF: nfe.nNF,
      dhEmi: format(new Date(nfe.dhEmi), 'dd/MM/yyyy'),
      competencia: nfe.competencia,
      emitCnpj: formatCNPJ(nfe.emitCnpj),
      emitNome: nfe.emitNome,
      destDoc: nfe.destCnpj ? formatCNPJ(nfe.destCnpj) : nfe.destCpf || '',
      destNome: nfe.destNome || 'Consumidor Final',
      natOp: nfe.natOp || '',
      vProd: Number(nfe.vProd),
      vDesc: Number(nfe.vDesc),
      vFrete: Number(nfe.vFrete),
      vICMS: Number(nfe.vICMS),
      vICMSST: Number(nfe.vICMSST),
      vIPI: Number(nfe.vIPI),
      vPIS: Number(nfe.vPIS),
      vCOFINS: Number(nfe.vCOFINS),
      vNF: Number(nfe.vNF),
      status: nfe.status,
      chNFe: nfe.chNFe,
    })

    for (const col of currencyCols) {
      const cell = row.getCell(col)
      cell.numFmt = currencyFormat()
    }
  }

  notasSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 22 },
  }

  // === Sheet 3: Itens ===
  const itensSheet = workbook.addWorksheet('Itens', {
    properties: { tabColor: { argb: 'FFD97706' } },
  })

  itensSheet.columns = [
    { header: 'NF-e (Número)', key: 'nNF', width: 12 },
    { header: 'Data', key: 'dhEmi', width: 12 },
    { header: 'Nº Item', key: 'nItem', width: 8 },
    { header: 'Cód. Produto', key: 'cProd', width: 14 },
    { header: 'Descrição', key: 'xProd', width: 40 },
    { header: 'NCM', key: 'ncm', width: 12 },
    { header: 'CFOP', key: 'cfop', width: 8 },
    { header: 'Unidade', key: 'uCom', width: 8 },
    { header: 'Qtd', key: 'qCom', width: 12 },
    { header: 'Valor Unit.', key: 'vUnCom', width: 14 },
    { header: 'Valor Prod.', key: 'vProd', width: 14 },
    { header: 'CST ICMS', key: 'cstIcms', width: 10 },
    { header: 'CSOSN', key: 'csosnIcms', width: 10 },
    { header: 'BC ICMS', key: 'vBCIcms', width: 14 },
    { header: '% ICMS', key: 'pICMS', width: 10 },
    { header: 'ICMS', key: 'vICMS', width: 14 },
    { header: 'ICMS-ST', key: 'vST', width: 14 },
    { header: 'PIS', key: 'vPIS', width: 14 },
    { header: 'COFINS', key: 'vCOFINS', width: 14 },
    { header: 'IPI', key: 'vIPI', width: 14 },
  ]

  applyHeaderRow(itensSheet.getRow(1))

  for (const nfe of nfes) {
    for (const item of nfe.items) {
      const row = itensSheet.addRow({
        nNF: nfe.nNF,
        dhEmi: format(new Date(nfe.dhEmi), 'dd/MM/yyyy'),
        nItem: item.nItem,
        cProd: item.cProd || '',
        xProd: item.xProd,
        ncm: item.ncm || '',
        cfop: item.cfop,
        uCom: item.uCom || '',
        qCom: Number(item.qCom),
        vUnCom: Number(item.vUnCom),
        vProd: Number(item.vProd),
        cstIcms: item.cstIcms || '',
        csosnIcms: item.csosnIcms || '',
        vBCIcms: Number(item.vBCIcms),
        pICMS: Number(item.pICMS),
        vICMS: Number(item.vICMS),
        vST: Number(item.vST),
        vPIS: Number(item.vPIS),
        vCOFINS: Number(item.vCOFINS),
        vIPI: Number(item.vIPI),
      })

      for (const col of [
        'vUnCom',
        'vProd',
        'vBCIcms',
        'vICMS',
        'vST',
        'vPIS',
        'vCOFINS',
        'vIPI',
      ]) {
        row.getCell(col).numFmt = currencyFormat()
      }
    }
  }

  itensSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 20 },
  }

  // === Sheet 4: Impostos ===
  const impostosSheet = workbook.addWorksheet('Impostos', {
    properties: { tabColor: { argb: 'FFDC2626' } },
  })

  impostosSheet.columns = [
    { header: 'Competência', key: 'competencia', width: 14 },
    { header: 'Total NF-e', key: 'total', width: 12 },
    { header: 'Valor Total', key: 'vNF', width: 16 },
    { header: 'ICMS', key: 'vICMS', width: 16 },
    { header: 'ICMS-ST', key: 'vICMSST', width: 16 },
    { header: 'IPI', key: 'vIPI', width: 16 },
    { header: 'PIS', key: 'vPIS', width: 16 },
    { header: 'COFINS', key: 'vCOFINS', width: 16 },
    { header: 'Total Impostos', key: 'totalImpostos', width: 18 },
    { header: '% Carga Tributária', key: 'pctCarga', width: 18 },
  ]

  applyHeaderRow(impostosSheet.getRow(1))

  // Group by competencia
  const byComp = new Map<
    string,
    {
      total: number
      vNF: number
      vICMS: number
      vICMSST: number
      vIPI: number
      vPIS: number
      vCOFINS: number
    }
  >()

  for (const nfe of nfes) {
    const k = nfe.competencia
    const existing = byComp.get(k) || {
      total: 0,
      vNF: 0,
      vICMS: 0,
      vICMSST: 0,
      vIPI: 0,
      vPIS: 0,
      vCOFINS: 0,
    }
    existing.total++
    existing.vNF += Number(nfe.vNF)
    existing.vICMS += Number(nfe.vICMS)
    existing.vICMSST += Number(nfe.vICMSST)
    existing.vIPI += Number(nfe.vIPI)
    existing.vPIS += Number(nfe.vPIS)
    existing.vCOFINS += Number(nfe.vCOFINS)
    byComp.set(k, existing)
  }

  for (const [comp, data] of [...byComp.entries()].sort()) {
    const totalImpostos = data.vICMS + data.vICMSST + data.vIPI + data.vPIS + data.vCOFINS
    const pctCarga = data.vNF > 0 ? (totalImpostos / data.vNF) * 100 : 0

    const row = impostosSheet.addRow({
      competencia: comp,
      total: data.total,
      vNF: data.vNF,
      vICMS: data.vICMS,
      vICMSST: data.vICMSST,
      vIPI: data.vIPI,
      vPIS: data.vPIS,
      vCOFINS: data.vCOFINS,
      totalImpostos,
      pctCarga,
    })

    for (const col of ['vNF', 'vICMS', 'vICMSST', 'vIPI', 'vPIS', 'vCOFINS', 'totalImpostos']) {
      row.getCell(col).numFmt = currencyFormat()
    }
    row.getCell('pctCarga').numFmt = '0.00"%"'
  }

  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
