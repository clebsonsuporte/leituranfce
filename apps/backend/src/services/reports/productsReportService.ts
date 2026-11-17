import prisma from '../../lib/prisma.js'

export interface ProductsReportFilters {
  companyId?: string
  competencia?: string
  search?: string
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

const ncmFmt = (n: string) => /^\d{8}$/.test(n) ? `${n.slice(0, 4)}.${n.slice(4, 6)}.${n.slice(6)}` : n

function formatarCnpj(cnpj: string) {
  const d = cnpj.replace(/\D/g, '')
  return d.length === 14 ? d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : cnpj
}

function competenciaLabel(c: string) {
  const [y, m] = c.split('-')
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return m ? `${meses[parseInt(m, 10) - 1]}/${y}` : c
}

export async function buildProductsReport(f: ProductsReportFilters) {
  const whereNfe: Record<string, unknown> = {}
  if (f.companyId) whereNfe.companyId = f.companyId
  if (f.competencia) whereNfe.competencia = f.competencia

  const whereItem: Record<string, unknown> = { nfe: whereNfe }
  if (f.search) {
    whereItem.OR = [
      { xProd: { contains: f.search, mode: 'insensitive' } },
      { ncm: { contains: f.search } },
    ]
  }

  const [grupos, empresa] = await Promise.all([
    prisma.nfeItem.groupBy({
      by: ['xProd', 'ncm', 'cfop'],
      where: whereItem,
      orderBy: [{ xProd: 'asc' }, { ncm: 'asc' }, { cfop: 'asc' }],
    }),
    f.companyId
      ? prisma.company.findUnique({ where: { id: f.companyId }, select: { name: true, cnpj: true } })
      : null,
  ])

  const linhas = grupos.map((g, i) => {
    const ncmValido = !!g.ncm && /^\d{8}$/.test(g.ncm)
    return `<tr>
      <td class="idx">${i + 1}</td>
      <td>${esc(g.xProd)}</td>
      <td class="mono${ncmValido ? '' : ' erro'}">${esc(g.ncm ? ncmFmt(g.ncm) : 'sem NCM')}</td>
      <td class="mono">${esc(g.cfop)}</td>
    </tr>`
  }).join('')

  const agora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; }
  .cab { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-end; }
  h1 { font-size: 14px; margin: 0 0 3px; }
  .cab p { margin: 1px 0; font-size: 10px; }
  .dir { text-align: right; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 3px 6px; text-align: left; }
  th { background: #eee; font-size: 9px; text-transform: uppercase; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  tbody tr:nth-child(even) td { background: #f7f7f7; }
  .idx { color: #888; width: 28px; text-align: right; }
  .mono { font-family: "Courier New", monospace; white-space: nowrap; width: 1%; }
  .erro { color: #b91c1c; font-weight: bold; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>
<div class="cab">
  <div>
    <h1>Relatório de Produtos — NCM e CFOP</h1>
    <p><strong>${esc(empresa?.name ?? 'Todas as empresas')}</strong>${empresa ? ` — CNPJ ${esc(formatarCnpj(empresa.cnpj))}` : ''}</p>
  </div>
  <div class="dir">
    <p>Competência: <strong>${esc(f.competencia ? competenciaLabel(f.competencia) : 'Todas')}</strong></p>
    <p>${grupos.length} produto(s)${f.search ? ` · filtro "${esc(f.search)}"` : ''}</p>
    <p>Emitido em ${esc(agora)}</p>
  </div>
</div>
<table>
  <thead><tr><th class="idx">#</th><th>Produto</th><th>NCM</th><th>CFOP</th></tr></thead>
  <tbody>${linhas || '<tr><td colspan="4">Nenhum produto no período.</td></tr>'}</tbody>
</table>
</body></html>`

  const slug = (empresa?.name ?? 'todas-empresas').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
  return { html, filename: `produtos-ncm-cfop-${slug}-${f.competencia ?? 'geral'}.pdf` }
}
