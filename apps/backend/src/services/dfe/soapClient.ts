import { request as httpsRequest } from 'https'
import { gunzipSync } from 'zlib'
import { XMLParser } from 'fast-xml-parser'

/** 1 = Produção, 2 = Homologação (NT 2014.002 — distDFeInt/tpAmb) */
export type Ambiente = 1 | 2

const ENDPOINTS: Record<Ambiente, string> = {
  1: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  2: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
}

const SOAP_ACTION = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse'

export class DistribuicaoDFeError extends Error {
  constructor(
    message: string,
    public readonly cStat?: string
  ) {
    super(message)
    this.name = 'DistribuicaoDFeError'
  }
}

export interface DistribuicaoDoc {
  nsu: string
  schema: string
  xml: string
  /** true for procNFe/procEventoNFe — full documents that the existing import pipeline can parse */
  isFullDocument: boolean
  chave?: string
}

export interface DistribuicaoResult {
  cStat: string
  xMotivo: string
  ultNSU: string
  maxNSU: string
  docs: DistribuicaoDoc[]
}

export interface DistNsuRequest {
  ambiente: Ambiente
  cUFAutor: number
  cnpj: string
  ultNSU: string
  pfxBuffer: Buffer
  passphrase: string
}

const NSU_LENGTH = 15

function padNsu(value: string): string {
  return value.padStart(NSU_LENGTH, '0').slice(-NSU_LENGTH)
}

function buildDistNsuEnvelope(cUFAutor: number, cnpj: string, ambiente: Ambiente, ultNSU: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${ambiente}</tpAmb>
          <cUFAutor>${cUFAutor}</cUFAutor>
          <CNPJ>${cnpj}</CNPJ>
          <distNSU>
            <ultNSU>${padNsu(ultNSU)}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`
}

export class CertificateAuthError extends DistribuicaoDFeError {
  constructor(message: string) {
    super(message)
    this.name = 'CertificateAuthError'
  }
}

function postSoap(url: string, body: string, pfxBuffer: Buffer, passphrase: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { hostname, pathname, port, protocol } = new URL(url)

    const req = httpsRequest(
      {
        protocol,
        hostname,
        path: pathname,
        port: port || 443,
        method: 'POST',
        pfx: pfxBuffer,
        passphrase,
        headers: {
          'Content-Type': `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 60_000,
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new DistribuicaoDFeError(`SEFAZ retornou HTTP ${res.statusCode}: ${text.slice(0, 500)}`))
            return
          }
          resolve(text)
        })
      }
    )

    req.on('timeout', () => {
      req.destroy(new DistribuicaoDFeError('Tempo esgotado ao conectar com o Ambiente Nacional da NF-e'))
    })
    req.on('error', (err) => {
      if (err instanceof DistribuicaoDFeError) reject(err)
      else if (/passphrase|mac verify failure|pfx/i.test(err.message)) {
        reject(new CertificateAuthError('Não foi possível autenticar com o certificado digital. Verifique se ele ainda é válido.'))
      } else reject(new DistribuicaoDFeError(`Falha de conexão com a SEFAZ: ${err.message}`))
    })

    req.write(body)
    req.end()
  })
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true })

/** SOAP responses nest retDistDFeInt under varying namespace-prefixed wrappers — search for it by shape. */
function findRetDistDFeInt(node: unknown): Record<string, any> | undefined {
  if (!node || typeof node !== 'object') return undefined
  const obj = node as Record<string, unknown>
  if ('cStat' in obj && ('loteDistDFeInt' in obj || 'ultNSU' in obj)) {
    return obj as Record<string, any>
  }
  for (const value of Object.values(obj)) {
    const found = findRetDistDFeInt(value)
    if (found) return found
  }
  return undefined
}

function isFullDocumentSchema(schema: string): boolean {
  return /^proc(NFe|EventoNFe|CTe|InutNFe)/i.test(schema)
}

function extractChave(xml: string): string | undefined {
  const match = xml.match(/<chNFe>(\d{44})<\/chNFe>|Id=["']NFe(\d{44})["']/)
  return match?.[1] || match?.[2]
}

function parseDistribuicaoResponse(soapXml: string): DistribuicaoResult {
  const parsed = xmlParser.parse(soapXml)
  const ret = findRetDistDFeInt(parsed)
  if (!ret) {
    throw new DistribuicaoDFeError('Resposta inesperada da SEFAZ: retDistDFeInt não encontrado no envelope SOAP.')
  }

  const cStat = String(ret.cStat ?? '')
  const xMotivo = String(ret.xMotivo ?? '')
  const ultNSU = padNsu(String(ret.ultNSU ?? '0'))
  const maxNSU = padNsu(String(ret.maxNSU ?? '0'))

  const docs: DistribuicaoDoc[] = []
  const lote = ret.loteDistDFeInt
  const rawDocs: unknown[] = lote?.docZip ? (Array.isArray(lote.docZip) ? lote.docZip : [lote.docZip]) : []

  for (const raw of rawDocs) {
    const isObj = raw && typeof raw === 'object'
    const base64 = isObj ? String((raw as Record<string, unknown>)['#text'] ?? '') : String(raw ?? '')
    const schema = isObj ? String((raw as Record<string, unknown>)['@_schema'] ?? '') : ''
    const nsu = isObj ? String((raw as Record<string, unknown>)['@_NSU'] ?? '') : ''
    if (!base64) continue

    let xml: string
    try {
      xml = gunzipSync(Buffer.from(base64, 'base64')).toString('utf-8')
    } catch {
      continue // corrupt/unexpected entry — skip rather than fail the whole batch
    }

    docs.push({
      nsu: padNsu(nsu),
      schema,
      xml,
      isFullDocument: isFullDocumentSchema(schema),
      chave: extractChave(xml),
    })
  }

  return { cStat, xMotivo, ultNSU, maxNSU, docs }
}

/**
 * Calls nfeDistDFeInteresse with a `distNSU` request — the incremental "give me
 * everything after this NSU" query used for automated polling (NT 2014.002).
 */
export async function consultarDistribuicaoPorNsu(req: DistNsuRequest): Promise<DistribuicaoResult> {
  const url = ENDPOINTS[req.ambiente]
  const envelope = buildDistNsuEnvelope(req.cUFAutor, req.cnpj, req.ambiente, req.ultNSU)
  const responseXml = await postSoap(url, envelope, req.pfxBuffer, req.passphrase)
  return parseDistribuicaoResponse(responseXml)
}
