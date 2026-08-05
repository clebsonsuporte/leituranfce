/**
 * Análise fiscal detalhada de uma NF-e/NFC-e já importada: descreve o CFOP e
 * os códigos CST/CSOSN de cada item, e cruza o NCM de cada item com as regras
 * já vigentes da Reforma Tributária (LC 214/2025) para sinalizar se o item
 * está sujeito a Imposto Seletivo ou a alguma redução de alíquota prevista.
 *
 * Isto não recalcula tributos (isso é o Consultor Tributário manual, em
 * taxEngine.ts) — é uma leitura de prontidão sobre uma nota que já foi
 * emitida com as regras atuais (ICMS/PIS/COFINS), avisando o que muda com a
 * Reforma.
 */
import {
  CST_ICMS_DESCRICOES,
  CSOSN_DESCRICOES,
  CST_PIS_COFINS_DESCRICOES,
  REFORMA_TRIBUTARIA,
  descreverCfop,
} from './taxData.js'

interface NfeItemInput {
  nItem: number
  xProd: string
  ncm: string | null
  cfop: string
  cstIcms: string | null
  csosnIcms: string | null
  vBCIcms: unknown
  pICMS: unknown
  vICMS: unknown
  vST: unknown
  cstPis: string | null
  vPIS: unknown
  cstCofins: string | null
  vCOFINS: unknown
  vIPI: unknown
  tribIcms: string | null
  tribPis: string | null
  vProd: unknown
}

interface NfeInput {
  tpNF: number
  competencia: string
  xmlRaw: string
  items: NfeItemInput[]
  company?: { regime: string | null } | null
}

// Grupos introduzidos no leiaute da NF-e/NFC-e pela NT 2025.002-RTC (IBS/CBS/
// Imposto Seletivo — LC 214/2025). <IBSCBS> fica dentro de <det><imposto> em
// cada item; <IBSCBSTot> fica dentro de <total>; <cClassTrib> é o código de
// classificação tributária dentro de <IBSCBS>. A checagem é por presença da
// tag na abertura (evita casar "IBSCBSTot" ao procurar "IBSCBS").
function analisarConformidadeXmlReforma(xmlRaw: string, totalItens: number) {
  const xml = xmlRaw || ''
  const qtdIBSCBS = (xml.match(/<IBSCBS[\s>]/g) || []).length
  const temIBSCBSTot = /<IBSCBSTot[\s>]/.test(xml)
  const temCClassTrib = /<cClassTrib>/.test(xml)
  const temIBSCBS = qtdIBSCBS > 0

  const adequado = temIBSCBS && temIBSCBSTot && temCClassTrib

  return {
    temIBSCBS,
    itensComGrupoIBSCBS: qtdIBSCBS,
    totalItens,
    temIBSCBSTot,
    temCClassTrib,
    adequado,
  }
}

// Capítulos de bebidas (22) e tabaco (24) nunca entram na cesta básica —
// esses produtos são justamente os alvos do Imposto Seletivo (mutuamente
// exclusivo com a redução de essenciais).
const CAPITULOS_FORA_CESTA_BASICA = ['22', '24']

function reducaoAplicavelPorNcm(ncm: string | null): { descricao: string; reducao: number; base: string } | null {
  if (!ncm || !/^\d{8}$/.test(ncm)) return null
  const capituloStr = ncm.substring(0, 2)
  const capitulo = parseInt(capituloStr, 10)
  if (capitulo >= 1 && capitulo <= 23 && !CAPITULOS_FORA_CESTA_BASICA.includes(capituloStr)) {
    return REFORMA_TRIBUTARIA.reducoes.find((r) => r.reducao === 100) ?? null
  }
  if (capituloStr === '30') {
    return REFORMA_TRIBUTARIA.reducoes.find((r) => r.reducao === 60 && r.descricao.startsWith('Medicamentos')) ?? null
  }
  return null
}

function impostoSeletivoPorNcm(ncm: string | null) {
  if (!ncm) return null
  const capitulo = ncm.substring(0, 2)
  return REFORMA_TRIBUTARIA.impostoSeletivo.find((is) =>
    is.ncmPrefixos.some((p) => ncm.startsWith(p) || capitulo === p)
  ) ?? null
}

export function analisarFiscalNfe(nfe: NfeInput) {
  const anoAtual = new Date().getFullYear()
  const transicaoAtual =
    REFORMA_TRIBUTARIA.transicao.find((t) => t.ano === anoAtual) ??
    REFORMA_TRIBUTARIA.transicao[REFORMA_TRIBUTARIA.transicao.length - 1]

  const isSimples = (nfe.company?.regime ?? '').toLowerCase().includes('simples')

  const items = nfe.items.map((item) => {
    const cfopInfo = descreverCfop(item.cfop)
    const isItem = impostoSeletivoPorNcm(item.ncm)
    // IS e redução de essenciais são mutuamente exclusivos: um item taxado
    // como "nocivo" (bebida, tabaco, arma) não entra na cesta de essenciais.
    const reducaoItem = isItem ? null : reducaoAplicavelPorNcm(item.ncm)

    return {
      nItem: item.nItem,
      xProd: item.xProd,
      ncm: item.ncm,
      cfop: item.cfop,
      cfopDescricao: cfopInfo.descricao,
      cfopGrupo: cfopInfo.grupo,
      cfopEncontrado: cfopInfo.encontrado,
      icms: {
        cst: item.cstIcms,
        cstDescricao: item.cstIcms ? CST_ICMS_DESCRICOES[item.cstIcms] ?? null : null,
        csosn: item.csosnIcms,
        csosnDescricao: item.csosnIcms ? CSOSN_DESCRICOES[item.csosnIcms] ?? null : null,
        tributacao: item.tribIcms,
        vBC: Number(item.vBCIcms ?? 0),
        aliquota: Number(item.pICMS ?? 0),
        valor: Number(item.vICMS ?? 0),
        vST: Number(item.vST ?? 0),
      },
      pis: {
        cst: item.cstPis,
        cstDescricao: item.cstPis ? CST_PIS_COFINS_DESCRICOES[item.cstPis] ?? null : null,
        tributacao: item.tribPis,
        valor: Number(item.vPIS ?? 0),
      },
      cofins: {
        cst: item.cstCofins,
        cstDescricao: item.cstCofins ? CST_PIS_COFINS_DESCRICOES[item.cstCofins] ?? null : null,
        valor: Number(item.vCOFINS ?? 0),
      },
      ipi: { valor: Number(item.vIPI ?? 0) },
      reforma: {
        impostoSeletivo: isItem
          ? { aplicavel: true, aliquota: isItem.aliquota, descricao: isItem.descricao, base: isItem.base }
          : { aplicavel: false },
        reducao: reducaoItem
          ? { aplicavel: true, percentual: reducaoItem.reducao, descricao: reducaoItem.descricao, base: reducaoItem.base }
          : { aplicavel: false },
      },
    }
  })

  // Resumo de CFOPs usados na nota, com valor total por CFOP
  const cfopMap = new Map<string, { cfop: string; descricao: string; grupo: string; count: number; valorTotal: number }>()
  for (const item of nfe.items) {
    const info = descreverCfop(item.cfop)
    const acc = cfopMap.get(item.cfop) ?? { cfop: item.cfop, descricao: info.descricao, grupo: info.grupo, count: 0, valorTotal: 0 }
    acc.count += 1
    acc.valorTotal += Number(item.vProd ?? 0)
    cfopMap.set(item.cfop, acc)
  }
  const cfopResumo = Array.from(cfopMap.values()).sort((a, b) => b.valorTotal - a.valorTotal)

  const itensComImpostoSeletivo = items.filter((i) => i.reforma.impostoSeletivo.aplicavel)
  const itensComReducao = items.filter((i) => i.reforma.reducao.aplicavel)
  const itensSemNcmValido = items.filter((i) => !i.ncm || !/^\d{8}$/.test(i.ncm))
  const itensSemCstCsosn = items.filter((i) => !i.icms.cst && !i.icms.csosn)

  const xmlReforma = analisarConformidadeXmlReforma(nfe.xmlRaw, nfe.items.length)

  const parecerTecnico: Array<{ item: string; conforme: boolean; situacao: string }> = [
    { item: 'CFOP', conforme: nfe.items.every((i) => !!i.cfop), situacao: nfe.items.every((i) => !!i.cfop) ? 'Conforme' : 'Ausente em algum item' },
    { item: 'NCM', conforme: itensSemNcmValido.length === 0, situacao: itensSemNcmValido.length === 0 ? 'Conforme' : `${itensSemNcmValido.length} item(ns) sem NCM válido` },
    { item: 'CST/CSOSN (ICMS)', conforme: itensSemCstCsosn.length === 0, situacao: itensSemCstCsosn.length === 0 ? 'Conforme' : `${itensSemCstCsosn.length} item(ns) sem CST/CSOSN` },
    { item: 'Grupo IBSCBS (item)', conforme: xmlReforma.temIBSCBS, situacao: xmlReforma.temIBSCBS ? `Presente em ${xmlReforma.itensComGrupoIBSCBS}/${xmlReforma.totalItens} item(ns)` : 'Ausente — XML no padrão pré-reforma' },
    { item: 'Grupo IBSCBSTot (total)', conforme: xmlReforma.temIBSCBSTot, situacao: xmlReforma.temIBSCBSTot ? 'Presente' : 'Ausente — XML no padrão pré-reforma' },
    { item: 'cClassTrib', conforme: xmlReforma.temCClassTrib, situacao: xmlReforma.temCClassTrib ? 'Presente' : 'Ausente — XML no padrão pré-reforma' },
  ]

  const alertas: string[] = []
  alertas.push(
    xmlReforma.adequado
      ? `✅ XML já contempla os grupos técnicos da Reforma (IBSCBS/IBSCBSTot/cClassTrib) — emissor atualizado conforme NT 2025.002-RTC.`
      : `⚠️ XML no padrão pré-reforma — não contém IBSCBS/IBSCBSTot/cClassTrib. O sistema emissor (ERP/PDV) ainda não foi atualizado para a NT 2025.002-RTC.`
  )
  alertas.push(
    `Ano ${anoAtual}: CBS em ${transicaoAtual.cbs}% e IBS em ${transicaoAtual.ibs}% (${transicaoAtual.observacao}). LC 214/2025.`
  )
  if (itensComImpostoSeletivo.length > 0) {
    alertas.push(
      `${itensComImpostoSeletivo.length} item(ns) com NCM sujeito a Imposto Seletivo na Reforma — avaliar destaque do IS quando entrar em vigor.`
    )
  }
  if (itensComReducao.length > 0) {
    alertas.push(
      `${itensComReducao.length} item(ns) com NCM que pode ter redução de alíquota de CBS/IBS (ex.: cesta básica, medicamentos) — confirmar enquadramento exato.`
    )
  }
  if (itensSemNcmValido.length > 0) {
    alertas.push(
      `${itensSemNcmValido.length} item(ns) sem NCM válido (8 dígitos) — a classificação por NCM/NBS é a base do novo IBS/CBS, corrigir antes da transição plena.`
    )
  }
  if (itensSemCstCsosn.length > 0) {
    alertas.push(
      `${itensSemCstCsosn.length} item(ns) sem CST nem CSOSN de ICMS — regularizar para não repetir a lacuna quando IBS/CBS exigirem enquadramento equivalente.`
    )
  }
  if (isSimples) {
    alertas.push(`Empresa no Simples Nacional: CBS/IBS têm redução de ${REFORMA_TRIBUTARIA.cbs.reducaoSimples}% prevista, mas a apuração via Simples segue em definição pelo CGIBS.`)
  }

  const adequada = itensSemNcmValido.length === 0 && itensSemCstCsosn.length === 0

  return {
    anoAtual,
    transicaoAtual,
    items,
    cfopResumo,
    parecerTecnico,
    xmlReforma,
    reforma: {
      itensComImpostoSeletivo: itensComImpostoSeletivo.length,
      itensComReducao: itensComReducao.length,
      itensSemNcmValido: itensSemNcmValido.length,
      itensSemCstCsosn: itensSemCstCsosn.length,
      adequada,
      alertas,
    },
  }
}
