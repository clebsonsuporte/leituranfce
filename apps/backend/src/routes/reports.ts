import type { FastifyPluginAsync } from 'fastify'
import { randomBytes } from 'crypto'
import { generateSyntheticReport, generateAnalyticalReport } from '../services/reports/pdfService.js'
import { generateExcel } from '../services/reports/excelService.js'
import {
  generateEntradasSaidasReport,
  generatePisCofinsItemsReport,
} from '../services/reports/itemsReportService.js'
import { exportXmlZip } from '../services/reports/xmlExportService.js'

// In-memory store for generated reports (in production use Redis or S3)
const reportStore = new Map<
  string,
  { buffer: Buffer; filename: string; contentType: string; expiresAt: Date }
>()

// Cleanup expired reports every 5 minutes
setInterval(() => {
  const now = new Date()
  for (const [token, report] of reportStore.entries()) {
    if (report.expiresAt < now) {
      reportStore.delete(token)
    }
  }
}, 5 * 60 * 1000)

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /reports/generate
  fastify.post('/generate', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as {
      type: string
      format: string
      companyId?: string
      competencia?: string
      tpNF?: number
      status?: string
    }

    const { type = 'sintetico', format: fmt = 'pdf', companyId, competencia, tpNF, status } = body

    const filters = { companyId, competencia, tpNF, status }

    // Generate the report
    let buffer: Buffer
    let contentType: string
    let filename: string

    const timestamp = new Date().toISOString().slice(0, 10)

    // Determine if it's an items-level report (new types)
    const itemsReportTypes = ['entradas-saidas', 'monofasico-5102', 'monofasico-5405', 'st']
    const isItemsReport = itemsReportTypes.includes(type)

    try {
      if (type === 'xml-zip') {
        const result = await exportXmlZip(filters)
        buffer = result.buffer
        contentType = 'application/zip'
        filename = `xmls-${timestamp}.zip`
      } else if (isItemsReport) {
        // Items-level reports — PDF or CSV only
        const cfopMap: Record<string, string[]> = {
          'monofasico-5102': ['5102'],
          'monofasico-5405': ['5405', '6404'],
          'st': [],
          'entradas-saidas': [],
        }
        const tributacaoMap: Record<string, string> = {
          'monofasico-5102': 'monofasico',
          'monofasico-5405': 'monofasico',
          'st': 'st',
          'entradas-saidas': 'todos',
        }

        if (fmt === 'pdf') {
          if (type === 'entradas-saidas') {
            buffer = await generateEntradasSaidasReport(filters)
          } else {
            buffer = await generatePisCofinsItemsReport(filters, tributacaoMap[type], cfopMap[type])
          }
          contentType = 'application/pdf'
          filename = `${type}-${timestamp}.pdf`
        } else {
          // CSV for items reports
          buffer = await generateItemsCsv(filters, tributacaoMap[type], cfopMap[type], type)
          contentType = 'text/csv; charset=utf-8'
          filename = `${type}-${timestamp}.csv`
        }
      } else if (fmt === 'excel' || fmt === 'xlsx') {
        buffer = await generateExcel(filters)
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        filename = `relatorio-fiscal-${timestamp}.xlsx`
      } else if (fmt === 'pdf') {
        if (type === 'analitico') {
          buffer = await generateAnalyticalReport(filters)
        } else {
          buffer = await generateSyntheticReport(filters)
        }
        contentType = 'application/pdf'
        filename = `relatorio-${type}-${timestamp}.pdf`
      } else if (fmt === 'csv') {
        buffer = await generateCsv(filters)
        contentType = 'text/csv; charset=utf-8'
        filename = `notas-fiscais-${timestamp}.csv`
      } else {
        return reply.status(400).send({ error: 'Invalid format. Use: pdf, excel, csv' })
      }
    } catch (err) {
      console.error('Report generation error:', err)
      return reply.status(500).send({ error: 'Failed to generate report', details: (err as Error).message })
    }

    // Store with expiry
    const token = randomBytes(32).toString('hex')
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000) // 30 minutes

    reportStore.set(token, { buffer, filename, contentType, expiresAt })

    return reply.send({
      token,
      filename,
      expiresAt,
      downloadUrl: `/reports/download/${token}`,
    })
  })

  // GET /reports/download/:token — token is the auth (expires in 30min, single-use safe)
  fastify.get('/download/:token', async (request, reply) => {
    const { token } = request.params as { token: string }

    const report = reportStore.get(token)
    if (!report) {
      return reply.status(404).send({ error: 'Report not found or expired' })
    }

    if (report.expiresAt < new Date()) {
      reportStore.delete(token)
      return reply.status(410).send({ error: 'Report has expired' })
    }

    reply.header('Content-Type', report.contentType)
    reply.header('Content-Disposition', `attachment; filename="${report.filename}"`)
    reply.header('Content-Length', report.buffer.length)

    return reply.send(report.buffer)
  })
}

async function generateCsv(filters: {
  companyId?: string
  competencia?: string
  tpNF?: number
  status?: string
}): Promise<Buffer> {
  const { default: prisma } = await import('../lib/prisma.js')

  const where: Record<string, unknown> = {}
  if (filters.companyId) where.companyId = filters.companyId
  if (filters.competencia) where.competencia = filters.competencia
  if (filters.tpNF !== undefined) where.tpNF = filters.tpNF
  if (filters.status) where.status = filters.status

  const nfes = await prisma.nfe.findMany({
    where,
    orderBy: { dhEmi: 'asc' },
    take: 100000,
  })

  const headers = [
    'Tipo',
    'Mod',
    'Serie',
    'Numero',
    'Data Emissao',
    'Competencia',
    'CNPJ Emitente',
    'Emitente',
    'CNPJ/CPF Dest',
    'Destinatario',
    'Nat Operacao',
    'Valor Produtos',
    'Desconto',
    'Frete',
    'ICMS',
    'ICMS-ST',
    'IPI',
    'PIS',
    'COFINS',
    'Valor NF',
    'Status',
    'Chave',
  ]

  const formatCNPJ = (cnpj: string | null | undefined) => {
    if (!cnpj) return ''
    const clean = cnpj.replace(/\D/g, '')
    if (clean.length !== 14) return cnpj
    return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }

  const rows = nfes.map((n) => [
    n.tpNF === 0 ? 'Entrada' : 'Saida',
    n.mod,
    n.serie,
    n.nNF,
    new Date(n.dhEmi).toLocaleDateString('pt-BR'),
    n.competencia,
    formatCNPJ(n.emitCnpj),
    `"${(n.emitNome || '').replace(/"/g, '""')}"`,
    n.destCnpj ? formatCNPJ(n.destCnpj) : n.destCpf || '',
    `"${(n.destNome || 'Consumidor Final').replace(/"/g, '""')}"`,
    `"${(n.natOp || '').replace(/"/g, '""')}"`,
    Number(n.vProd).toFixed(2).replace('.', ','),
    Number(n.vDesc).toFixed(2).replace('.', ','),
    Number(n.vFrete).toFixed(2).replace('.', ','),
    Number(n.vICMS).toFixed(2).replace('.', ','),
    Number(n.vICMSST).toFixed(2).replace('.', ','),
    Number(n.vIPI).toFixed(2).replace('.', ','),
    Number(n.vPIS).toFixed(2).replace('.', ','),
    Number(n.vCOFINS).toFixed(2).replace('.', ','),
    Number(n.vNF).toFixed(2).replace('.', ','),
    n.status,
    n.chNFe,
  ])

  const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n')

  return Buffer.from('﻿' + csvContent, 'utf-8') // BOM for Excel compatibility
}

async function generateItemsCsv(
  filters: { companyId?: string; competencia?: string },
  tributacao: string,
  cfops: string[],
  type: string
): Promise<Buffer> {
  const { default: prisma } = await import('../lib/prisma.js')

  const whereNfe: Record<string, unknown> = {}
  if (filters.companyId) whereNfe.companyId = filters.companyId
  if (filters.competencia) whereNfe.competencia = filters.competencia

  const whereItem: Record<string, unknown> = { nfe: { ...whereNfe, tpNF: 1 } }
  if (cfops.length > 0) whereItem.cfop = { in: cfops }

  // Filter by tributacao type
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
    include: { nfe: { select: { nNF: true, dhEmi: true, competencia: true } } },
    orderBy: [{ nfe: { dhEmi: 'asc' } }, { nfe: { nNF: 'asc' } }],
    take: 100000,
  })

  const headers = ['Nota', 'Data', 'Cód.', 'Produto', 'Qtd', 'V.Unitário', 'V.Total',
    'Bas.Cal.COFINS', 'Aliq.COFINS', 'V.COFINS', 'Bas.Cal.PIS', 'Aliq.PIS', 'V.PIS', 'V.PIS/COFINS',
    'CFOP', 'CST ICMS', 'CSOSN', 'CST PIS', 'CST COFINS']

  const rows = items.map(i => [
    i.nfe.nNF,
    new Date(i.nfe.dhEmi).toLocaleDateString('pt-BR'),
    i.cProd || '',
    `"${(i.xProd || '').replace(/"/g, '""')}"`,
    Number(i.qCom).toFixed(3).replace('.', ','),
    Number(i.vUnCom).toFixed(2).replace('.', ','),
    Number(i.vProd).toFixed(2).replace('.', ','),
    Number(i.vBCIcms || 0).toFixed(2).replace('.', ','),
    '0,00%',
    Number(i.vCOFINS || 0).toFixed(2).replace('.', ','),
    Number(i.vBCIcms || 0).toFixed(2).replace('.', ','),
    '0,00%',
    Number(i.vPIS || 0).toFixed(2).replace('.', ','),
    (Number(i.vPIS || 0) + Number(i.vCOFINS || 0)).toFixed(2).replace('.', ','),
    i.cfop || '',
    i.cstIcms || '',
    i.csosnIcms || '',
    i.cstPis || '',
    i.cstCofins || '',
  ])

  const csv = [headers.join(';'), ...rows.map(r => r.join(';'))].join('\n')
  return Buffer.from('﻿' + csv, 'utf-8')
}

export default reportsRoutes
