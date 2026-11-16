import { FastifyInstance } from 'fastify'
import { calcularTributos, TaxConsultaInput } from '../services/tax/taxEngine.js'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export default async function taxRoutes(app: FastifyInstance) {

  // POST /api/tax/consulta
  app.post('/consulta', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = req.body as Partial<TaxConsultaInput>

    if (!body.ncm || body.ncm.length < 4) {
      return reply.status(400).send({ error: 'NCM inválido. Informe ao menos 4 dígitos.' })
    }
    if (!body.origem || !body.destino) {
      return reply.status(400).send({ error: 'Origem e destino são obrigatórios.' })
    }

    const input: TaxConsultaInput = {
      produto:         body.produto        ?? 'Produto não informado',
      ncm:             body.ncm.replace(/\D/g, '').padEnd(8, '0').substring(0, 8),
      origem:          body.origem,
      destino:         body.destino,
      regime:          body.regime         ?? 'lucro_presumido',
      tipoOperacao:    body.tipoOperacao   ?? 'venda',
      consumidorFinal: body.consumidorFinal ?? false,
      importado:       body.importado      ?? false,
      cfopManual:      body.cfopManual,
      valorUnitario:   body.valorUnitario,
    }

    try {
      const resultado = calcularTributos(input)
      return reply.send(resultado)
    } catch (err: unknown) {
      const e = err as Error
      return reply.status(500).send({ error: e.message || 'Erro no cálculo tributário' })
    }
  })

  // GET /api/tax/ncm/search?q= — busca NCM por descrição ou código (proxy BrasilAPI)
  app.get('/ncm/search', async (req, reply) => {
    const { q } = req.query as { q?: string }
    const term = (q ?? '').trim()
    if (term.length < 2) return reply.send([])

    try {
      const url = `https://brasilapi.com.br/api/ncm/v1?search=${encodeURIComponent(term)}`
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { 'Accept': 'application/json' },
      })
      if (!res.ok) return reply.send([])
      const data = await res.json() as Array<{ codigo: string; descricao: string }>
      // Retorna só os campos necessários, limitado a 20
      return reply.send(
        data.slice(0, 20).map(item => ({
          ncm: item.codigo,
          descricao: item.descricao,
        }))
      )
    } catch {
      return reply.send([])
    }
  })

  // POST /api/tax/ncm/validate-products — valida NCM vs descrição do produto via IA
  app.post('/ncm/validate-products', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = req.body as { items: Array<{ xProd: string; ncm: string }> }
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return reply.status(400).send({ error: 'items é obrigatório' })
    }

    // Deduplicar por (xProd, ncm)
    const unique = Array.from(
      new Map(body.items.map(i => [`${i.xProd}||${i.ncm}`, i])).values()
    ).slice(0, 50) // limite por chamada

    const results: Record<string, { status: string; ncmDesc: string | null; motivo: string | null }> = {}

    for (const item of unique) {
      const key = `${item.xProd}||${item.ncm}`
      const ncmClean = item.ncm?.replace(/\D/g, '') || ''

      if (!ncmClean || ncmClean.length < 4) {
        results[key] = { status: 'incerto', ncmDesc: null, motivo: 'NCM ausente ou muito curto' }
        continue
      }

      // Verifica cache
      const cached = await prisma.ncmValidationCache.findUnique({
        where: { xProd_ncm: { xProd: item.xProd, ncm: ncmClean } },
      })
      if (cached) {
        results[key] = { status: cached.status, ncmDesc: cached.ncmDesc, motivo: cached.motivo }
        continue
      }

      // Busca descrição do NCM na BrasilAPI
      let ncmDesc: string | null = null
      try {
        const brasilRes = await fetch(
          `https://brasilapi.com.br/api/ncm/v1/${ncmClean}`,
          { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } }
        )
        if (brasilRes.ok) {
          const brasilData = await brasilRes.json() as { descricao?: string }
          ncmDesc = brasilData.descricao || null
        }
      } catch { /* ignora timeout */ }

      if (!ncmDesc) {
        const row = { status: 'incerto', ncmDesc: null, motivo: 'NCM não encontrado na tabela TIPI' }
        results[key] = row
        await prisma.ncmValidationCache.create({ data: { xProd: item.xProd, ncm: ncmClean, ...row } })
        continue
      }

      // Chama Claude Haiku para comparação semântica
      let status = 'incerto'
      let motivo = ''
      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 120,
          messages: [{
            role: 'user',
            content: `Produto fiscal: "${item.xProd}"
NCM: ${ncmClean}
Descrição oficial do NCM na tabela TIPI: "${ncmDesc}"

O NCM é compatível com o produto? Responda APENAS em JSON: {"status":"compativel"|"incompativel"|"incerto","motivo":"uma frase curta"}`,
          }],
        })
        const raw = (msg.content[0] as { text: string }).text.trim()
        const jsonMatch = raw.match(/\{.*\}/s)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { status: string; motivo: string }
          status = ['compativel', 'incompativel', 'incerto'].includes(parsed.status)
            ? parsed.status
            : 'incerto'
          motivo = parsed.motivo || ''
        }
      } catch { motivo = 'Erro ao consultar IA' }

      const row = { status, ncmDesc, motivo }
      results[key] = row
      await prisma.ncmValidationCache.upsert({
        where: { xProd_ncm: { xProd: item.xProd, ncm: ncmClean } },
        create: { xProd: item.xProd, ncm: ncmClean, ...row },
        update: row,
      })
    }

    return reply.send(results)
  })

  // GET /api/tax/ufs — lista de UFs disponíveis
  app.get('/ufs', async (_req, reply) => {
    const ufs = [
      { uf: 'AC', nome: 'Acre' },
      { uf: 'AL', nome: 'Alagoas' },
      { uf: 'AP', nome: 'Amapá' },
      { uf: 'AM', nome: 'Amazonas' },
      { uf: 'BA', nome: 'Bahia' },
      { uf: 'CE', nome: 'Ceará' },
      { uf: 'DF', nome: 'Distrito Federal' },
      { uf: 'ES', nome: 'Espírito Santo' },
      { uf: 'GO', nome: 'Goiás' },
      { uf: 'MA', nome: 'Maranhão' },
      { uf: 'MT', nome: 'Mato Grosso' },
      { uf: 'MS', nome: 'Mato Grosso do Sul' },
      { uf: 'MG', nome: 'Minas Gerais' },
      { uf: 'PA', nome: 'Pará' },
      { uf: 'PB', nome: 'Paraíba' },
      { uf: 'PR', nome: 'Paraná' },
      { uf: 'PE', nome: 'Pernambuco' },
      { uf: 'PI', nome: 'Piauí' },
      { uf: 'RJ', nome: 'Rio de Janeiro' },
      { uf: 'RN', nome: 'Rio Grande do Norte' },
      { uf: 'RS', nome: 'Rio Grande do Sul' },
      { uf: 'RO', nome: 'Rondônia' },
      { uf: 'RR', nome: 'Roraima' },
      { uf: 'SC', nome: 'Santa Catarina' },
      { uf: 'SP', nome: 'São Paulo' },
      { uf: 'SE', nome: 'Sergipe' },
      { uf: 'TO', nome: 'Tocantins' },
    ]
    return reply.send(ufs)
  })

  // GET /api/tax/reforma — dados da reforma tributária
  app.get('/reforma', { preHandler: [app.authenticate] }, async (_req, reply) => {
    const { REFORMA_TRIBUTARIA } = await import('../services/tax/taxData.js')
    return reply.send(REFORMA_TRIBUTARIA)
  })
}
