import PDFDocument from 'pdfkit'
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

// ─── Relatório de Documentos Fiscais — gerado com PDFKit (compacto) ──────────

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

  const generatedAt = format(new Date(), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })
  const competenciaLabel = filters.competencia
    ? (() => { const [y, m] = filters.competencia.split('-'); return `${m}/${y}` })()
    : 'Todos os períodos'

  const saidas    = nfes.filter(n => n.tpNF === 1 && n.status !== 'CANCELADA')
  const entradas  = nfes.filter(n => n.tpNF === 0 && n.status !== 'CANCELADA')
  const canceladas = nfes.filter(n => n.status === 'CANCELADA')

  const totalSaidas   = saidas.reduce((s, n) => s + Number(n.vNF), 0)
  const totalEntradas = entradas.reduce((s, n) => s + Number(n.vNF), 0)
  const totalGeral    = totalSaidas + totalEntradas

  // ── PDFKit: PDF nativo, compacto, sem browser ──────────────────────────────
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const doc = new PDFDocument({ size: 'A4', margin: 30, compress: true })

    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Constantes de layout
    const PAGE_W = doc.page.width
    const L = 30   // margem esquerda
    const R = 30   // margem direita
    const TW = PAGE_W - L - R  // largura útil (~535pt)

    // Colunas: Emissão | Série | Número | Situação | Chave de acesso | Tipo | Valor (R$)
    const cols = [
      { label: 'Emissão',         w: 67,  align: 'left'  as const },
      { label: 'Série',           w: 28,  align: 'center'as const },
      { label: 'Número',          w: 42,  align: 'center'as const },
      { label: 'Situação',        w: 62,  align: 'left'  as const },
      { label: 'Chave de acesso', w: 258, align: 'left'  as const },
      { label: 'Tipo',            w: 28,  align: 'center'as const },
      { label: 'Valor (R$)',      w: TW - 67 - 28 - 42 - 62 - 258 - 28, align: 'right' as const },
    ]

    const ROW_H   = 12   // altura de cada linha de dados
    const HDR_H   = 14   // altura da linha de cabeçalho da tabela
    const FONT_SZ = 7    // fonte dados
    const HDR_SZ  = 7    // fonte cabeçalho
    const TOP_MARGIN = 30
    const BOT_MARGIN = 30

    // Helpers
    const pageBottom = () => doc.page.height - BOT_MARGIN

    function drawHeader() {
      let y = TOP_MARGIN
      // Título
      doc.font('Helvetica-Bold').fontSize(14)
        .text('RELATÓRIO DE DOCUMENTOS FISCAIS', L, y, { width: TW, align: 'center' })
      y += 20

      // Informações
      doc.font('Helvetica').fontSize(8)
      doc.text(`Empresa: ${company?.name || 'Todas as empresas'}`, L, y)
      y += 11
      if (company?.cnpj) {
        doc.text(`CNPJ: ${fmtCNPJ(company.cnpj)}`, L, y); y += 11
      }
      doc.text(`Competência: ${competenciaLabel}`, L, y); y += 11
      doc.text(`Gerado em: ${generatedAt}`, L, y); y += 11
      doc.text('Software responsável: Fiscal Dashboard', L, y); y += 16

      return y
    }

    function drawTableHeader(y: number): number {
      let x = L
      doc.font('Helvetica-Bold').fontSize(HDR_SZ)
      // fundo do cabeçalho
      doc.rect(L, y, TW, HDR_H).stroke()
      cols.forEach(col => {
        const pad = 2
        doc.rect(x, y, col.w, HDR_H).stroke()
        doc.text(col.label, x + pad, y + 3, { width: col.w - pad * 2, align: col.align, lineBreak: false })
        x += col.w
      })
      return y + HDR_H
    }

    function drawRow(n: typeof nfes[0], y: number, shade: boolean): number {
      let x = L
      if (shade) doc.rect(L, y, TW, ROW_H).fillAndStroke('#f5f5f5', 'white').stroke()
      doc.font('Helvetica').fontSize(FONT_SZ).fillColor('black')
      const values = [
        format(new Date(n.dhEmi), 'dd/MM/yyyy', { locale: ptBR }),
        String(n.serie),
        String(n.nNF),
        n.status,
        n.chNFe || '',
        String(n.mod),
        `R$ ${fmtCur(Number(n.vNF))}`,
      ]
      values.forEach((val, i) => {
        const col = cols[i]
        const pad = 2
        // borda lateral
        doc.rect(x, y, col.w, ROW_H).stroke()
        // texto (chave de acesso em fonte menor)
        const fs = i === 4 ? 5.5 : FONT_SZ
        doc.font(i === 4 ? 'Courier' : 'Helvetica').fontSize(fs)
        doc.text(val, x + pad, y + (ROW_H - fs) / 2, { width: col.w - pad * 2, align: col.align, lineBreak: false })
        x += col.w
      })
      doc.font('Helvetica').fillColor('black')
      return y + ROW_H
    }

    function drawSection(
      title: string,
      list: typeof nfes,
      total: number,
      startY: number
    ): number {
      if (list.length === 0) return startY

      let y = startY
      // checar espaço para heading
      if (y + 20 > pageBottom()) { doc.addPage(); y = drawHeader() }

      doc.font('Helvetica-Bold').fontSize(10).fillColor('black')
      doc.text(title, L, y); y += 12

      // cabeçalho da tabela
      if (y + HDR_H > pageBottom()) { doc.addPage(); y = drawHeader() }
      y = drawTableHeader(y)

      // linhas de dados
      list.forEach((n, idx) => {
        if (y + ROW_H > pageBottom()) {
          doc.addPage()
          y = drawHeader()
          y = drawTableHeader(y)
        }
        y = drawRow(n, y, idx % 2 === 1)
      })

      // linha de total
      if (y + ROW_H + 2 > pageBottom()) { doc.addPage(); y = drawHeader() }
      y += 2
      doc.rect(L, y, TW, ROW_H).stroke()
      doc.font('Helvetica-Bold').fontSize(FONT_SZ).fillColor('black')
      const totalLabel = `TOTAL ${title}`
      const colBeforeVal = TW - cols[cols.length - 1].w
      doc.text(totalLabel, L + 2, y + (ROW_H - FONT_SZ) / 2, { width: colBeforeVal - 4, align: 'right', lineBreak: false })
      doc.rect(L + colBeforeVal, y, cols[cols.length - 1].w, ROW_H).stroke()
      doc.text(`R$ ${fmtCur(total)}`, L + colBeforeVal + 2, y + (ROW_H - FONT_SZ) / 2, {
        width: cols[cols.length - 1].w - 4, align: 'right', lineBreak: false,
      })
      return y + ROW_H + 8
    }

    // ── Renderizar ──────────────────────────────────────────────────────────
    let y = drawHeader()

    y = drawSection('SAÍDAS', saidas, totalSaidas, y)
    y = drawSection('ENTRADAS', entradas, totalEntradas, y)
    y = drawSection('CANCELADAS', canceladas, canceladas.reduce((s, n) => s + Number(n.vNF), 0), y)

    // TOTAL GERAL
    if (y + ROW_H + 4 > pageBottom()) { doc.addPage(); y = drawHeader() }
    y += 4
    doc.font('Helvetica-Bold').fontSize(9).fillColor('black')
    doc.text('TOTAL GERAL', L, y, { width: TW - cols[cols.length - 1].w - 4, align: 'right', lineBreak: false })
    doc.rect(L + TW - cols[cols.length - 1].w, y - 1, cols[cols.length - 1].w, ROW_H + 2).stroke()
    doc.text(`R$ ${fmtCur(totalGeral)}`, L + TW - cols[cols.length - 1].w + 2, y + 1, {
      width: cols[cols.length - 1].w - 4, align: 'right', lineBreak: false,
    })

    doc.end()
  })
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
