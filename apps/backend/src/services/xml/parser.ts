import { XMLParser } from 'fast-xml-parser'
import { createHash } from 'crypto'

export interface ParsedNfeItem {
  nItem: number
  cProd?: string
  xProd: string
  ncm?: string
  cfop: string
  uCom?: string
  qCom: number
  vUnCom: number
  vProd: number
  vDesc: number
  cstIcms?: string
  csosnIcms?: string
  vBCIcms: number
  pICMS: number
  vICMS: number
  vST: number
  cstPis?: string
  vPIS: number
  cstCofins?: string
  vCOFINS: number
  vIPI: number
  tribIcms: string
  tribPis: string
}

export interface ParsedNfeEvent {
  tpEvento: string
  nSeqEvento: number
  dhEvento: Date
  xMotivo?: string
  nProt?: string
}

export interface ParsedNfe {
  chNFe: string
  xmlHash: string
  mod: number
  serie: string
  nNF: string
  dhEmi: Date
  competencia: string
  tpNF: number
  natOp?: string
  emitCnpj: string
  emitNome: string
  emitUF?: string
  destCnpj?: string
  destCpf?: string
  destNome?: string
  vProd: number
  vDesc: number
  vNF: number
  vICMS: number
  vICMSST: number
  vIPI: number
  vPIS: number
  vCOFINS: number
  vFrete: number
  status: 'AUTORIZADA' | 'CANCELADA' | 'DENEGADA' | 'INUTILIZADA' | 'SEM_PROTOCOLO'
  items: ParsedNfeItem[]
  events: ParsedNfeEvent[]
  xmlRaw: string
}

export class XmlParseError extends Error {
  constructor(message: string, public readonly xmlSnippet?: string) {
    super(message)
    this.name = 'XmlParseError'
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: true,
  numberParseOptions: {
    leadingZeros: false,
    hex: false,
    skipLike: /^\d{8,}$/, // don't convert long numeric strings (chNFe, CNPJ, CPF, cMun, etc.)
  },
  allowBooleanAttributes: true,
  trimValues: true,
  isArray: (tagName) => {
    return ['det', 'detEvento', 'evento', 'procEventoNFe'].includes(tagName)
  },
})

function toNum(val: unknown): number {
  if (val === undefined || val === null || val === '') return 0
  const n = Number(val)
  return isNaN(n) ? 0 : n
}

function toStr(val: unknown): string {
  if (val === undefined || val === null) return ''
  return String(val).trim()
}

function parseDate(val: unknown): Date {
  const s = toStr(val)
  if (!s) throw new XmlParseError('Invalid date value: ' + s)
  // Handle formats: 2024-01-15T10:30:00-03:00 or 2024-01-15
  return new Date(s)
}

function toCompetencia(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// Mapeia o cStat do protocolo de autorização (protNFe/infProt) para o status
// real da nota. Sem isso, uma nota já cancelada no próprio XML (nfeProc com
// cStat 101/151, comum em downloads via Distribuição DFe) entrava como
// AUTORIZADA e só era corrigida se um evento de cancelamento separado
// também fosse importado.
//
// Achado real (nota 21274, E.GREGORIO LIMA-AUTO-PECAS, jul/2026): alguns
// arquivos salvos pelo PDV do emitente são o <NFe> assinado SEM o <protNFe>
// da SEFAZ (sem cStat, sem nProt) — não é a prova de autorização, é só o
// documento que o emitente gerou antes de transmitir. Sem protocolo não há
// como confirmar que a SEFAZ realmente autorizou; antes isso caía no
// `default` e virava AUTORIZADA por engano. Agora vira SEM_PROTOCOLO.
function statusFromCStat(cStat: string | undefined): 'AUTORIZADA' | 'CANCELADA' | 'DENEGADA' | 'SEM_PROTOCOLO' {
  switch (cStat) {
    case '100':
    case '150':
      return 'AUTORIZADA'
    case '101':
    case '151':
      return 'CANCELADA'
    case '110':
    case '301':
    case '302':
      return 'DENEGADA'
    case undefined:
      return 'SEM_PROTOCOLO'
    default:
      return 'AUTORIZADA'
  }
}

function extractIcms(icmsNode: Record<string, unknown>): {
  cst?: string
  csosn?: string
  vBC: number
  pICMS: number
  vICMS: number
  vST: number
} {
  if (!icmsNode || typeof icmsNode !== 'object') {
    return { vBC: 0, pICMS: 0, vICMS: 0, vST: 0 }
  }

  // ICMS node can be ICMS00, ICMS10, ICMS20, ICMS30, ICMS40, ICMS41, ICMS50,
  // ICMS51, ICMS60, ICMS70, ICMS90, ICMSSN101, ICMSSN102, ICMSSN201,
  // ICMSSN202, ICMSSN500, ICMSSN900
  const keys = Object.keys(icmsNode)
  let node: Record<string, unknown> = {}
  for (const k of keys) {
    if (k.startsWith('ICMS') || k.startsWith('ICMSSNreg')) {
      node = icmsNode[k] as Record<string, unknown>
      break
    }
  }

  const isCSOSN = keys.some((k) => k.startsWith('ICMSSN'))

  return {
    cst: isCSOSN ? undefined : toStr(node.CST) || undefined,
    csosn: isCSOSN ? toStr(node.CSOSN) || undefined : undefined,
    vBC: toNum(node.vBC),
    pICMS: toNum(node.pICMS),
    vICMS: toNum(node.vICMS),
    vST: toNum(node.vICMSST),
  }
}

// Classificação tributária derivada por item, usada na Segregação PGDAS-D
// (fechamento do Simples Nacional). Regras consolidadas a partir do motor
// de tributação de referência do usuário (CSOSN/CST oficiais da NF-e).
const CSOSN_SUBSTITUICAO = ['500', '201', '202', '203', '10', '30', '60', '70']
const CST_SUBSTITUICAO = ['10', '30', '60', '70']
const CSOSN_SIMPLES = ['101', '102', '103', '300', '400', '900']
const CSOSN_ISENTO = ['40', '41', '50']
const CST_ISENTO = ['40', '41', '50']
const CST_TRIBUTADO = ['00', '20']

function deriveTribIcms(cstIcms: string | undefined, csosn: string | undefined): string {
  if (csosn && CSOSN_SUBSTITUICAO.includes(csosn)) return 'Substituição Tributária'
  if (cstIcms && CST_SUBSTITUICAO.includes(cstIcms)) return 'Substituição Tributária'
  if (csosn && CSOSN_SIMPLES.includes(csosn)) return 'Simples Nacional'
  if (csosn && CSOSN_ISENTO.includes(csosn)) return 'Isento/NT'
  if (cstIcms && CST_ISENTO.includes(cstIcms)) return 'Isento/NT'
  if (cstIcms && CST_TRIBUTADO.includes(cstIcms)) return 'Tributado'
  return 'Tributado'
}

const CST_PISCOFINS_MONOFASICO = ['70', '71', '72', '73', '74', '75']
const CST_PISCOFINS_ISENTO = ['04', '05', '06', '07', '08', '09']
const CST_PISCOFINS_ST = ['49', '50']

function deriveTribPis(cstPis: string | undefined, cstCofins: string | undefined): string {
  const cst = cstPis || cstCofins || ''
  if (CST_PISCOFINS_MONOFASICO.includes(cst)) return 'Tributação Monofásica'
  if (CST_PISCOFINS_ISENTO.includes(cst)) return 'Isento/NT'
  if (CST_PISCOFINS_ST.includes(cst)) return 'Substituição Tributária'
  return 'Tributado'
}

function parseItem(det: Record<string, unknown>, index: number): ParsedNfeItem {
  const nItem = toNum((det as Record<string, unknown>)['@_nItem']) || index + 1
  const prod = (det.prod || {}) as Record<string, unknown>
  const imposto = (det.imposto || {}) as Record<string, unknown>

  const icmsData = extractIcms((imposto.ICMS || {}) as Record<string, unknown>)

  const pisNode = ((imposto.PIS as Record<string, unknown>) || {}) as Record<string, unknown>
  const pisAny = (pisNode.PISAliq ||
    pisNode.PISQtde ||
    pisNode.PISNT ||
    pisNode.PISOutr ||
    {}) as Record<string, unknown>
  const cstPis = toStr(pisAny.CST) || undefined
  const vPIS = toNum(pisAny.vPIS)

  const cofinsNode = ((imposto.COFINS as Record<string, unknown>) || {}) as Record<string, unknown>
  const cofinsAny = (cofinsNode.COFINSAliq ||
    cofinsNode.COFINSQtde ||
    cofinsNode.COFINSNT ||
    cofinsNode.COFINSOutr ||
    {}) as Record<string, unknown>
  const cstCofins = toStr(cofinsAny.CST) || undefined
  const vCOFINS = toNum(cofinsAny.vCOFINS)

  const ipiNode = ((imposto.IPI as Record<string, unknown>) || {}) as Record<string, unknown>
  const ipiTrib = ((ipiNode.IPITrib as Record<string, unknown>) || {}) as Record<string, unknown>
  const vIPI = toNum(ipiTrib.vIPI)

  const vDesc = toNum(prod.vDesc)

  return {
    nItem,
    cProd: toStr(prod.cProd) || undefined,
    xProd: toStr(prod.xProd) || 'Produto sem descrição',
    ncm: toStr(prod.NCM) || undefined,
    cfop: toStr(prod.CFOP),
    uCom: toStr(prod.uCom) || undefined,
    qCom: toNum(prod.qCom),
    vUnCom: toNum(prod.vUnCom),
    vProd: toNum(prod.vProd),
    vDesc,
    cstIcms: icmsData.cst,
    csosnIcms: icmsData.csosn,
    vBCIcms: icmsData.vBC,
    pICMS: icmsData.pICMS,
    vICMS: icmsData.vICMS,
    vST: icmsData.vST,
    cstPis,
    vPIS,
    cstCofins,
    vCOFINS,
    vIPI,
    tribIcms: deriveTribIcms(icmsData.cst, icmsData.csosn),
    tribPis: deriveTribPis(cstPis, cstCofins),
  }
}

function parseNfeXml(xmlContent: string): ParsedNfe {
  const xmlHash = createHash('sha256').update(xmlContent).digest('hex')

  let parsed: Record<string, unknown>
  try {
    parsed = parser.parse(xmlContent) as Record<string, unknown>
  } catch (e) {
    throw new XmlParseError(`Failed to parse XML: ${(e as Error).message}`, xmlContent.substring(0, 200))
  }

  // Unwrap root - can be nfeProc, NFe, or nfeProc > NFe
  let nfeRoot: Record<string, unknown> | null = null
  let chNFeFromProc: string | undefined
  let cStatFromProc: string | undefined

  if (parsed.nfeProc) {
    const proc = parsed.nfeProc as Record<string, unknown>
    nfeRoot = (proc.NFe as Record<string, unknown>) || null
    // chave e situação (cStat) vêm do protocolo de autorização da SEFAZ
    const protNFe = proc.protNFe as Record<string, unknown>
    if (protNFe?.infProt) {
      const infProt = protNFe.infProt as Record<string, unknown>
      chNFeFromProc = toStr(infProt.chNFe) || undefined
      cStatFromProc = toStr(infProt.cStat) || undefined
    }
  } else if (parsed.NFe) {
    nfeRoot = parsed.NFe as Record<string, unknown>
  } else {
    // Identify known unsupported document types for a clearer message
    const rootKeys = Object.keys(parsed).join(', ')
    if (rootKeys.includes('nfse') || rootKeys.includes('CompNfse') || rootKeys.includes('NFSe')) {
      throw new XmlParseError('Arquivo NFS-e (Nota Fiscal de Serviço) não é suportado. Apenas NF-e e NFC-e.')
    }
    if (rootKeys.includes('cteProc') || rootKeys.includes('CTe')) {
      throw new XmlParseError('Arquivo CT-e não é suportado. Apenas NF-e e NFC-e.')
    }
    throw new XmlParseError(`Elemento raiz não reconhecido (${rootKeys}). Esperado: nfeProc ou NFe.`)
  }

  if (!nfeRoot) {
    throw new XmlParseError('NFe element not found in XML')
  }

  const infNFe = nfeRoot.infNFe as Record<string, unknown>
  if (!infNFe) {
    throw new XmlParseError('infNFe element not found')
  }

  // Extract chNFe via regex to avoid float conversion of 44-digit numeric keys
  const chNFeRaw =
    xmlContent.match(/<chNFe>(\d{44})<\/chNFe>/)?.[1] ||
    xmlContent.match(/Id="NFe(\d{44})"/)?.[1] ||
    chNFeFromProc ||
    toStr((infNFe as Record<string, unknown>)['@_Id'])?.replace(/^NFe/, '') ||
    ''

  const chNFe = chNFeRaw.replace(/^NFe/, '')

  if (!chNFe || chNFe.length !== 44) {
    throw new XmlParseError(`Invalid chNFe: "${chNFe}" (length: ${chNFe.length})`)
  }

  const ide = infNFe.ide as Record<string, unknown>
  if (!ide) throw new XmlParseError('ide element not found')

  const mod = toNum(ide.mod)
  const serie = toStr(ide.serie)
  const nNF = toStr(ide.nNF)
  const tpNF = toNum(ide.tpNF)
  const natOp = toStr(ide.natOp) || undefined

  let dhEmi: Date
  try {
    dhEmi = parseDate(ide.dhEmi)
  } catch {
    dhEmi = parseDate(ide.dEmi)
  }

  const competencia = toCompetencia(dhEmi)

  // Emitente
  const emit = infNFe.emit as Record<string, unknown>
  if (!emit) throw new XmlParseError('emit element not found')

  const emitCnpj = toStr(emit.CNPJ) || toStr(emit.CPF) || ''
  const emitNome = toStr(emit.xNome) || toStr(emit.xFant) || ''
  const emitEnder = emit.enderEmit as Record<string, unknown>
  const emitUF = emitEnder ? toStr(emitEnder.UF) || undefined : undefined

  // Destinatário
  const dest = infNFe.dest as Record<string, unknown>
  let destCnpj: string | undefined
  let destCpf: string | undefined
  let destNome: string | undefined

  if (dest) {
    destNome = toStr(dest.xNome) || undefined
    const cnpj = toStr(dest.CNPJ)
    const cpf = toStr(dest.CPF)
    if (cnpj && cnpj.length === 14) {
      destCnpj = cnpj
    } else if (cpf && cpf.length === 11) {
      destCpf = cpf
    }
  }

  // Totais
  const total = infNFe.total as Record<string, unknown>
  const ICMSTot = (total?.ICMSTot || {}) as Record<string, unknown>

  const vProd = toNum(ICMSTot.vProd)
  const vDesc = toNum(ICMSTot.vDesc)
  const vNF = toNum(ICMSTot.vNF)
  const vICMS = toNum(ICMSTot.vICMS)
  const vICMSST = toNum(ICMSTot.vST)
  const vIPI = toNum(ICMSTot.vIPI)
  const vPIS = toNum(ICMSTot.vPIS)
  const vCOFINS = toNum(ICMSTot.vCOFINS)
  const vFrete = toNum(ICMSTot.vFrete)

  // Itens (det)
  const detRaw = infNFe.det
  const detArray: Record<string, unknown>[] = Array.isArray(detRaw)
    ? (detRaw as Record<string, unknown>[])
    : detRaw
      ? [detRaw as Record<string, unknown>]
      : []

  const items = detArray.map((d, i) => parseItem(d, i))

  return {
    chNFe,
    xmlHash,
    mod,
    serie,
    nNF,
    dhEmi,
    competencia,
    tpNF,
    natOp,
    emitCnpj,
    emitNome,
    emitUF,
    destCnpj,
    destCpf,
    destNome,
    vProd,
    vDesc,
    vNF,
    vICMS,
    vICMSST,
    vIPI,
    vPIS,
    vCOFINS,
    vFrete,
    status: statusFromCStat(cStatFromProc),
    items,
    events: [],
    xmlRaw: xmlContent,
  }
}

// Tags-raiz reais observadas em arquivos de evento de NF-e/NFC-e (confirmado
// contra XMLs de produção do usuário):
//   - retEnvEvento > retEvento > infEvento   → RESPOSTA da SEFAZ, com cStat
//     (só essa carrega a confirmação de homologação: cStat 135/155)
//   - envEvento > evento > infEvento         → PEDIDO assinado, sem cStat
//     (não confirma que a SEFAZ aceitou o evento)
//   - procEventoNFe/eventoCancNFe > evento+retEvento → variante combinada
//     (ex.: alguns retornos de Distribuição DFe agrupam pedido e resposta)
const EVENT_ROOT_MARKERS = ['retEnvEvento', 'envEvento', 'procEventoNFe', 'eventoCancNFe']

export function isEventXml(xmlContent: string): boolean {
  return EVENT_ROOT_MARKERS.some((m) => xmlContent.includes(m))
}

// `evento`/`detEvento`/`procEventoNFe` são forçados a array pelo parser
// (isArray) para suportar lotes com múltiplos eventos — aqui sempre lidamos
// com o primeiro/único.
function firstOf<T>(val: unknown): T | undefined {
  if (val === undefined || val === null) return undefined
  return (Array.isArray(val) ? val[0] : val) as T
}

function parseEventXml(xmlContent: string): ParsedNfeEvent | null {
  let parsed: Record<string, unknown>
  try {
    parsed = parser.parse(xmlContent) as Record<string, unknown>
  } catch {
    return null
  }

  // Remover prefixos de namespace (ex: "nfe:procEventoNFe" → "procEventoNFe")
  const normalizedParsed: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(parsed)) {
    const cleanKey = key.includes(':') ? key.split(':').pop()! : key
    normalizedParsed[cleanKey] = val
  }

  const procEventoNFe = firstOf<Record<string, unknown>>(normalizedParsed.procEventoNFe)
  const eventoCancNFe = firstOf<Record<string, unknown>>(normalizedParsed.eventoCancNFe)

  // envEvento pode vir solto (arquivo só de pedido) ou aninhado dentro de
  // procEventoNFe/eventoCancNFe (arquivo combinado pedido+resposta — achado
  // real: cancelamento da NFC-e 9603, LOJAO GAIBU, jul/2026, onde <retEvento>
  // é irmão direto de <envEvento> dentro de <procEventoNFe>, não embutido
  // nele). Sem isso, `eventoRoot` nunca era encontrado e o evento inteiro
  // era descartado (retornava null) mesmo já tendo cStat 135 homologado.
  const envEvento =
    (normalizedParsed.envEvento as Record<string, unknown>) ??
    (procEventoNFe?.envEvento as Record<string, unknown>) ??
    (eventoCancNFe?.envEvento as Record<string, unknown>)

  // 1) Resposta homologada da SEFAZ — única fonte confiável para mudar o
  // status da nota (é onde mora o cStat). Pode estar em retEnvEvento.retEvento
  // (arquivo de resposta separado) ou em retEvento como irmão de envEvento
  // dentro de procEventoNFe/eventoCancNFe (arquivo combinado).
  const retEnvEvento = normalizedParsed.retEnvEvento as Record<string, unknown>
  const retEventoRaw =
    retEnvEvento?.retEvento ??
    normalizedParsed.retEvento ??
    procEventoNFe?.retEvento ??
    eventoCancNFe?.retEvento
  if (retEventoRaw) {
    const list = Array.isArray(retEventoRaw) ? retEventoRaw : [retEventoRaw]
    for (const re of list as Record<string, unknown>[]) {
      const infEvento = re?.infEvento as Record<string, unknown>
      if (!infEvento) continue
      const cStat = toStr(infEvento.cStat)
      if (cStat !== '135' && cStat !== '155') continue // só confia em evento homologado

      const tpEvento = toStr(infEvento.tpEvento)
      const nSeqEvento = toNum(infEvento.nSeqEvento) || 1
      let dhEvento: Date
      try {
        dhEvento = parseDate(infEvento.dhRegEvento ?? infEvento.dhEvento)
      } catch {
        dhEvento = new Date()
      }
      // xMotivo do retEvento costuma ser genérico ("Evento registrado e
      // vinculado a NF-e") — prioriza a justificativa real do pedido
      // (xJust), quando o envEvento correspondente estiver disponível.
      const eventoRootForMotivo = firstOf<Record<string, unknown>>(envEvento?.evento)
      const infEventoPedido = eventoRootForMotivo?.infEvento as Record<string, unknown> | undefined
      const detEventoPedido = firstOf<Record<string, unknown>>(infEventoPedido?.detEvento)
      const xMotivo = toStr(detEventoPedido?.xJust) || toStr(infEvento.xMotivo) || undefined

      return {
        tpEvento,
        nSeqEvento,
        dhEvento,
        xMotivo,
        nProt: toStr(infEvento.nProt) || undefined,
      }
    }
    return null // havia retEvento, mas nenhum homologado (cStat diferente de 135/155)
  }

  // 2) Pedido de evento assinado, ainda sem confirmação da SEFAZ (sem cStat).
  // Não é suficiente para mudar o status da nota — só o retEvento confirma.
  const eventoRoot = firstOf<Record<string, unknown>>(
    envEvento?.evento ?? normalizedParsed.evento ?? procEventoNFe?.evento ?? eventoCancNFe?.evento
  )
  if (!eventoRoot) return null

  const infEvento = eventoRoot.infEvento as Record<string, unknown>
  if (!infEvento) return null

  const tpEvento = toStr(infEvento.tpEvento)
  const nSeqEvento = toNum(infEvento.nSeqEvento) || 1
  let dhEvento: Date
  try {
    dhEvento = parseDate(infEvento.dhEvento)
  } catch {
    dhEvento = new Date()
  }
  const detEvento = firstOf<Record<string, unknown>>(infEvento.detEvento)
  const xMotivo = toStr(detEvento?.xJust) || toStr(detEvento?.xMotivo) || undefined

  return { tpEvento, nSeqEvento, dhEvento, xMotivo, nProt: undefined }
}

// Envelopes técnicos de web service da SEFAZ que aparecem nas mesmas pastas
// do Drive que os XMLs de NF-e (lote de envio/protocolo, consulta de GTIN),
// mas não são documentos fiscais — não têm nada a importar, então não devem
// contar como "erro" de importação, só ser ignorados silenciosamente.
const NON_FISCAL_ROOT_MARKERS = ['enviNFe', 'retEnviNFe', 'consGTIN', 'nfeResultMsg']

export function isNonFiscalTechnicalXml(xmlContent: string): boolean {
  return NON_FISCAL_ROOT_MARKERS.some((m) => xmlContent.includes(m))
}

export function parseXml(xmlContent: string): {
  type: 'nfe' | 'event' | 'non_fiscal' | 'unknown'
  nfe?: ParsedNfe
  event?: ParsedNfeEvent
  chNFe?: string
  error?: string
} {
  const xmlStr = xmlContent.trim()

  if (isNonFiscalTechnicalXml(xmlStr)) {
    return { type: 'non_fiscal', error: 'Envelope técnico da SEFAZ (lote/GTIN), não é um documento fiscal' }
  }

  if (isEventXml(xmlStr)) {
    const chMatch = xmlStr.match(/chNFe>(\d{44})</)?.[1]
    try {
      const event = parseEventXml(xmlStr)
      if (event) {
        return { type: 'event', event, chNFe: chMatch }
      }
      // Envelope de evento reconhecido, mas sem confirmação homologada da
      // SEFAZ ainda (ex.: só chegou o pedido "-ped-eve.xml", sem o "-eve.xml").
      return { type: 'event', chNFe: chMatch, error: 'Evento sem confirmação de homologação (cStat) da SEFAZ' }
    } catch (e) {
      return { type: 'unknown', error: (e as Error).message }
    }
  }

  // Try to parse as NF-e
  try {
    const nfe = parseNfeXml(xmlStr)
    return { type: 'nfe', nfe }
  } catch (e) {
    return { type: 'unknown', error: (e as Error).message }
  }
}

export function extractChNFeFromFilename(filename: string): string | undefined {
  const match = filename.match(/(\d{44})/)
  return match?.[1]
}
