import { FastifyInstance } from 'fastify'
import { calcularTributos, TaxConsultaInput } from '../services/tax/taxEngine.js'

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
