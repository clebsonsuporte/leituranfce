/**
 * ============================================================
 * DADOS TRIBUTÁRIOS OFICIAIS — Motor de Inteligência Tributária
 * ============================================================
 *
 * Fontes:
 *  - ICMS interestadual: Resolução SENADO 22/1989 e 13/2012
 *  - Alíquotas internas: legislações estaduais vigentes
 *  - FCP: legislações estaduais
 *  - IPI/TIPI: Decreto 11.158/2022 e atualizações
 *  - PIS/COFINS: Leis 10.637/2002 e 10.833/2003
 *  - Reforma Tributária: LC 214/2025 (IBS, CBS e IS)
 *  - CFOP: Ajuste SINIEF 07/2001 e atualizações
 *  - DIFAL: LC 190/2022 (EC 87/2015)
 */

export type UF =
  | 'AC' | 'AL' | 'AP' | 'AM' | 'BA' | 'CE' | 'DF' | 'ES' | 'GO'
  | 'MA' | 'MT' | 'MS' | 'MG' | 'PA' | 'PB' | 'PR' | 'PE' | 'PI'
  | 'RJ' | 'RN' | 'RS' | 'RO' | 'RR' | 'SC' | 'SP' | 'SE' | 'TO'

export type RegimeTributario = 'simples' | 'lucro_presumido' | 'lucro_real' | 'mei'
export type TipoOperacao = 'venda' | 'transferencia' | 'devolucao' | 'remessa' | 'importacao' | 'exportacao'

// ─── ICMS INTERESTADUAL ──────────────────────────────────────────────────────
// Resolução SENADO 22/1989 — tabela de alíquotas interestaduais

// Estados Sul e Sudeste (exceto ES para efeito da alíquota de 7%)
export const ESTADOS_SUL_SUDESTE_ORIGEM = ['SP', 'RJ', 'MG', 'PR', 'SC', 'RS'] as const

// Destinatários da alíquota de 7% (Norte, Nordeste, Centro-Oeste + ES)
export const ESTADOS_7PCT_DESTINO = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS',
  'PA','PB','PE','PI','RN','RO','RR','SE','TO'
] as const

/**
 * Alíquotas ICMS internas por UF (alíquota geral/modal - 2025)
 * Fonte: legislações estaduais vigentes
 */
export const ALIQUOTA_INTERNA_ICMS: Record<UF, number> = {
  AC: 19,    // Lei 1.481/2002 e alterações
  AL: 19,    // Lei 5.900/1996 e alterações
  AP: 18,    // Lei 400/1997 e alterações
  AM: 20,    // Lei 2.826/2003 e alterações
  BA: 20.5,  // Lei 7.014/1996 e alterações
  CE: 20,    // Lei 12.670/1996 e alterações
  DF: 20,    // Lei 1.254/1996 e alterações
  ES: 17,    // Lei 7.000/2001 e alterações
  GO: 19,    // Lei 11.651/1991 e alterações
  MA: 22,    // Lei 7.799/2002 e alterações
  MT: 17,    // Lei 7.098/1998 e alterações
  MS: 17,    // Lei 1.810/1997 e alterações
  MG: 18,    // Lei 6.763/1975 e alterações (Lei 23.081/2018)
  PA: 19,    // Lei 5.530/1989 e alterações
  PB: 20,    // Lei 6.379/1996 e alterações
  PR: 19,    // Lei 11.580/1996 e alterações (Decreto 7.871/2017)
  PE: 20.5,  // Lei 15.730/2016 e alterações
  PI: 21,    // Lei 4.257/1989 e alterações
  RJ: 22,    // Lei 2.657/1996 e alterações
  RN: 20,    // Lei 7.117/1997 e alterações
  RS: 17,    // Lei 8.820/1989 e alterações
  RO: 19.5,  // Lei 688/1996 e alterações
  RR: 20,    // Lei 59/1993 e alterações
  SC: 17,    // Lei 10.297/1996 e alterações
  SP: 18,    // Lei 6.374/1989 e alterações (Decreto 65.254/2020)
  SE: 19,    // Lei 3.796/1996 e alterações
  TO: 20,    // Lei 1.287/2001 e alterações
}

/**
 * FCP — Fundo de Combate à Pobreza
 * Alíquotas por UF (sobre produtos sujeitos ao FCP)
 * Fonte: legislações estaduais vigentes
 */
export const FCP_ALIQUOTA: Partial<Record<UF, number>> = {
  AL: 2, AM: 2, BA: 2, CE: 2, DF: 2, GO: 2,
  MA: 2, PA: 2, PB: 2, PE: 2, PI: 2, RJ: 2,
  RN: 2, RO: 2, SE: 2, TO: 2, MG: 2, PR: 2,
  SP: 2, MT: 2, MS: 2, ES: 2, SC: 2, RS: 2,
  RR: 2, AP: 2, AC: 2,
}

// ─── IPI POR CAPÍTULO NCM (TIPI) ───────────────────────────────────────────
// Decreto 11.158/2022 — alíquota mais comum por capítulo NCM
// Nota: dentro de cada capítulo há variações por item. Esta tabela
// mostra a alíquota mais frequente do capítulo para estimativa inicial.
export const IPI_POR_CAPITULO: Record<string, { aliquota: number; descricao: string }> = {
  '01': { aliquota: 0,   descricao: 'Animais vivos' },
  '02': { aliquota: 0,   descricao: 'Carnes e miudezas comestíveis' },
  '03': { aliquota: 0,   descricao: 'Peixes e crustáceos' },
  '04': { aliquota: 0,   descricao: 'Leite e laticínios, ovos' },
  '05': { aliquota: 0,   descricao: 'Outros produtos de origem animal' },
  '06': { aliquota: 0,   descricao: 'Plantas vivas e floricultura' },
  '07': { aliquota: 0,   descricao: 'Produtos hortícolas' },
  '08': { aliquota: 0,   descricao: 'Frutas' },
  '09': { aliquota: 0,   descricao: 'Café, chá, mate e especiarias' },
  '10': { aliquota: 0,   descricao: 'Cereais' },
  '11': { aliquota: 0,   descricao: 'Produtos da moagem' },
  '12': { aliquota: 0,   descricao: 'Sementes e frutos oleaginosos' },
  '13': { aliquota: 0,   descricao: 'Gomas, resinas e sucos' },
  '14': { aliquota: 0,   descricao: 'Matérias para entrançar' },
  '15': { aliquota: 0,   descricao: 'Gorduras e óleos' },
  '16': { aliquota: 0,   descricao: 'Preparações de carne ou peixe' },
  '17': { aliquota: 0,   descricao: 'Açúcares e produtos de confeitaria' },
  '18': { aliquota: 0,   descricao: 'Cacau e suas preparações' },
  '19': { aliquota: 0,   descricao: 'Preparações à base de cereais' },
  '20': { aliquota: 0,   descricao: 'Preparações de produtos hortícolas' },
  '21': { aliquota: 0,   descricao: 'Preparações alimentícias diversas' },
  '22': { aliquota: 20,  descricao: 'Bebidas, líquidos alcoólicos e vinagres (alíquota varia 0-220%)' },
  '23': { aliquota: 0,   descricao: 'Resíduos das indústrias alimentares' },
  '24': { aliquota: 30,  descricao: 'Tabaco e seus sucedâneos (alíquota varia 30-300%)' },
  '25': { aliquota: 0,   descricao: 'Sal, enxofre, pedras e cimentos' },
  '26': { aliquota: 0,   descricao: 'Minérios, escórias e cinzas' },
  '27': { aliquota: 0,   descricao: 'Combustíveis minerais (regimes especiais)' },
  '28': { aliquota: 0,   descricao: 'Produtos químicos inorgânicos' },
  '29': { aliquota: 0,   descricao: 'Produtos químicos orgânicos' },
  '30': { aliquota: 0,   descricao: 'Produtos farmacêuticos (Decreto 9.913/2019)' },
  '31': { aliquota: 0,   descricao: 'Adubos e fertilizantes' },
  '32': { aliquota: 0,   descricao: 'Tintas, vernizes e afins' },
  '33': { aliquota: 7,   descricao: 'Óleos essenciais, cosméticos (alíquota varia 0-20%)' },
  '34': { aliquota: 0,   descricao: 'Sabões, agentes orgânicos de superfície' },
  '35': { aliquota: 0,   descricao: 'Matérias albuminoides, colas' },
  '36': { aliquota: 0,   descricao: 'Pólvoras e explosivos' },
  '37': { aliquota: 5,   descricao: 'Produtos para fotografia/cinematografia' },
  '38': { aliquota: 0,   descricao: 'Produtos químicos diversos' },
  '39': { aliquota: 15,  descricao: 'Plásticos e suas obras (alíquota varia 0-15%)' },
  '40': { aliquota: 5,   descricao: 'Borracha e suas obras' },
  '41': { aliquota: 0,   descricao: 'Peles, exceto as peleteria' },
  '42': { aliquota: 10,  descricao: 'Obras de couro, arreios e selins' },
  '43': { aliquota: 10,  descricao: 'Peleteria e suas obras' },
  '44': { aliquota: 0,   descricao: 'Madeira e obras de madeira' },
  '45': { aliquota: 0,   descricao: 'Cortiça e suas obras' },
  '46': { aliquota: 0,   descricao: 'Obras de espartaria ou cestaria' },
  '47': { aliquota: 0,   descricao: 'Pastas de madeira (celulose)' },
  '48': { aliquota: 0,   descricao: 'Papel e cartão' },
  '49': { aliquota: 0,   descricao: 'Produtos editoriais e artes gráficas' },
  '50': { aliquota: 0,   descricao: 'Seda' },
  '51': { aliquota: 0,   descricao: 'Lã e pêlos finos' },
  '52': { aliquota: 0,   descricao: 'Algodão' },
  '53': { aliquota: 0,   descricao: 'Outras fibras têxteis vegetais' },
  '54': { aliquota: 0,   descricao: 'Filamentos sintéticos ou artificiais' },
  '55': { aliquota: 0,   descricao: 'Fibras sintéticas ou artificiais' },
  '56': { aliquota: 0,   descricao: 'Pastas, feltros e falsos tecidos' },
  '57': { aliquota: 0,   descricao: 'Tapetes e outros revestimentos de pisos' },
  '58': { aliquota: 0,   descricao: 'Tecidos especiais' },
  '59': { aliquota: 0,   descricao: 'Tecidos impregnados, revestidos' },
  '60': { aliquota: 0,   descricao: 'Tecidos de malha' },
  '61': { aliquota: 0,   descricao: 'Vestuário e seus acessórios de malha' },
  '62': { aliquota: 0,   descricao: 'Vestuário e seus acessórios' },
  '63': { aliquota: 0,   descricao: 'Outros artefatos têxteis confeccionados' },
  '64': { aliquota: 10,  descricao: 'Calçados, polainas e artefatos semelhantes' },
  '65': { aliquota: 0,   descricao: 'Chapéus e artefatos de uso semelhante' },
  '66': { aliquota: 0,   descricao: 'Guarda-chuvas, guarda-sóis, bengalas' },
  '67': { aliquota: 0,   descricao: 'Penas, penugem preparadas e artigos' },
  '68': { aliquota: 0,   descricao: 'Obras de pedra, gesso, cimento' },
  '69': { aliquota: 0,   descricao: 'Produtos cerâmicos' },
  '70': { aliquota: 5,   descricao: 'Vidro e suas obras' },
  '71': { aliquota: 0,   descricao: 'Pedras preciosas, metais preciosos, jóias' },
  '72': { aliquota: 0,   descricao: 'Ferro fundido, ferro e aço' },
  '73': { aliquota: 0,   descricao: 'Obras de ferro fundido, ferro ou aço' },
  '74': { aliquota: 0,   descricao: 'Cobre e suas obras' },
  '75': { aliquota: 0,   descricao: 'Níquel e suas obras' },
  '76': { aliquota: 0,   descricao: 'Alumínio e suas obras' },
  '78': { aliquota: 0,   descricao: 'Chumbo e suas obras' },
  '79': { aliquota: 0,   descricao: 'Zinco e suas obras' },
  '80': { aliquota: 0,   descricao: 'Estanho e suas obras' },
  '81': { aliquota: 0,   descricao: 'Outros metais comuns' },
  '82': { aliquota: 0,   descricao: 'Ferramentas, instrumentos cortantes' },
  '83': { aliquota: 5,   descricao: 'Obras diversas de metais comuns' },
  '84': { aliquota: 0,   descricao: 'Reatores nucleares, caldeiras, máquinas' },
  '85': { aliquota: 15,  descricao: 'Máquinas e aparelhos elétricos (alíquota varia 0-30%)' },
  '86': { aliquota: 0,   descricao: 'Veículos e material para vias férreas' },
  '87': { aliquota: 7,   descricao: 'Automóveis e veículos (alíquota varia 0-35%)' },
  '88': { aliquota: 0,   descricao: 'Aeronaves e aparelhos espaciais' },
  '89': { aliquota: 0,   descricao: 'Barcos e estruturas flutuantes' },
  '90': { aliquota: 5,   descricao: 'Instrumentos e aparelhos de óptica' },
  '91': { aliquota: 10,  descricao: 'Aparelhos de relojoaria' },
  '92': { aliquota: 15,  descricao: 'Instrumentos musicais' },
  '93': { aliquota: 0,   descricao: 'Armas e munições' },
  '94': { aliquota: 10,  descricao: 'Móveis, mobiliário médico-cirúrgico' },
  '95': { aliquota: 15,  descricao: 'Brinquedos, jogos, artigos para diversão' },
  '96': { aliquota: 0,   descricao: 'Obras e objetos de arte' },
  '97': { aliquota: 0,   descricao: 'Objetos de arte, coleções e antiguidades' },
}

// ─── PRODUTOS COM SUBSTITUIÇÃO TRIBUTÁRIA NACIONAL ─────────────────────────
// Convênios ICMS e Protocolos ICMS vigentes
export const PRODUTOS_COM_ST: Array<{
  descricao: string
  ncmPrefixos: string[]
  convenio: string
}> = [
  {
    descricao: 'Combustíveis e lubrificantes',
    ncmPrefixos: ['2710', '2711', '2712', '2713', '2715', '3403'],
    convenio: 'Convênio ICMS 110/2007',
  },
  {
    descricao: 'Cigarros e produtos derivados do fumo',
    ncmPrefixos: ['24'],
    convenio: 'Convênio ICMS 37/1994',
  },
  {
    descricao: 'Cervejas, chopes e refrigerantes',
    ncmPrefixos: ['2202', '2203'],
    convenio: 'Convênio ICMS 25/2021',
  },
  {
    descricao: 'Água mineral e gás carbônico',
    ncmPrefixos: ['2201', '2811'],
    convenio: 'Convênio ICMS 25/2021',
  },
  {
    descricao: 'Farinha de trigo e mistura para bolo',
    ncmPrefixos: ['1101', '1901'],
    convenio: 'Convênio ICMS 08/2021',
  },
  {
    descricao: 'Cimento',
    ncmPrefixos: ['2523'],
    convenio: 'Convênio ICMS 15/2021',
  },
  {
    descricao: 'Tintas e vernizes',
    ncmPrefixos: ['32'],
    convenio: 'Convênio ICMS 74/1994',
  },
  {
    descricao: 'Material de construção',
    ncmPrefixos: ['39', '68', '69', '70', '73'],
    convenio: 'Convênio ICMS 92/2015',
  },
  {
    descricao: 'Produtos farmacêuticos',
    ncmPrefixos: ['30'],
    convenio: 'Convênio ICMS 87/2002',
  },
  {
    descricao: 'Cosméticos e perfumaria',
    ncmPrefixos: ['33'],
    convenio: 'Convênio ICMS 09/1993',
  },
  {
    descricao: 'Peças e acessórios para automóveis',
    ncmPrefixos: ['40', '84', '85', '87'],
    convenio: 'Convênio ICMS 92/2015',
  },
  {
    descricao: 'Autopeças',
    ncmPrefixos: ['87'],
    convenio: 'Convênio ICMS 92/2015',
  },
  {
    descricao: 'Rações e alimentos para animais',
    ncmPrefixos: ['2302', '2304', '2309'],
    convenio: 'Convênio ICMS 92/2015',
  },
  {
    descricao: 'Lâmpadas elétricas',
    ncmPrefixos: ['8539'],
    convenio: 'Convênio ICMS 92/2015',
  },
  {
    descricao: 'Eletrônicos (TV, áudio, vídeo)',
    ncmPrefixos: ['8521', '8525', '8527', '8528'],
    convenio: 'Protocolo ICMS 10/2007',
  },
  {
    descricao: 'Celulares e smartphones',
    ncmPrefixos: ['8517'],
    convenio: 'Protocolo ICMS 10/2007',
  },
]

// ─── SUGESTÃO DE CFOP ────────────────────────────────────────────────────────
// Ajuste SINIEF 07/2001 e atualizações
export interface CfopSugestao {
  cfop: string
  descricao: string
  observacao?: string
}

export function sugerirCfop(params: {
  tipoOperacao: TipoOperacao
  mesmaUF: boolean
  consumidorFinal: boolean
  temST: boolean
  importado: boolean
  regime: RegimeTributario
}): CfopSugestao[] {
  const { tipoOperacao, mesmaUF, consumidorFinal, temST, importado } = params
  const prefixo = mesmaUF ? '5' : '6'
  const sugestoes: CfopSugestao[] = []

  if (tipoOperacao === 'venda') {
    if (importado) {
      sugestoes.push({
        cfop: `${prefixo}.102`,
        descricao: 'Venda de mercadoria adquirida ou recebida de terceiros (importada)',
      })
    }
    if (temST) {
      sugestoes.push({
        cfop: `${prefixo}.405`,
        descricao: 'Venda de mercadoria adquirida ou recebida de terceiros com ST',
        observacao: 'Mercadoria com ICMS-ST retido anteriormente',
      })
      sugestoes.push({
        cfop: `${prefixo}.401`,
        descricao: 'Venda de produção do estabelecimento com ST',
      })
    }
    if (consumidorFinal) {
      sugestoes.push({
        cfop: `${prefixo}.102`,
        descricao: 'Venda de mercadoria adquirida ou recebida de terceiros',
        observacao: 'Operação para consumidor final',
      })
      if (!mesmaUF) {
        sugestoes.push({
          cfop: '6.108',
          descricao: 'Venda de mercadoria adquirida de terceiros para não-contribuinte de outra UF (DIFAL)',
          observacao: 'DIFAL aplicável — EC 87/2015 / LC 190/2022',
        })
      }
    } else {
      sugestoes.push({
        cfop: `${prefixo}.101`,
        descricao: 'Venda de produção do estabelecimento',
      })
      sugestoes.push({
        cfop: `${prefixo}.102`,
        descricao: 'Venda de mercadoria adquirida ou recebida de terceiros',
      })
    }
  }

  if (tipoOperacao === 'transferencia') {
    sugestoes.push({
      cfop: `${prefixo}.152`,
      descricao: 'Transferência de mercadoria adquirida ou recebida de terceiros',
      observacao: 'Transferência entre estabelecimentos — Complementar 87/2015',
    })
    sugestoes.push({
      cfop: `${prefixo}.151`,
      descricao: 'Transferência de produção do estabelecimento',
    })
  }

  if (tipoOperacao === 'devolucao') {
    sugestoes.push({
      cfop: `${prefixo}.201`,
      descricao: 'Devolução de venda de produção do estabelecimento',
    })
    sugestoes.push({
      cfop: `${prefixo}.202`,
      descricao: 'Devolução de venda de mercadoria adquirida de terceiros',
    })
  }

  if (tipoOperacao === 'remessa') {
    sugestoes.push({
      cfop: `${prefixo}.901`,
      descricao: 'Remessa para industrialização por encomenda',
    })
    sugestoes.push({
      cfop: `${prefixo}.949`,
      descricao: 'Outra saída de mercadoria ou prestação de serviço não especificado',
    })
  }

  if (tipoOperacao === 'exportacao') {
    sugestoes.push({
      cfop: '7.101',
      descricao: 'Venda de produção do estabelecimento para o exterior',
    })
    sugestoes.push({
      cfop: '7.102',
      descricao: 'Venda de mercadoria adquirida de terceiros para o exterior',
    })
  }

  if (tipoOperacao === 'importacao') {
    sugestoes.push({
      cfop: '3.102',
      descricao: 'Compra para comercialização oriunda do exterior',
    })
    sugestoes.push({
      cfop: '3.101',
      descricao: 'Compra para industrialização proveniente do exterior',
    })
  }

  return sugestoes
}

// ─── CST ICMS (REGIME NORMAL) ────────────────────────────────────────────────
export interface CstInfo {
  cst: string
  descricao: string
  observacao?: string
}

export function sugerirCST(params: {
  operacao: TipoOperacao
  temST: boolean
  isento: boolean
  reduzido: boolean
  diferido: boolean
  importado: boolean
}): CstInfo[] {
  const { operacao, temST, isento, reduzido, diferido, importado } = params

  if (operacao === 'exportacao') {
    return [{ cst: '40', descricao: 'Isenta (exportação)', observacao: 'Imunidade constitucional — Art. 155, §2°, X, a, CF/88' }]
  }

  const sugestoes: CstInfo[] = []

  if (isento) {
    sugestoes.push({ cst: '40', descricao: 'Isenta', observacao: 'Verificar previsão legal específica' })
    return sugestoes
  }

  if (diferido) {
    sugestoes.push({ cst: '51', descricao: 'Com diferimento' })
    return sugestoes
  }

  const origemPrefixo = importado ? '2' : '0'

  if (temST) {
    sugestoes.push({ cst: `${origemPrefixo}10`, descricao: 'Tributada — sujeita a ST (retida pelo remetente)', observacao: 'CST 10' })
    sugestoes.push({ cst: `${origemPrefixo}70`, descricao: 'Com BC reduzida — sujeita a ST', observacao: 'CST 70' })
    sugestoes.push({ cst: `${origemPrefixo}60`, descricao: 'ICMS cobrado anteriormente por ST', observacao: 'CST 60 — para operações seguintes com ST já retida' })
    return sugestoes
  }

  if (reduzido) {
    sugestoes.push({ cst: `${origemPrefixo}20`, descricao: 'Tributada com redução de base de cálculo', observacao: 'Verificar convênio/protocolo' })
    return sugestoes
  }

  sugestoes.push({ cst: `${origemPrefixo}00`, descricao: 'Tributada integralmente', observacao: 'Operação normal sem benefício' })

  return sugestoes
}

// ─── CSOSN (SIMPLES NACIONAL) ────────────────────────────────────────────────
export interface CsosnInfo {
  csosn: string
  descricao: string
  observacao?: string
}

export function sugerirCSOSN(params: {
  operacao: TipoOperacao
  temST: boolean
  isento: boolean
  cobraST: boolean
  importado: boolean
}): CsosnInfo[] {
  const { operacao, temST, isento, cobraST, importado } = params

  if (operacao === 'exportacao') {
    return [{ csosn: '500', descricao: 'ICMS cobrado anteriormente por ST ou por antecipação (exportação)' }]
  }

  if (isento) {
    return [{ csosn: '400', descricao: 'Não tributada pelo Simples Nacional — isento' }]
  }

  const sugestoes: CsosnInfo[] = []

  if (cobraST) {
    sugestoes.push({ csosn: '201', descricao: 'Tributada pelo Simples Nacional com permissão de crédito e com cobrança de ICMS-ST' })
    sugestoes.push({ csosn: '202', descricao: 'Tributada pelo Simples Nacional sem permissão de crédito e com cobrança de ICMS-ST' })
    return sugestoes
  }

  if (temST) {
    sugestoes.push({ csosn: '500', descricao: 'ICMS cobrado anteriormente por ST (ou por antecipação)', observacao: 'Mercadoria com ST já retida na entrada' })
    return sugestoes
  }

  if (importado) {
    sugestoes.push({ csosn: '102', descricao: 'Tributada pelo Simples Nacional sem permissão de crédito (importado)' })
    return sugestoes
  }

  sugestoes.push({ csosn: '102', descricao: 'Tributada pelo Simples Nacional sem permissão de crédito' })
  sugestoes.push({ csosn: '900', descricao: 'Outras (tributada + ST, tributada + diferimento, etc.)' })

  return sugestoes
}

// ─── PIS/COFINS ──────────────────────────────────────────────────────────────
// Leis 10.637/2002 e 10.833/2003
export interface PisCofinsDados {
  regimePis: string
  aliquotaPis: number
  regimeCofins: string
  aliquotaCofins: number
  cstPis: string
  cstCofins: string
  observacao: string
}

export function calcularPisCofins(params: {
  regime: RegimeTributario
  operacao: TipoOperacao
  ncmCapitulo: string
}): PisCofinsDados {
  const { regime, operacao, ncmCapitulo } = params

  // Produtos monofásicos (PIS/COFINS com alíquota zero no downstream)
  const monofasicos = ['22', '24', '30', '33'] // bebidas, tabaco, farma, cosméticos
  const isMonofasico = monofasicos.includes(ncmCapitulo)

  if (operacao === 'exportacao') {
    return {
      regimePis: 'Não incidência — exportação',
      aliquotaPis: 0,
      regimeCofins: 'Não incidência — exportação',
      aliquotaCofins: 0,
      cstPis: '07',
      cstCofins: '07',
      observacao: 'Exportação — imunidade (art. 149, §2°, I, CF/88)',
    }
  }

  if (regime === 'simples' || regime === 'mei') {
    return {
      regimePis: 'Simples Nacional — incluído no DAS',
      aliquotaPis: 0,
      regimeCofins: 'Simples Nacional — incluído no DAS',
      aliquotaCofins: 0,
      cstPis: '07',
      cstCofins: '07',
      observacao: 'PIS/COFINS recolhidos no Simples Nacional via DAS',
    }
  }

  if (isMonofasico) {
    return {
      regimePis: 'Monofásico',
      aliquotaPis: 0,
      regimeCofins: 'Monofásico',
      aliquotaCofins: 0,
      cstPis: '04',
      cstCofins: '04',
      observacao: `Regime monofásico — cap. ${ncmCapitulo}. Tributação concentrada no produtor/importador. Verificar alíquota na etapa anterior.`,
    }
  }

  if (regime === 'lucro_real') {
    return {
      regimePis: 'Não cumulativo',
      aliquotaPis: 1.65,
      regimeCofins: 'Não cumulativo',
      aliquotaCofins: 7.6,
      cstPis: '01',
      cstCofins: '01',
      observacao: 'Regime não cumulativo — Leis 10.637/2002 e 10.833/2003. Créditos permitidos.',
    }
  }

  // Lucro presumido — regime cumulativo
  return {
    regimePis: 'Cumulativo',
    aliquotaPis: 0.65,
    regimeCofins: 'Cumulativo',
    aliquotaCofins: 3,
    cstPis: '01',
    cstCofins: '01',
    observacao: 'Regime cumulativo — Lei 9.718/1998. Sem direito a créditos.',
  }
}

// ─── REFORMA TRIBUTÁRIA — LC 214/2025 ────────────────────────────────────────
/**
 * Alíquotas de referência aprovadas pela LC 214/2025
 * Vigência: transição 2026-2033, plena a partir de 2033
 *
 * Art. 99 LC 214/2025: alíquota de referência CBS = 9,9%
 * IBS: soma das alíquotas estadual + municipal (estimativa ~26,5% total)
 * IS: art. 415 e seguintes LC 214/2025
 */
export const REFORMA_TRIBUTARIA = {
  cbs: {
    aliquotaReferencia: 9.9,
    reducaoSimples: 20,  // % de redução para Simples Nacional
    vigencia: 'Plena a partir de 2027 (CBS)',
    fontes: ['LC 214/2025, art. 99', 'Resolução CGIBS em elaboração'],
  },
  ibs: {
    aliquotaEstimadaEstadual: 17.7, // estimativa baseada na proposta do CGIBS
    aliquotaEstimadaMunicipal: 8.8, // estimativa
    aliquotaEstimadaTotal: 26.5,
    vigencia: 'Transição 2026-2032, plena 2033',
    fontes: ['LC 214/2025, art. 3°-30', 'CGIBS — resolução em elaboração'],
  },
  transicao: [
    { ano: 2026, cbs: 0.9, ibs: 0, observacao: 'Ano-teste: CBS reduzida, IBS 0%' },
    { ano: 2027, cbs: 9.9, ibs: 0, observacao: 'CBS plena, IBS ainda 0%' },
    { ano: 2028, cbs: 9.9, ibs: 3.25, observacao: 'IBS inicia transição (fase 1)' },
    { ano: 2029, cbs: 9.9, ibs: 6.5, observacao: 'IBS fase 2' },
    { ano: 2030, cbs: 9.9, ibs: 9.75, observacao: 'IBS fase 3' },
    { ano: 2031, cbs: 9.9, ibs: 13.0, observacao: 'IBS fase 4' },
    { ano: 2032, cbs: 9.9, ibs: 19.5, observacao: 'IBS fase 5' },
    { ano: 2033, cbs: 9.9, ibs: 26.5, observacao: 'Regime pleno — PIS/COFINS e ICMS/ISS extintos' },
  ],
  impostoSeletivo: [
    { descricao: 'Cigarros e produtos do tabaco',         ncmPrefixos: ['24'],         aliquota: 100, base: 'Art. 415, I, LC 214/2025' },
    { descricao: 'Bebidas alcoólicas',                    ncmPrefixos: ['22'],         aliquota: 20,  base: 'Art. 415, II, LC 214/2025' },
    { descricao: 'Veículos (emissão acima do permitido)', ncmPrefixos: ['87'],         aliquota: 10,  base: 'Art. 415, III, LC 214/2025' },
    { descricao: 'Combustíveis fósseis',                  ncmPrefixos: ['2710','2711'],aliquota: 20,  base: 'Art. 415, IV, LC 214/2025' },
    { descricao: 'Armas de fogo',                         ncmPrefixos: ['93'],         aliquota: 25,  base: 'Art. 415, V, LC 214/2025' },
    { descricao: 'Bebidas açucaradas (alc./sódio)',        ncmPrefixos: ['2202','2201'],aliquota: 20,  base: 'Art. 415, VI, LC 214/2025' },
    { descricao: 'Minérios — extração (por tonelada)',     ncmPrefixos: ['26'],         aliquota: 0.25,base: 'Art. 415, VII, LC 214/2025' },
  ],
  reducoes: [
    { descricao: 'Alimentos da cesta básica nacional',                reducao: 100, base: 'Art. 108 LC 214/2025' },
    { descricao: 'Medicamentos e dispositivos médicos',               reducao: 60,  base: 'Art. 114 LC 214/2025' },
    { descricao: 'Serviços de educação',                              reducao: 60,  base: 'Art. 115 LC 214/2025' },
    { descricao: 'Serviços de saúde',                                 reducao: 60,  base: 'Art. 116 LC 214/2025' },
    { descricao: 'Transporte coletivo de passageiros',                reducao: 60,  base: 'Art. 117 LC 214/2025' },
    { descricao: 'Insumos agropecuários',                             reducao: 60,  base: 'Art. 118 LC 214/2025' },
    { descricao: 'Serviços financeiros (parcial)',                    reducao: 30,  base: 'Art. 119 LC 214/2025' },
    { descricao: 'Regime Cashback para baixa renda (devolução)',      reducao: 0,   base: 'Art. 126 LC 214/2025 — devolução diferente' },
  ],
}

// ─── BENEFÍCIOS FISCAIS ICMS POR ESTADO ─────────────────────────────────────
export const BENEFICIOS_FISCAIS: Partial<Record<UF, string[]>> = {
  SP: [
    'Redução BC 30%: produtos alimentícios em geral (Decreto 45.490/2000)',
    'Isenção: equipamentos para deficientes (Convênio ICMS 38/2012)',
    'Crédito outorgado: setor sucroenergético',
  ],
  MG: [
    'ICMS reduzido 12%: produtos da cesta básica (Lei 6.763/1975)',
    'Incentivos BDMG: investimentos industriais',
    'Isenção: geladeiras e fogões para baixa renda',
  ],
  RJ: [
    'ICMS 0%: gás natural residencial e comercial',
    'Redução BC: equipamentos de segurança',
  ],
  PR: [
    'Isenção: produtos da cesta básica',
    'Incentivos PRÓ-EMPREGO: investimentos industriais',
  ],
  SC: [
    'Isenção: equipamentos médico-hospitalares',
    'Crédito presumido: indústria têxtil',
  ],
  RS: [
    'Redução BC: alimentos da cesta básica',
    'Isenção: insumos agropecuários (Convênio ICMS 20/1990)',
  ],
  GO: [
    'Incentivos PRODUZIR/FOMENTAR: investimentos industriais',
    'Redução BC: produtos farmacêuticos',
  ],
  BA: [
    'Programa DESENVOLVE: crédito fiscal industrial',
    'Redução BC: cesta básica',
  ],
  CE: [
    'Incentivos FDI/PROINCO: indústria',
    'Crédito outorgado: setor calçadista',
  ],
  AM: [
    'Zona Franca de Manaus: isenção/redução ICMS e IPI',
    'Crédito presumido: diferencial para produtos ZFM',
  ],
}

// ─── CFOP — TABELA DE DESCRIÇÕES ─────────────────────────────────────────────
// Ajuste SINIEF 07/2001 e atualizações. Cobre os códigos mais usados no
// dia a dia de comércio/distribuição (compra, venda, devolução, transferência,
// ST, ativo imobilizado, uso/consumo, bonificação/amostra/demonstração).
// Para código não mapeado, descreverCfop() cai no grupo pelo 1º dígito.
export const CFOP_GRUPO_DESCRICOES: Record<string, string> = {
  '1': 'Entrada — operação interna (mesmo estado)',
  '2': 'Entrada — operação interestadual',
  '3': 'Entrada — operação com o exterior',
  '5': 'Saída — operação interna (mesmo estado)',
  '6': 'Saída — operação interestadual',
  '7': 'Saída — operação com o exterior',
}

export const CFOP_DESCRICOES: Record<string, string> = {
  // Entrada — mesmo estado (1.xxx) e interestadual (2.xxx)
  '1101': 'Compra para industrialização ou produção rural',
  '2101': 'Compra para industrialização ou produção rural',
  '1102': 'Compra para comercialização',
  '2102': 'Compra para comercialização',
  '1111': 'Compra para industrialização de mercadoria recebida em consignação industrial',
  '2111': 'Compra para industrialização de mercadoria recebida em consignação industrial',
  '1113': 'Compra para comercialização de mercadoria recebida em consignação mercantil',
  '2113': 'Compra para comercialização de mercadoria recebida em consignação mercantil',
  '1116': 'Compra para industrialização em venda à ordem',
  '2116': 'Compra para industrialização em venda à ordem',
  '1117': 'Compra para comercialização em venda à ordem',
  '2117': 'Compra para comercialização em venda à ordem',
  '1120': 'Compra para industrialização, mercadoria que não transita pelo estabelecimento',
  '2120': 'Compra para industrialização, mercadoria que não transita pelo estabelecimento',
  '1121': 'Compra para comercialização, mercadoria que não transita pelo estabelecimento',
  '2121': 'Compra para comercialização, mercadoria que não transita pelo estabelecimento',
  '1122': 'Compra para comercialização, mercadoria não industrializada pelo fabricante',
  '2122': 'Compra para comercialização, mercadoria não industrializada pelo fabricante',
  '1124': 'Industrialização efetuada por outra empresa',
  '2124': 'Industrialização efetuada por outra empresa',
  '1126': 'Compra para utilização na prestação de serviço',
  '2126': 'Compra para utilização na prestação de serviço',
  '1150': 'Transferência para industrialização ou produção rural',
  '2150': 'Transferência para industrialização ou produção rural',
  '1151': 'Transferência para comercialização',
  '2151': 'Transferência para comercialização',
  '1152': 'Transferência de energia elétrica para distribuição',
  '2152': 'Transferência de energia elétrica para distribuição',
  '1153': 'Transferência de mercadoria adquirida ou recebida de terceiros',
  '2153': 'Transferência de mercadoria adquirida ou recebida de terceiros',
  '1201': 'Devolução de venda de produção do estabelecimento',
  '2201': 'Devolução de venda de produção do estabelecimento',
  '1202': 'Devolução de venda de mercadoria adquirida ou recebida de terceiros',
  '2202': 'Devolução de venda de mercadoria adquirida ou recebida de terceiros',
  '1203': 'Devolução de venda de produção do estabelecimento, destinada a não contribuinte',
  '2203': 'Devolução de venda de produção do estabelecimento, destinada a não contribuinte',
  '1204': 'Devolução de venda de mercadoria de terceiros, destinada a não contribuinte',
  '2204': 'Devolução de venda de mercadoria de terceiros, destinada a não contribuinte',
  '1253': 'Compra de energia elétrica por estabelecimento comercial',
  '2253': 'Compra de energia elétrica por estabelecimento comercial',
  '1401': 'Compra para industrialização/produção rural sujeita à substituição tributária',
  '2401': 'Compra para industrialização/produção rural sujeita à substituição tributária',
  '1403': 'Compra para comercialização em operação com mercadoria sujeita à ST',
  '2403': 'Compra para comercialização em operação com mercadoria sujeita à ST',
  '1406': 'Compra de bem para o ativo imobilizado sujeita à substituição tributária',
  '2406': 'Compra de bem para o ativo imobilizado sujeita à substituição tributária',
  '1407': 'Compra de mercadoria para uso ou consumo sujeita à substituição tributária',
  '2407': 'Compra de mercadoria para uso ou consumo sujeita à substituição tributária',
  '1409': 'Compra para industrialização, mercadoria sujeita à ST (matéria-prima)',
  '2409': 'Compra para industrialização, mercadoria sujeita à ST (matéria-prima)',
  '1410': 'Devolução de venda de produção com ST',
  '2410': 'Devolução de venda de produção com ST',
  '1411': 'Devolução de venda de mercadoria de terceiros com ST',
  '2411': 'Devolução de venda de mercadoria de terceiros com ST',
  '1551': 'Compra de bem para o ativo imobilizado',
  '2551': 'Compra de bem para o ativo imobilizado',
  '1556': 'Compra de material para uso ou consumo',
  '2556': 'Compra de material para uso ou consumo',
  '1653': 'Compra de combustível ou lubrificante para comercialização',
  '2653': 'Compra de combustível ou lubrificante para comercialização',
  '1667': 'Compra de combustível ou lubrificante por consumidor ou usuário final',
  '2667': 'Compra de combustível ou lubrificante por consumidor ou usuário final',
  '1910': 'Entrada de bonificação, doação ou brinde',
  '2910': 'Entrada de bonificação, doação ou brinde',
  '1911': 'Entrada de amostra grátis',
  '2911': 'Entrada de amostra grátis',
  '1912': 'Entrada de mercadoria ou bem recebido para demonstração',
  '2912': 'Entrada de mercadoria ou bem recebido para demonstração',
  '1913': 'Retorno de mercadoria ou bem remetido para demonstração',
  '2913': 'Retorno de mercadoria ou bem remetido para demonstração',
  '1914': 'Retorno de mercadoria ou bem remetido para exposição ou feira',
  '2914': 'Retorno de mercadoria ou bem remetido para exposição ou feira',
  '1916': 'Retorno de mercadoria ou bem remetido para conserto ou reparo',
  '2916': 'Retorno de mercadoria ou bem remetido para conserto ou reparo',
  '1917': 'Entrada de mercadoria recebida em consignação mercantil ou industrial',
  '2917': 'Entrada de mercadoria recebida em consignação mercantil ou industrial',
  '1918': 'Devolução de mercadoria remetida em consignação mercantil',
  '2918': 'Devolução de mercadoria remetida em consignação mercantil',
  '1949': 'Outra entrada de mercadoria ou prestação de serviço não especificado',
  '2949': 'Outra entrada de mercadoria ou prestação de serviço não especificado',
  // Entrada — exterior (3.xxx)
  '3101': 'Compra para industrialização proveniente do exterior',
  '3102': 'Compra para comercialização oriunda do exterior',
  '3126': 'Compra para utilização na prestação de serviço, proveniente do exterior',
  '3201': 'Devolução de venda de produção do estabelecimento ao exterior',
  '3949': 'Outra entrada de mercadoria ou prestação de serviço do exterior não especificado',
  // Saída — mesmo estado (5.xxx) e interestadual (6.xxx)
  '5101': 'Venda de produção do estabelecimento',
  '6101': 'Venda de produção do estabelecimento',
  '5102': 'Venda de mercadoria adquirida ou recebida de terceiros',
  '6102': 'Venda de mercadoria adquirida ou recebida de terceiros',
  '5103': 'Venda de produção do estabelecimento, efetuada fora do estabelecimento',
  '6103': 'Venda de produção do estabelecimento, efetuada fora do estabelecimento',
  '5104': 'Venda de mercadoria de terceiros, efetuada fora do estabelecimento',
  '6104': 'Venda de mercadoria de terceiros, efetuada fora do estabelecimento',
  '5109': 'Venda de produção destinada à Zona Franca de Manaus ou Áreas de Livre Comércio',
  '6109': 'Venda de produção destinada à Zona Franca de Manaus ou Áreas de Livre Comércio',
  '5110': 'Venda de mercadoria de terceiros destinada à Zona Franca de Manaus/ALC',
  '6110': 'Venda de mercadoria de terceiros destinada à Zona Franca de Manaus/ALC',
  '5116': 'Venda de produção originada de encomenda para entrega futura',
  '6116': 'Venda de produção originada de encomenda para entrega futura',
  '5117': 'Venda de mercadoria de terceiros originada de encomenda para entrega futura',
  '6117': 'Venda de mercadoria de terceiros originada de encomenda para entrega futura',
  '5150': 'Transferência de produção do estabelecimento',
  '6150': 'Transferência de produção do estabelecimento',
  '5151': 'Transferência de produção do estabelecimento',
  '6151': 'Transferência de produção do estabelecimento',
  '5152': 'Transferência de mercadoria adquirida ou recebida de terceiros',
  '6152': 'Transferência de mercadoria adquirida ou recebida de terceiros',
  '5153': 'Transferência de energia elétrica',
  '6153': 'Transferência de energia elétrica',
  '5201': 'Devolução de compra para industrialização ou produção rural',
  '6201': 'Devolução de compra para industrialização ou produção rural',
  '5202': 'Devolução de compra para comercialização',
  '6202': 'Devolução de compra para comercialização',
  '5205': 'Anulação de valor relativo a prestação de serviço de comunicação',
  '6205': 'Anulação de valor relativo a prestação de serviço de comunicação',
  '5208': 'Devolução de mercadoria recebida em transferência para industrialização',
  '6208': 'Devolução de mercadoria recebida em transferência para industrialização',
  '5209': 'Devolução de mercadoria recebida em transferência para comercialização',
  '6209': 'Devolução de mercadoria recebida em transferência para comercialização',
  '5210': 'Devolução de compra para utilização na prestação de serviço',
  '6210': 'Devolução de compra para utilização na prestação de serviço',
  '5251': 'Venda de energia elétrica para distribuição ou comercialização',
  '6251': 'Venda de energia elétrica para distribuição ou comercialização',
  '5252': 'Venda de energia elétrica para estabelecimento industrial',
  '6252': 'Venda de energia elétrica para estabelecimento industrial',
  '5258': 'Venda de energia elétrica a não contribuinte',
  '6258': 'Venda de energia elétrica a não contribuinte',
  '5401': 'Venda de produção com ST — contribuinte substituto',
  '6401': 'Venda de produção com ST — contribuinte substituto',
  '5402': 'Venda de produção com ST entre contribuintes substitutos do mesmo produto',
  '6402': 'Venda de produção com ST entre contribuintes substitutos do mesmo produto',
  '5403': 'Venda de mercadoria de terceiros com ST — contribuinte substituto',
  '6403': 'Venda de mercadoria de terceiros com ST — contribuinte substituto',
  '5405': 'Venda de mercadoria de terceiros com ST — contribuinte substituído (ICMS retido)',
  '6404': 'Venda de mercadoria de terceiros com ST — contribuinte substituído (ICMS retido)',
  '6405': 'Venda de mercadoria de terceiros com ST — contribuinte substituído (ICMS retido)',
  '5409': 'Devolução de compra para industrialização com mercadoria sujeita à ST',
  '6409': 'Devolução de compra para industrialização com mercadoria sujeita à ST',
  '5410': 'Devolução de compra para comercialização com mercadoria sujeita à ST',
  '6410': 'Devolução de compra para comercialização com mercadoria sujeita à ST',
  '5411': 'Devolução de compra para industrialização com ST, sem trânsito pelo estabelecimento',
  '6411': 'Devolução de compra para industrialização com ST, sem trânsito pelo estabelecimento',
  '5412': 'Devolução de bem do ativo imobilizado, com mercadoria sujeita à ST',
  '6412': 'Devolução de bem do ativo imobilizado, com mercadoria sujeita à ST',
  '5413': 'Devolução de mercadoria destinada a uso ou consumo, com mercadoria sujeita à ST',
  '6413': 'Devolução de mercadoria destinada a uso ou consumo, com mercadoria sujeita à ST',
  '5551': 'Venda de bem do ativo imobilizado',
  '6551': 'Venda de bem do ativo imobilizado',
  '5556': 'Devolução de compra para uso ou consumo',
  '6556': 'Devolução de compra para uso ou consumo',
  '5910': 'Remessa em bonificação, doação ou brinde',
  '6910': 'Remessa em bonificação, doação ou brinde',
  '5911': 'Remessa de amostra grátis',
  '6911': 'Remessa de amostra grátis',
  '5912': 'Remessa de mercadoria ou bem para demonstração',
  '6912': 'Remessa de mercadoria ou bem para demonstração',
  '5913': 'Retorno de mercadoria ou bem recebido para demonstração',
  '6913': 'Retorno de mercadoria ou bem recebido para demonstração',
  '5914': 'Remessa de mercadoria ou bem para exposição ou feira',
  '6914': 'Remessa de mercadoria ou bem para exposição ou feira',
  '5915': 'Remessa de mercadoria ou bem para conserto ou reparo',
  '6915': 'Remessa de mercadoria ou bem para conserto ou reparo',
  '5916': 'Retorno de mercadoria ou bem recebido para conserto ou reparo',
  '6916': 'Retorno de mercadoria ou bem recebido para conserto ou reparo',
  '5917': 'Remessa de mercadoria em consignação mercantil ou industrial',
  '6917': 'Remessa de mercadoria em consignação mercantil ou industrial',
  '5918': 'Devolução de mercadoria recebida em consignação mercantil',
  '6918': 'Devolução de mercadoria recebida em consignação mercantil',
  '5920': 'Remessa de vasilhame ou sacaria',
  '6920': 'Remessa de vasilhame ou sacaria',
  '5921': 'Devolução de vasilhame ou sacaria',
  '6921': 'Devolução de vasilhame ou sacaria',
  '5922': 'Lançamento a título de simples faturamento — venda para entrega futura',
  '6922': 'Lançamento a título de simples faturamento — venda para entrega futura',
  '5927': 'Baixa de estoque decorrente de perda, roubo ou deterioração',
  '6927': 'Baixa de estoque decorrente de perda, roubo ou deterioração',
  '5929': 'Baixa de estoque decorrente de doação',
  '6929': 'Baixa de estoque decorrente de doação',
  '5949': 'Outra saída de mercadoria ou prestação de serviço não especificado',
  '6949': 'Outra saída de mercadoria ou prestação de serviço não especificado',
  // Saída — exterior (7.xxx)
  '7101': 'Venda de produção do estabelecimento para o exterior',
  '7102': 'Venda de mercadoria adquirida ou recebida de terceiros para o exterior',
  '7127': 'Venda de produção do estabelecimento sujeita a drawback',
  '7201': 'Devolução de compra para industrialização, do exterior',
  '7949': 'Outra saída de mercadoria ou prestação de serviço para o exterior não especificado',
}

/**
 * Descreve um CFOP. Se o código completo não estiver na tabela curada,
 * cai para a descrição genérica do grupo (1º dígito) — Ajuste SINIEF 07/2001.
 */
export function descreverCfop(cfop: string): { descricao: string; grupo: string; encontrado: boolean } {
  const codigo = (cfop || '').replace(/\D/g, '')
  const grupo = CFOP_GRUPO_DESCRICOES[codigo.charAt(0)] ?? 'Grupo de CFOP não identificado'
  const descricao = CFOP_DESCRICOES[codigo]
  return {
    descricao: descricao ?? `${grupo} — consulte a tabela CFOP completa (Ajuste SINIEF 07/2001) para o código ${cfop}`,
    grupo,
    encontrado: !!descricao,
  }
}

// ─── CST/CSOSN — TABELAS DE DESCRIÇÃO ────────────────────────────────────────
// Tabela B do Anexo do Convênio S/N 1970 (CST ICMS) e Anexo do CSOSN (Ajuste
// SINIEF 03/2010), usadas para exibir o significado dos códigos já extraídos
// do XML — não é sugestão, é apenas o "dicionário" do que já veio na nota.
export const CST_ICMS_DESCRICOES: Record<string, string> = {
  '00': 'Tributada integralmente',
  '10': 'Tributada com cobrança do ICMS por substituição tributária',
  '20': 'Com redução de base de cálculo',
  '30': 'Isenta ou não tributada, com cobrança do ICMS por substituição tributária',
  '40': 'Isenta',
  '41': 'Não tributada',
  '50': 'Suspensão',
  '51': 'Diferimento',
  '60': 'ICMS cobrado anteriormente por substituição tributária',
  '70': 'Com redução de base de cálculo e cobrança do ICMS por substituição tributária',
  '90': 'Outras',
}

export const CSOSN_DESCRICOES: Record<string, string> = {
  '101': 'Tributada pelo Simples Nacional com permissão de crédito',
  '102': 'Tributada pelo Simples Nacional sem permissão de crédito',
  '103': 'Isenção do ICMS no Simples Nacional para faixa de receita bruta',
  '201': 'Tributada pelo Simples Nacional com permissão de crédito e com ICMS por ST',
  '202': 'Tributada pelo Simples Nacional sem permissão de crédito e com ICMS por ST',
  '203': 'Isenção do ICMS no Simples Nacional para faixa de receita bruta e com ICMS por ST',
  '300': 'Imune',
  '400': 'Não tributada pelo Simples Nacional',
  '500': 'ICMS cobrado anteriormente por substituição tributária ou por antecipação',
  '900': 'Outros',
}

export const CST_PIS_COFINS_DESCRICOES: Record<string, string> = {
  '01': 'Operação Tributável com Alíquota Básica',
  '02': 'Operação Tributável com Alíquota Diferenciada',
  '03': 'Operação Tributável com Alíquota por Unidade de Medida de Produto',
  '04': 'Operação Tributável Monofásica — Revenda a Alíquota Zero',
  '05': 'Operação Tributável por Substituição Tributária',
  '06': 'Operação Tributável a Alíquota Zero',
  '07': 'Operação Isenta da Contribuição',
  '08': 'Operação sem Incidência da Contribuição',
  '09': 'Operação com Suspensão da Contribuição',
  '49': 'Outras Operações de Saída',
  '50': 'Operação com Direito a Crédito — Vinculada Exclusivamente a Receita Tributada no Mercado Interno',
  '51': 'Operação com Direito a Crédito — Vinculada Exclusivamente a Receita Não Tributada no Mercado Interno',
  '52': 'Operação com Direito a Crédito — Vinculada Exclusivamente a Receita de Exportação',
  '53': 'Operação com Direito a Crédito — Vinculada a Receitas Tributadas e Não-Tributadas no Mercado Interno',
  '54': 'Operação com Direito a Crédito — Vinculada a Receitas Tributadas no Mercado Interno e de Exportação',
  '60': 'Crédito Presumido — Operação de Aquisição Vinculada Exclusivamente a Receita Tributada no Mercado Interno',
  '70': 'Operação de Aquisição sem Direito a Crédito',
  '71': 'Operação de Aquisição com Isenção',
  '72': 'Operação de Aquisição com Suspensão',
  '73': 'Operação de Aquisição a Alíquota Zero',
  '74': 'Operação de Aquisição sem Incidência da Contribuição',
  '75': 'Operação de Aquisição por Substituição Tributária',
  '98': 'Outras Operações de Entrada',
  '99': 'Outras Operações',
}
