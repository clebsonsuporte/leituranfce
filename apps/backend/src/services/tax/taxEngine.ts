/**
 * ============================================================
 * MOTOR DE INTELIGÊNCIA TRIBUTÁRIA — taxEngine.ts
 * ============================================================
 * Calcula tributos com base em NCM, origem/destino, regime e operação.
 *
 * Fontes legais embutidas em taxData.ts
 */

import {
  UF, RegimeTributario, TipoOperacao,
  ALIQUOTA_INTERNA_ICMS, FCP_ALIQUOTA,
  IPI_POR_CAPITULO, PRODUTOS_COM_ST,
  ESTADOS_SUL_SUDESTE_ORIGEM, ESTADOS_7PCT_DESTINO,
  sugerirCfop, sugerirCST, sugerirCSOSN, calcularPisCofins,
  REFORMA_TRIBUTARIA, BENEFICIOS_FISCAIS,
} from './taxData.js'

// ─── Input ───────────────────────────────────────────────────────────────────

export interface TaxConsultaInput {
  produto: string
  ncm: string                   // 8 dígitos
  origem: UF
  destino: UF
  regime: RegimeTributario
  tipoOperacao: TipoOperacao
  consumidorFinal: boolean
  importado: boolean            // produto de origem estrangeira
  cfopManual?: string
  valorUnitario?: number        // para cálculos de exemplo
}

// ─── Output ──────────────────────────────────────────────────────────────────

export interface TaxConsultaOutput {
  // ── Identificação ────────────────────────────────────────────────────────
  produto: string
  ncm: string
  ncmDescricao: string
  origem: UF
  destino: UF
  mesmaUF: boolean

  // ── ICMS ─────────────────────────────────────────────────────────────────
  icms: {
    tipoOperacao: string
    aliquotaInterestadual: number | null
    aliquotaInternaOrigem: number
    aliquotaInternaDestino: number
    aliquotaAplicada: number
    baseCalculo: string
    fundamentoLegal: string
    observacao?: string
  }

  // ── DIFAL ─────────────────────────────────────────────────────────────────
  difal: {
    aplicavel: boolean
    aliquotaDifal: number
    partilhaMgGov: string
    fundamentoLegal: string
    observacao?: string
  } | null

  // ── ICMS-ST ──────────────────────────────────────────────────────────────
  icmsST: {
    aplicavel: boolean
    produtos?: string
    convenio?: string
    observacao?: string
  }

  // ── FCP ──────────────────────────────────────────────────────────────────
  fcp: {
    aplicavel: boolean
    aliquota: number
    uf: UF
    observacao?: string
  } | null

  // ── IPI ──────────────────────────────────────────────────────────────────
  ipi: {
    aliquota: number
    capitulo: string
    descricaoCapitulo: string
    fundamentoLegal: string
    observacao?: string
  }

  // ── PIS/COFINS ───────────────────────────────────────────────────────────
  pisCofins: {
    regimePis: string
    aliquotaPis: number
    regimeCofins: string
    aliquotaCofins: number
    cstPis: string
    cstCofins: string
    observacao: string
  }

  // ── CST / CSOSN ──────────────────────────────────────────────────────────
  cst: Array<{ cst: string; descricao: string; observacao?: string }>
  csosn: Array<{ csosn: string; descricao: string; observacao?: string }>

  // ── CFOP ─────────────────────────────────────────────────────────────────
  cfopSugestoes: Array<{ cfop: string; descricao: string; observacao?: string }>

  // ── Benefícios Fiscais ───────────────────────────────────────────────────
  beneficiosFiscais: string[]

  // ── Reforma Tributária ───────────────────────────────────────────────────
  reformaTributaria: {
    cbs: {
      aliquota: number
      anoVigor: number
      observacao: string
    }
    ibs: {
      aliquotaEstimada: number
      anoVigorPleno: number
      observacao: string
    }
    impostoSeletivo: {
      aplicavel: boolean
      aliquota?: number
      descricao?: string
      baseLegal?: string
    }
    reducoes: Array<{ descricao: string; reducao: number; base: string }>
    transicaoAtual: { ano: number; cbs: number; ibs: number; observacao: string }
    impactoComparativo: {
      tributoAtualEstimado: number
      tributoReformaEstimado: number
      variacaoPercentual: number
      observacao: string
    }
  }

  // ── Alerta / Observações Gerais ──────────────────────────────────────────
  alertas: string[]
  fontesDados: string[]
}

// ─── Engine principal ────────────────────────────────────────────────────────

export function calcularTributos(input: TaxConsultaInput): TaxConsultaOutput {
  const {
    produto, ncm, origem, destino, regime,
    tipoOperacao, consumidorFinal, importado,
  } = input

  const mesmaUF = origem === destino
  const ncmCapitulo = ncm.substring(0, 2)
  const ncmSubcapitulo = ncm.substring(0, 4)
  const alertas: string[] = []

  // ── NCM — descrição ──────────────────────────────────────────────────────
  const ncmData = IPI_POR_CAPITULO[ncmCapitulo]
  const ncmDescricao = ncmData?.descricao ?? `Capítulo ${ncmCapitulo} — consulte TIPI oficial`

  // ── Verificar ST ─────────────────────────────────────────────────────────
  const stItem = PRODUTOS_COM_ST.find(s =>
    s.ncmPrefixos.some(p => ncm.startsWith(p) || ncmCapitulo === p)
  )
  const temST = !!stItem

  // ── ICMS ─────────────────────────────────────────────────────────────────
  const aliquotaInternaOrigem  = ALIQUOTA_INTERNA_ICMS[origem]
  const aliquotaInternaDestino = ALIQUOTA_INTERNA_ICMS[destino]

  let aliquotaICMS: number
  let tipoOpICMS: string
  let fundamentoICMS: string
  let observacaoICMS: string | undefined

  if (mesmaUF) {
    aliquotaICMS = aliquotaInternaOrigem
    tipoOpICMS = 'Operação interna'
    fundamentoICMS = `Legislação estadual ${origem} (alíquota interna)`
  } else {
    if (importado) {
      aliquotaICMS = 4
      tipoOpICMS = 'Operação interestadual — produto importado'
      fundamentoICMS = 'Resolução SENADO 13/2012 — alíquota 4% para importados'
    } else {
      const origemSSNE = (ESTADOS_SUL_SUDESTE_ORIGEM as readonly string[]).includes(origem)
      const destino7   = (ESTADOS_7PCT_DESTINO as readonly string[]).includes(destino)
      aliquotaICMS = origemSSNE && destino7 ? 7 : 12
      tipoOpICMS = 'Operação interestadual'
      fundamentoICMS = 'Resolução SENADO 22/1989'
      if (aliquotaICMS === 7) {
        observacaoICMS = `Sul/Sudeste → Norte/Nordeste/CO/ES — 7%`
      }
    }
  }

  // Isenção exportação
  if (tipoOperacao === 'exportacao') {
    aliquotaICMS = 0
    tipoOpICMS = 'Exportação — imune'
    fundamentoICMS = 'Art. 155, §2°, X, "a", CF/88 — imunidade nas exportações'
  }

  // ── DIFAL ────────────────────────────────────────────────────────────────
  let difal: TaxConsultaOutput['difal'] = null

  if (!mesmaUF && consumidorFinal && tipoOperacao === 'venda') {
    const aliquotaDifal = aliquotaInternaDestino - aliquotaICMS
    if (aliquotaDifal > 0) {
      difal = {
        aplicavel: true,
        aliquotaDifal: Math.max(aliquotaDifal, 0),
        partilhaMgGov: '100% para o estado de destino (após 2019)',
        fundamentoLegal: 'EC 87/2015 — LC 190/2022 — DIFAL e-commerce e não contribuintes',
        observacao:
          `DIFAL = Alíquota interna destino (${aliquotaInternaDestino}%) - Alíquota interestadual (${aliquotaICMS}%) = ${aliquotaDifal.toFixed(1)}%. ` +
          `A partir de 01/04/2022 (LC 190/2022): 100% para o estado de destino. ` +
          (FCP_ALIQUOTA[destino] ? `Acrescido FCP de ${FCP_ALIQUOTA[destino]}% se aplicável.` : ''),
      }
    }
  }

  // ── ICMS-ST ──────────────────────────────────────────────────────────────
  const icmsST: TaxConsultaOutput['icmsST'] = {
    aplicavel: temST && tipoOperacao !== 'exportacao',
    produtos: stItem?.descricao,
    convenio: stItem?.convenio,
    observacao: temST
      ? `NCM ${ncmSubcapitulo} está sujeito a ST. Verificar protocolo bilateral entre ${origem} e ${destino}.`
      : 'NCM não identificado como sujeito a ST em convênios nacionais. Verificar legislação estadual específica.',
  }

  // ── FCP ──────────────────────────────────────────────────────────────────
  let fcp: TaxConsultaOutput['fcp'] = null
  const fcpAliq = FCP_ALIQUOTA[mesmaUF ? origem : destino]
  if (fcpAliq && fcpAliq > 0 && tipoOperacao !== 'exportacao') {
    const ufFcp = mesmaUF ? origem : destino
    fcp = {
      aplicavel: true,
      aliquota: fcpAliq,
      uf: ufFcp,
      observacao: `FCP de ${fcpAliq}% aplicável em ${ufFcp}. Verificar lista de produtos específicos sujeitos ao FCP na legislação estadual.`,
    }
  }

  // ── IPI ──────────────────────────────────────────────────────────────────
  const ipiCapData = IPI_POR_CAPITULO[ncmCapitulo] ?? { aliquota: 0, descricao: 'Não mapeado' }
  const ipiIsento = tipoOperacao === 'exportacao' || regime === 'simples' || regime === 'mei'
  const ipi = {
    aliquota: ipiIsento ? 0 : ipiCapData.aliquota,
    capitulo: ncmCapitulo,
    descricaoCapitulo: ipiCapData.descricao,
    fundamentoLegal: 'TIPI — Decreto 11.158/2022 e Decreto 11.852/2023',
    observacao: ipiIsento
      ? (tipoOperacao === 'exportacao' ? 'Exportação — imune ao IPI (Lei 8.402/1992)' : 'Simples Nacional — IPI incluído no DAS para indústria')
      : `Alíquota estimada pelo capítulo NCM ${ncmCapitulo}. Consulte TIPI completa para alíquota exata do NCM ${ncm}.`,
  }

  // ── PIS/COFINS ───────────────────────────────────────────────────────────
  const pisCofins = calcularPisCofins({ regime, operacao: tipoOperacao, ncmCapitulo })

  // ── CST / CSOSN ──────────────────────────────────────────────────────────
  const cst = sugerirCST({
    operacao: tipoOperacao,
    temST,
    isento: tipoOperacao === 'exportacao',
    reduzido: false,
    diferido: false,
    importado,
  })

  const csosn = sugerirCSOSN({
    operacao: tipoOperacao,
    temST,
    isento: tipoOperacao === 'exportacao',
    cobraST: temST && tipoOperacao !== 'exportacao',
    importado,
  })

  // ── CFOP ─────────────────────────────────────────────────────────────────
  const cfopSugestoes = sugerirCfop({
    tipoOperacao,
    mesmaUF,
    consumidorFinal,
    temST,
    importado,
    regime,
  })

  // ── Benefícios Fiscais ───────────────────────────────────────────────────
  const beneficiosOrigem  = BENEFICIOS_FISCAIS[origem] ?? []
  const beneficiosDestino = mesmaUF ? [] : (BENEFICIOS_FISCAIS[destino] ?? [])
  const beneficiosFiscais = [
    ...beneficiosOrigem.map(b => `[${origem}] ${b}`),
    ...beneficiosDestino.map(b => `[${destino}] ${b}`),
  ]

  // ── Reforma Tributária ───────────────────────────────────────────────────
  const anoAtual = new Date().getFullYear()
  const transicaoAtual = REFORMA_TRIBUTARIA.transicao.find(t => t.ano === anoAtual)
    ?? REFORMA_TRIBUTARIA.transicao[REFORMA_TRIBUTARIA.transicao.length - 1]

  // Imposto Seletivo
  const isItem = REFORMA_TRIBUTARIA.impostoSeletivo.find(is =>
    is.ncmPrefixos.some(p => ncm.startsWith(p) || ncmCapitulo === p)
  )

  // Reduções aplicáveis
  const reducoesAplicaveis = REFORMA_TRIBUTARIA.reducoes.filter(r => {
    // Heurística simples — alimentos cap. 01-23
    const capNum = parseInt(ncmCapitulo, 10)
    if (r.reducao === 100 && capNum >= 1 && capNum <= 23) return true
    if (r.reducao === 60 && (ncmCapitulo === '30')) return true
    return false
  })

  // Calcular impacto comparativo (estimativa)
  const valorBase = 100 // R$ 100 de base para comparação
  const totalAtual =
    (aliquotaICMS / 100) * valorBase +
    (ipi.aliquota / 100) * valorBase +
    (pisCofins.aliquotaPis / 100) * valorBase +
    (pisCofins.aliquotaCofins / 100) * valorBase +
    (difal ? (difal.aliquotaDifal / 100) * valorBase : 0)

  const reducaoReforma = reducoesAplicaveis.length > 0
    ? (reducoesAplicaveis[0].reducao / 100)
    : 0

  const aliquotaIBSef = transicaoAtual.ibs * (1 - reducaoReforma)
  const aliquotaCBSef = transicaoAtual.cbs * (1 - reducaoReforma)
  const isAliq = isItem?.aliquota ?? 0

  const totalReforma =
    (aliquotaIBSef / 100) * valorBase +
    (aliquotaCBSef / 100) * valorBase +
    (isAliq / 100) * valorBase

  const variacaoPercentual = totalAtual > 0
    ? ((totalReforma - totalAtual) / totalAtual) * 100
    : 0

  const reformaTributaria: TaxConsultaOutput['reformaTributaria'] = {
    cbs: {
      aliquota: transicaoAtual.cbs,
      anoVigor: anoAtual,
      observacao: `CBS ${transicaoAtual.cbs}% em ${anoAtual}. Substitui PIS/COFINS. LC 214/2025, art. 99.`,
    },
    ibs: {
      aliquotaEstimada: transicaoAtual.ibs,
      anoVigorPleno: 2033,
      observacao: `IBS ${transicaoAtual.ibs}% estimado em ${anoAtual} (transição). Substitui ICMS e ISS. Total pleno estimado: ~${REFORMA_TRIBUTARIA.ibs.aliquotaEstimadaTotal}% em 2033. Alíquota definitiva definida pelo CGIBS.`,
    },
    impostoSeletivo: {
      aplicavel: !!isItem,
      aliquota: isItem?.aliquota,
      descricao: isItem?.descricao,
      baseLegal: isItem?.base,
    },
    reducoes: reducoesAplicaveis,
    transicaoAtual,
    impactoComparativo: {
      tributoAtualEstimado: parseFloat(totalAtual.toFixed(2)),
      tributoReformaEstimado: parseFloat(totalReforma.toFixed(2)),
      variacaoPercentual: parseFloat(variacaoPercentual.toFixed(1)),
      observacao:
        `Comparativo para R$ ${valorBase} de base. Estimativa do período ${anoAtual} de transição. ` +
        `${variacaoPercentual > 0 ? '▲ Carga maior' : '▼ Carga menor'} com a Reforma em ${anoAtual}. ` +
        `Valor final depende da alíquota definitiva do CGIBS (não publicada ainda).`,
    },
  }

  // ── Alertas ──────────────────────────────────────────────────────────────
  if (temST) {
    alertas.push(`⚠️ Produto sujeito a Substituição Tributária (${stItem?.convenio}). Verificar protocolo bilateral ${origem}/${destino}.`)
  }
  if (difal?.aplicavel) {
    alertas.push(`⚠️ DIFAL aplicável: ${difal.aliquotaDifal.toFixed(1)}% para ${destino}. Emitir NF-e com DIFAL destacado.`)
  }
  if (importado && !mesmaUF && aliquotaICMS === 4) {
    alertas.push(`ℹ️ Produto importado: alíquota interestadual 4% (Res. SENADO 13/2012). Verificar similaridade nacional (CAMEX).`)
  }
  if (ncmCapitulo === '30') {
    alertas.push(`ℹ️ Produtos farmacêuticos: verificar lista de medicamentos com alíquota zero (Decreto 9.913/2019 e atualizações).`)
  }
  if (anoAtual >= 2026) {
    alertas.push(`📋 REFORMA TRIBUTÁRIA em vigência: CBS ${transicaoAtual.cbs}% e IBS ${transicaoAtual.ibs}% em ${anoAtual} (período de transição).`)
  } else {
    alertas.push(`📋 REFORMA TRIBUTÁRIA: LC 214/2025 entra em vigor em 2026. Planeje a transição.`)
  }
  if (isItem) {
    alertas.push(`⚠️ Imposto Seletivo (IS) de ${isItem.aliquota}% previsto para este NCM na Reforma Tributária.`)
  }

  const fontesDados = [
    'Resolução SENADO 22/1989 — ICMS interestadual',
    'Resolução SENADO 13/2012 — ICMS 4% importados',
    'EC 87/2015 — DIFAL consumidor final',
    'LC 190/2022 — DIFAL e-commerce e não contribuintes',
    'Decreto 11.158/2022 e 11.852/2023 — TIPI/IPI',
    'Leis 10.637/2002 e 10.833/2003 — PIS/COFINS não cumulativo',
    'Lei 9.718/1998 — PIS/COFINS cumulativo',
    'LC 214/2025 — IBS, CBS e Imposto Seletivo',
    'Ajuste SINIEF 07/2001 — CFOP',
    'Convênio ICMS 92/2015 — lista de produtos com ST',
    'Legislações estaduais vigentes — alíquotas internas ICMS',
  ]

  return {
    produto,
    ncm,
    ncmDescricao,
    origem,
    destino,
    mesmaUF,
    icms: {
      tipoOperacao: tipoOpICMS,
      aliquotaInterestadual: mesmaUF ? null : aliquotaICMS,
      aliquotaInternaOrigem,
      aliquotaInternaDestino,
      aliquotaAplicada: aliquotaICMS,
      baseCalculo: 'Valor da operação (podendo incluir IPI, frete, seguros conforme legislação)',
      fundamentoLegal: fundamentoICMS,
      observacao: observacaoICMS,
    },
    difal,
    icmsST,
    fcp,
    ipi,
    pisCofins,
    cst,
    csosn,
    cfopSugestoes,
    beneficiosFiscais,
    reformaTributaria,
    alertas,
    fontesDados,
  }
}
