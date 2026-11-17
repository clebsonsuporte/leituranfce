import { formatCNPJ, formatCompetencia, formatCurrency } from '@/lib/utils'
import {
  cfopValidationKey,
  type AuditItem,
  type CfopSegregacao,
  type CfopValidationResult,
  type PisCofinsCfopData,
  type ReformaPendentesData,
} from '@/hooks/useAudit'

export type PrintEscopo = 'itens' | 'pendencias' | 'pis-cofins'

interface PrintParams {
  escopo: PrintEscopo
  empresa: { name: string; cnpj: string } | null
  competencia?: string
  items: AuditItem[]
  cfopValidations: Record<string, CfopValidationResult>
  pisCofins?: PisCofinsCfopData
  reforma?: ReformaPendentesData
}

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

const NCM_STATUS: Record<string, string> = {
  compativel: 'Compatível',
  incompativel: 'INCOMPATÍVEL',
  incerto: 'Verificar',
}
const REGIME: Record<string, string> = { normal: 'Normal', st: 'Subst. Tributária', monofasico: 'Monofásico' }
const RISCO: Record<string, string> = { alto: 'Alto', medio: 'Atenção', ok: 'OK', nao_validado: 'Não validado' }
const TITULO: Record<PrintEscopo, string> = {
  itens: 'Relação de Itens com NCM',
  pendencias: 'Itens com Pendência Fiscal (NCM, CFOP e PIS/COFINS)',
  'pis-cofins': 'Segregação de PIS/COFINS por CFOP',
}

function tabelaItens(items: AuditItem[], cfopValidations: Record<string, CfopValidationResult>) {
  const linhas = items.map((i, idx) => {
    const ai = cfopValidations[cfopValidationKey(i)]
    const cfopObs = ai?.cfopSugerido ? `sugerido ${ai.cfopSugerido}` : ai?.status === 'incerto' ? 'verificar' : ''
    const pis = i.pisCofins
    return `<tr class="${i.risco === 'alto' ? 'alto' : ''}">
      <td class="n">${idx + 1}</td>
      <td>${esc(i.xProd)}</td>
      <td class="mono">${esc(i.ncm ?? '—')}</td>
      <td>${esc(i.ncmDesc ?? '')}${i.ncmStatus ? `<div class="obs">${esc(NCM_STATUS[i.ncmStatus])}${i.motivo && i.ncmStatus !== 'compativel' ? ` — ${esc(i.motivo)}` : ''}</div>` : ''}</td>
      <td>${esc(i.ncmSugerido ?? '')}</td>
      <td class="mono">${esc(i.cfop)}${cfopObs ? `<div class="obs">${esc(cfopObs)}</div>` : ''}</td>
      <td>${esc(REGIME[pis.regime])}${i.cstPis ? ` <span class="obs">(CST ${esc(i.cstPis)})</span>` : ''}${pis.divergencia ? `<div class="obs">${esc(pis.divergencia.mensagem)}</div>` : ''}</td>
      <td class="n">${i.count}</td>
      <td class="n">${esc(formatCurrency(i.vTotal))}</td>
      <td>${esc(RISCO[i.risco])}</td>
    </tr>`
  }).join('')

  return `<table>
    <thead><tr>
      <th class="n">#</th><th>Produto</th><th>NCM</th><th>Descrição do NCM / situação</th><th>NCM sugerido</th>
      <th>CFOP</th><th>PIS/COFINS</th><th class="n">Itens</th><th class="n">Valor</th><th>Risco</th>
    </tr></thead>
    <tbody>${linhas || '<tr><td colspan="10">Nenhum item.</td></tr>'}</tbody>
  </table>`
}

function tabelaCfop(data: PisCofinsCfopData) {
  const linha = (l: CfopSegregacao, total = false) => `<tr class="${total ? 'total' : ''}">
    <td>${total ? esc(l.descricao) : `<span class="mono">${esc(l.cfop)}</span> ${esc(l.descricao)}`}</td>
    <td class="n">${esc(formatCurrency(l.total))}</td>
    <td class="n">${esc(formatCurrency(l.normal))}</td>
    <td class="n">${esc(formatCurrency(l.st))}</td>
    <td class="n">${esc(formatCurrency(l.monofasico))}</td>
  </tr>`
  const saidas = data.cfops.filter(c => c.direcao === 'saida')
  const entradas = data.cfops.filter(c => c.direcao === 'entrada')
  const divergencias = data.divergencias.map(d => `<tr>
    <td>${esc(d.xProd)}</td><td class="mono">${esc(d.ncm ?? '—')}</td><td class="mono">${esc(d.cfop)}</td>
    <td class="mono">${esc(d.cstPis ?? '—')}</td>
    <td>${esc(d.mensagem)}${d.base ? `<div class="obs">Base legal: ${esc(d.base)}</div>` : ''}${d.verificar ? `<div class="obs">${esc(d.verificar)}</div>` : ''}</td>
    <td class="n">${esc(formatCurrency(d.valor))}</td>
  </tr>`).join('')

  return `<h2>PIS/COFINS por CFOP</h2>
  <p class="obs">Total = valor do CFOP · Normal = paga PIS e COFINS integralmente · Subst. Tributária = sujeito a ST de
  PIS/COFINS · Monofásico = incidência monofásica. Classificação pelo NCM do produto.</p>
  <table>
    <thead><tr><th>CFOP</th><th class="n">Total</th><th class="n">Normal</th><th class="n">Subst. Tributária</th><th class="n">Monofásico</th></tr></thead>
    <tbody>
      ${saidas.map(l => linha(l)).join('')}${saidas.length ? linha(data.totais.saida, true) : ''}
      ${entradas.map(l => linha(l)).join('')}${entradas.length ? linha(data.totais.entrada, true) : ''}
    </tbody>
  </table>
  ${divergencias ? `<h2>Produtos com PIS/COFINS divergente (${data.divergenciasTotal})</h2>
  <table>
    <thead><tr><th>Produto</th><th>NCM</th><th>CFOP</th><th>CST nota</th><th>Análise</th><th class="n">Valor</th></tr></thead>
    <tbody>${divergencias}</tbody>
  </table>` : ''}`
}

export function printAuditReport(p: PrintParams) {
  const items = p.escopo === 'pendencias'
    ? p.items.filter(i => i.risco === 'alto' || i.risco === 'medio')
    : p.items

  const reforma = p.reforma?.resumo.geral
  const corpo = [
    p.escopo !== 'pis-cofins' ? tabelaItens(items, p.cfopValidations) : '',
    p.escopo !== 'itens' && p.pisCofins ? tabelaCfop(p.pisCofins) : '',
    reforma && reforma.total > 0
      ? `<h2>Reforma Tributária</h2><p>${reforma.pendentes} de ${reforma.total} nota(s) do período sem os grupos IBS/CBS no XML (NT 2025.002-RTC).</p>`
      : '',
  ].join('')

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>${esc(TITULO[p.escopo])}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9px; color: #111; margin: 0; }
    h1 { font-size: 15px; margin: 0 0 2px; }
    h2 { font-size: 11px; margin: 14px 0 4px; }
    .cab { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: flex-end; }
    .cab p { margin: 0; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #bbb; padding: 3px 4px; text-align: left; vertical-align: top; }
    th { background: #eee; font-size: 8px; text-transform: uppercase; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .n { text-align: right; white-space: nowrap; }
    .mono { font-family: "Courier New", monospace; white-space: nowrap; }
    .obs { color: #555; font-size: 8px; }
    .alto td { background: #fdecec; }
    .total td { font-weight: bold; background: #f3f3f3; }
    .rodape { margin-top: 10px; color: #666; font-size: 8px; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style></head><body>
  <div class="cab">
    <div>
      <h1>${esc(TITULO[p.escopo])}</h1>
      <p><strong>${esc(p.empresa?.name ?? 'Todas as empresas')}</strong>${p.empresa ? ` — CNPJ ${esc(formatCNPJ(p.empresa.cnpj))}` : ''}</p>
    </div>
    <div style="text-align:right">
      <p>Competência: <strong>${esc(p.competencia ? formatCompetencia(p.competencia) : 'Todas')}</strong></p>
      <p>Emitido em ${esc(new Date().toLocaleString('pt-BR'))}</p>
    </div>
  </div>
  ${corpo}
  <p class="rodape">Análise automática por NCM, CFOP e CST de PIS/COFINS. Sugestões de NCM e CFOP geradas por IA — conferir antes de alterar o cadastro.</p>
  </body></html>`

  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  frame.srcdoc = html
  frame.onload = () => {
    const win = frame.contentWindow
    if (!win) return
    win.onafterprint = () => frame.remove()
    win.focus()
    win.print()
  }
  document.body.appendChild(frame)
}
