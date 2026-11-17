import { FastifyInstance } from 'fastify'
import { calcularTributos, TaxConsultaInput } from '../services/tax/taxEngine.js'
import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient, Prisma } from '@prisma/client'
import { descreverCfop } from '../services/tax/taxData.js'
import {
  classificarNcmPisCofins,
  classificarCstPisCofins,
  divergenciaPisCofins,
  isCfopSaida,
} from '../services/tax/pisCofinsClassifier.js'

const prisma = new PrismaClient()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CFOP_DESC: Record<string, string> = {
  '1101': 'Compra p/ industrialização', '1102': 'Compra p/ comercialização',
  '1116': 'Compra p/ industrialização (ST)', '1202': 'Devolução de venda',
  '1411': 'Compra p/ ativo imobilizado', '1556': 'Compra p/ uso/consumo',
  '2101': 'Compra interestadual p/ industrialização', '2102': 'Compra interestadual p/ comercialização',
  '2202': 'Devolução de venda interestadual', '2411': 'Compra interestadual p/ ativo',
  '5101': 'Venda de produção própria', '5102': 'Venda de mercadoria de terceiros',
  '5103': 'Venda de produção (ST)', '5405': 'Venda com ICMS-ST',
  '5933': 'Prestação de serviço', '5949': 'Outra saída',
  '6101': 'Venda interestadual de produção', '6102': 'Venda interestadual de terceiros',
  '6405': 'Venda interestadual com ICMS-ST', '6933': 'Serviço interestadual',
}

function auditCfop(cfop: string, entradaCount: number, saidaCount: number) {
  const first = parseInt(cfop[0] ?? '0')
  const desc = CFOP_DESC[cfop] ?? `CFOP ${cfop}`
  const isEntrada = [1, 2, 3].includes(first)
  const isSaida = [5, 6, 7].includes(first)

  if (isEntrada && saidaCount > 0 && entradaCount === 0) {
    return { cfopStatus: 'erro' as const, cfopMotivo: `${desc} — CFOP de entrada usado em nota de saída` }
  }
  if (isSaida && entradaCount > 0 && saidaCount === 0) {
    return { cfopStatus: 'erro' as const, cfopMotivo: `${desc} — CFOP de saída usado em nota de entrada` }
  }
  if (first === 6) {
    return { cfopStatus: 'atencao' as const, cfopMotivo: `${desc} — Operação interestadual: verifique UF destino` }
  }
  if (first === 2) {
    return { cfopStatus: 'atencao' as const, cfopMotivo: `${desc} — Compra interestadual: verifique UF fornecedor` }
  }
  if (!isEntrada && !isSaida) {
    return { cfopStatus: 'erro' as const, cfopMotivo: `CFOP ${cfop} inválido` }
  }
  return { cfopStatus: 'ok' as const, cfopMotivo: desc }
}

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

    const results: Record<string, { status: string; ncmDesc: string | null; motivo: string | null; ncmSugerido: string | null }> = {}

    for (const item of unique) {
      const key = `${item.xProd}||${item.ncm}`
      const ncmClean = item.ncm?.replace(/\D/g, '') || ''

      if (!ncmClean || ncmClean.length < 4) {
        results[key] = { status: 'incerto', ncmDesc: null, motivo: 'NCM ausente ou muito curto', ncmSugerido: null }
        continue
      }

      // Verifica cache
      const cached = await prisma.ncmValidationCache.findUnique({
        where: { xProd_ncm: { xProd: item.xProd, ncm: ncmClean } },
      })
      if (cached) {
        // Re-valida se não tem sugestão e não é compatível (cache antigo sem ncmSugerido)
        if (cached.ncmSugerido !== null || cached.status === 'compativel') {
          results[key] = { status: cached.status, ncmDesc: cached.ncmDesc, motivo: cached.motivo, ncmSugerido: cached.ncmSugerido ?? null }
          continue
        }
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
        const row = { status: 'incerto', ncmDesc: null, motivo: 'NCM não encontrado na tabela TIPI', ncmSugerido: null }
        results[key] = row
        await prisma.ncmValidationCache.create({ data: { xProd: item.xProd, ncm: ncmClean, ...row } })
        continue
      }

      // Chama Claude Haiku para comparação semântica
      let status = 'incerto'
      let motivo = ''
      let ncmSugerido: string | null = null
      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `Produto fiscal: "${item.xProd}"
NCM: ${ncmClean}
Descrição oficial do NCM na tabela TIPI: "${ncmDesc}"

O NCM é compatível com o produto? Responda APENAS em JSON:
{"status":"compativel"|"incompativel"|"incerto","motivo":"uma frase curta","ncm_sugerido":"descrição do NCM correto ou null se compativel"}`,
          }],
        })
        const raw = (msg.content[0] as { text: string }).text.trim()
        const jsonMatch = raw.match(/\{.*\}/s)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { status: string; motivo: string; ncm_sugerido?: string | null }
          status = ['compativel', 'incompativel', 'incerto'].includes(parsed.status)
            ? parsed.status
            : 'incerto'
          motivo = parsed.motivo || ''
          if (status !== 'compativel' && parsed.ncm_sugerido && parsed.ncm_sugerido !== 'null') {
            ncmSugerido = parsed.ncm_sugerido
          }
        }
      } catch { motivo = 'Erro ao consultar IA' }

      const row = { status, ncmDesc, motivo, ncmSugerido }
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

  // POST /api/tax/cfop/validate-items — valida CFOP vs produto/NCM via IA
  app.post('/cfop/validate-items', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = req.body as { items: Array<{ xProd: string; ncm: string; cfop: string; tpNF: number; ncmDesc?: string }>; forceRevalidate?: boolean }
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      return reply.status(400).send({ error: 'items é obrigatório' })
    }

    const unique = Array.from(
      new Map(body.items.map(i => [`${i.xProd}||${i.ncm}||${i.cfop}||${i.tpNF}`, i])).values()
    ).slice(0, 50)

    const results: Record<string, { status: string; cfopSugerido: string | null; motivo: string | null }> = {}

    for (const item of unique) {
      const key = `${item.xProd}||${item.ncm}||${item.cfop}||${item.tpNF}`

      // Verifica cache (a menos que forceRevalidate=true)
      if (!body.forceRevalidate) {
        const cached = await prisma.cfopValidationCache.findUnique({
          where: { xProd_ncm_cfop_tpNF: { xProd: item.xProd, ncm: item.ncm, cfop: item.cfop, tpNF: item.tpNF } },
        })
        if (cached) {
          results[key] = { status: cached.status, cfopSugerido: cached.cfopSugerido, motivo: cached.motivo }
          continue
        }
      }

      // Busca descrição do NCM se não fornecida
      let ncmDesc = item.ncmDesc ?? null
      if (!ncmDesc && item.ncm) {
        try {
          const r = await fetch(`https://brasilapi.com.br/api/ncm/v1/${item.ncm.replace(/\D/g, '')}`,
            { signal: AbortSignal.timeout(5000) })
          if (r.ok) ncmDesc = ((await r.json()) as { descricao?: string }).descricao ?? null
        } catch { /* ignora */ }
      }

      const operacao = item.tpNF === 0 ? 'Entrada (recebimento/compra de fornecedor)' : 'Saída (venda ao cliente)'
      const cfopDesc = CFOP_DESC[item.cfop] ?? `CFOP ${item.cfop}`

      let status = 'incerto'
      let cfopSugerido: string | null = null
      let motivo = ''

      try {
        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: `Você é um especialista em legislação tributária brasileira (NF-e/NFC-e).

Produto fiscal: "${item.xProd}"
NCM: ${item.ncm}${ncmDesc ? ` — ${ncmDesc}` : ''}
CFOP atual: ${item.cfop} (${cfopDesc})
Tipo de operação: ${operacao}

Analise se o CFOP ${item.cfop} está correto para este produto e operação. Regras obrigatórias:

1. Direção: 1xxx/2xxx = entrada; 5xxx/6xxx = saída. Sentido errado = "incorreto".
2. 5101 vs 5102 (crítico):
   - 5101 = venda de PRODUÇÃO PRÓPRIA (estabelecimento fabricou/produziu o item)
   - 5102 = venda de MERCADORIA ADQUIRIDA DE TERCEIROS (comprou pronto e revendeu)
   - Se pelo nome do produto NÃO É POSSÍVEL DETERMINAR se o estabelecimento produz ou compra, retorne "incerto" explicando a dúvida.
   - Exemplo: "SOBREMESA" em padaria pode ser produção própria (5101) ou revenda (5102) — retorne "incerto".
3. Produtos claramente industrializados pelo emissor → 5101
4. Produtos claramente adquiridos para revenda → 5102
5. Serviços → 5933; Ativo imobilizado → 1411/5551; Uso/consumo → 1556

Responda APENAS em JSON: {"status":"correto"|"incorreto"|"incerto","cfop_sugerido":"XXXX"|null,"motivo":"frase curta explicando a dúvida ou o erro"}`,
          }],
        })
        const raw = (msg.content[0] as { text: string }).text.trim()
        const jsonMatch = raw.match(/\{.*\}/s)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { status: string; cfop_sugerido: string | null; motivo: string }
          status = ['correto', 'incorreto', 'incerto'].includes(parsed.status) ? parsed.status : 'incerto'
          cfopSugerido = (parsed.cfop_sugerido && parsed.cfop_sugerido !== 'null') ? parsed.cfop_sugerido : null
          motivo = parsed.motivo ?? ''
        }
      } catch { motivo = 'Erro ao consultar IA' }

      const row = { status, cfopSugerido, motivo }
      results[key] = row
      await prisma.cfopValidationCache.upsert({
        where: { xProd_ncm_cfop_tpNF: { xProd: item.xProd, ncm: item.ncm, cfop: item.cfop, tpNF: item.tpNF } },
        create: { xProd: item.xProd, ncm: item.ncm, cfop: item.cfop, tpNF: item.tpNF, ...row },
        update: row,
      })
    }

    return reply.send(results)
  })

  // GET /api/tax/audit — auditoria tributária NCM + CFOP
  app.get('/audit', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { companyId, competencia } = req.query as { companyId?: string; competencia?: string }

    type RawItem = {
      xProd: string
      ncm: string | null
      cfop: string
      count: number
      vTotal: number
      entradaCount: number
      saidaCount: number
      cstPis: string | null
    }

    const filters: Prisma.Sql[] = [Prisma.sql`n.status != 'CANCELADA'`]
    if (companyId) filters.push(Prisma.sql`n."companyId" = ${companyId}`)
    if (competencia) filters.push(Prisma.sql`n.competencia = ${competencia}`)
    const whereClause = Prisma.join(filters, ' AND ')

    const raw = await prisma.$queryRaw<RawItem[]>`
      SELECT
        ni."xProd",
        ni.ncm,
        ni.cfop,
        COUNT(*)::int AS count,
        COALESCE(SUM(ni."vProd")::float, 0) AS "vTotal",
        SUM(CASE WHEN n."tpNF" = 0 THEN 1 ELSE 0 END)::int AS "entradaCount",
        SUM(CASE WHEN n."tpNF" = 1 THEN 1 ELSE 0 END)::int AS "saidaCount",
        MODE() WITHIN GROUP (ORDER BY ni."cstPis") AS "cstPis"
      FROM nfe_items ni
      JOIN nfes n ON n.id = ni."nfeId"
      WHERE ${whereClause}
      GROUP BY ni."xProd", ni.ncm, ni.cfop
      ORDER BY "vTotal" DESC
      LIMIT 300
    `

    // Busca cache NCM para todos os pares únicos
    const pairs = [...new Map(raw.map(r => [`${r.xProd}||${r.ncm ?? ''}`, { xProd: r.xProd, ncm: r.ncm ?? '' }])).values()]
    const caches = pairs.length > 0
      ? await prisma.ncmValidationCache.findMany({ where: { OR: pairs } })
      : []
    const cacheMap = new Map(caches.map(c => [`${c.xProd}||${c.ncm}`, c]))

    const items = raw.map(r => {
      const cache = cacheMap.get(`${r.xProd}||${r.ncm ?? ''}`)
      const { cfopStatus, cfopMotivo } = auditCfop(r.cfop, r.entradaCount, r.saidaCount)
      const ncmStatus = cache?.status ?? null
      const lei = classificarNcmPisCofins(r.ncm)
      const pisDivergencia = divergenciaPisCofins(lei, r.cstPis, r.cfop)
      const risco = ncmStatus === 'incompativel' || cfopStatus === 'erro' ? 'alto'
        : ncmStatus === 'incerto' || cfopStatus === 'atencao' || pisDivergencia ? 'medio'
        : ncmStatus === 'compativel' && cfopStatus === 'ok' ? 'ok'
        : 'nao_validado'

      const tpNF = r.saidaCount >= r.entradaCount ? 1 : 0
      return {
        xProd: r.xProd, ncm: r.ncm, cfop: r.cfop, tpNF,
        count: r.count, vTotal: r.vTotal,
        ncmStatus, ncmDesc: cache?.ncmDesc ?? null,
        ncmSugerido: cache?.ncmSugerido ?? null, motivo: cache?.motivo ?? null,
        cfopStatus, cfopMotivo, risco,
        cstPis: r.cstPis,
        pisCofins: {
          regime: lei.regime, grupo: lei.grupo, base: lei.base, verificar: lei.verificar,
          divergencia: pisDivergencia,
        },
      }
    })

    const summary = {
      total: items.length,
      alto: items.filter(i => i.risco === 'alto').length,
      medio: items.filter(i => i.risco === 'medio').length,
      ok: items.filter(i => i.risco === 'ok').length,
      naoValidado: items.filter(i => i.risco === 'nao_validado').length,
      ncmIncompativel: items.filter(i => i.ncmStatus === 'incompativel').length,
      ncmIncerto: items.filter(i => i.ncmStatus === 'incerto').length,
      ncmCompativel: items.filter(i => i.ncmStatus === 'compativel').length,
      cfopErro: items.filter(i => i.cfopStatus === 'erro').length,
      cfopAtencao: items.filter(i => i.cfopStatus === 'atencao').length,
      pisCofinsMonofasico: items.filter(i => i.pisCofins.regime === 'monofasico').length,
      pisCofinsSt: items.filter(i => i.pisCofins.regime === 'st').length,
      pisCofinsDivergente: items.filter(i => i.pisCofins.divergencia).length,
    }

    return reply.send({ items, summary, truncated: raw.length === 300 })
  })

  // GET /api/tax/pis-cofins-cfop — receita por CFOP segregada em Normal / ST / Monofásico
  app.get('/pis-cofins-cfop', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { companyId, competencia } = req.query as { companyId?: string; competencia?: string }

    const filters: Prisma.Sql[] = [Prisma.sql`n.status NOT IN ('CANCELADA', 'DENEGADA', 'INUTILIZADA')`]
    if (companyId) filters.push(Prisma.sql`n."companyId" = ${companyId}`)
    if (competencia) filters.push(Prisma.sql`n.competencia = ${competencia}`)
    const whereClause = Prisma.join(filters, ' AND ')

    const raw = await prisma.$queryRaw<Array<{
      cfop: string; ncm: string | null; cstPis: string | null; xProd: string; count: number; valor: number
    }>>`
      SELECT
        ni.cfop,
        ni.ncm,
        ni."cstPis",
        ni."xProd",
        COUNT(*)::int AS count,
        COALESCE(SUM(ni."vProd" - ni."vDesc")::float, 0) AS valor
      FROM nfe_items ni
      JOIN nfes n ON n.id = ni."nfeId"
      WHERE ${whereClause}
      GROUP BY ni.cfop, ni.ncm, ni."cstPis", ni."xProd"
    `

    type Linha = {
      cfop: string; descricao: string; direcao: 'saida' | 'entrada'
      total: number; normal: number; st: number; monofasico: number
      monofasicoDeclarado: number; stDeclarado: number; divergente: number; itens: number
    }
    const novaLinha = (cfop: string, descricao: string, direcao: Linha['direcao']): Linha => ({
      cfop, descricao, direcao,
      total: 0, normal: 0, st: 0, monofasico: 0, monofasicoDeclarado: 0, stDeclarado: 0, divergente: 0, itens: 0,
    })

    const porCfop = new Map<string, Linha>()
    const totais = { saida: novaLinha('', 'Total das saídas', 'saida'), entrada: novaLinha('', 'Total das entradas', 'entrada') }
    const divergencias: Array<{
      xProd: string; ncm: string | null; cfop: string; cstPis: string | null; valor: number; count: number
      regime: string; grupo: string | null; base: string | null; verificar: string | null
      tipo: string; severidade: string; mensagem: string
    }> = []

    for (const r of raw) {
      const direcao: Linha['direcao'] = isCfopSaida(r.cfop) ? 'saida' : 'entrada'
      let linha = porCfop.get(r.cfop)
      if (!linha) {
        linha = novaLinha(r.cfop, descreverCfop(r.cfop).descricao, direcao)
        porCfop.set(r.cfop, linha)
      }
      const lei = classificarNcmPisCofins(r.ncm)
      const declarado = classificarCstPisCofins(r.cstPis)
      const div = divergenciaPisCofins(lei, r.cstPis, r.cfop)

      for (const alvo of [linha, totais[direcao]]) {
        alvo.total += r.valor
        alvo[lei.regime] += r.valor
        alvo.itens += r.count
        if (declarado === 'monofasico') alvo.monofasicoDeclarado += r.valor
        if (declarado === 'st') alvo.stDeclarado += r.valor
        if (div) alvo.divergente += r.valor
      }
      if (div) {
        divergencias.push({
          xProd: r.xProd, ncm: r.ncm, cfop: r.cfop, cstPis: r.cstPis, valor: r.valor, count: r.count,
          regime: lei.regime, grupo: lei.grupo, base: lei.base, verificar: lei.verificar, ...div,
        })
      }
    }

    divergencias.sort((a, b) => b.valor - a.valor)
    const somaTipos = (tipos: string[]) =>
      divergencias.filter(d => tipos.includes(d.tipo)).reduce((s, d) => s + d.valor, 0)

    return reply.send({
      cfops: [...porCfop.values()].sort((a, b) =>
        a.direcao === b.direcao ? b.total - a.total : a.direcao === 'saida' ? -1 : 1),
      totais,
      resumo: {
        produtosDivergentes: divergencias.length,
        monofasicoNaoDeclarado: somaTipos(['monofasico_tributado', 'monofasico_sem_cst']),
        stNaoDeclarada: somaTipos(['st_nao_declarada']),
        declaradoSemBase: somaTipos(['cst_monofasico_sem_base', 'cst_st_sem_base']),
      },
      divergencias: divergencias.slice(0, 200),
      divergenciasTotal: divergencias.length,
    })
  })

  // GET /api/tax/reforma/pendentes — notas de 2026+ cujo XML ainda não traz os grupos IBS/CBS.
  // Emitente do Simples Nacional/MEI (CRT 1, 2 ou 4) está dispensado do destaque em 2026
  // (LC 214/2025, art. 348, III, "c"); essas notas contam como dispensadas, não pendentes.
  app.get('/reforma/pendentes', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { companyId, competencia } = req.query as { companyId?: string; competencia?: string }

    const filters: Prisma.Sql[] = [
      Prisma.sql`n.status NOT IN ('CANCELADA', 'DENEGADA', 'INUTILIZADA')`,
      Prisma.sql`n.competencia >= '2026-01'`,
    ]
    if (companyId) filters.push(Prisma.sql`n."companyId" = ${companyId}`)
    if (competencia) filters.push(Prisma.sql`n.competencia = ${competencia}`)
    const whereClause = Prisma.join(filters, ' AND ')

    const notas = await prisma.$queryRaw<Array<{
      id: string; mod: number; nNF: string; serie: string; dhEmi: Date; emitNome: string
      vNF: number; propria: boolean; adequada: boolean; competencia: string; crt: string | null
    }>>`
      SELECT
        n.id, n.mod, n."nNF", n.serie, n."dhEmi", n."emitNome", n.competencia,
        n."vNF"::float AS "vNF",
        substring(n."xmlRaw" from '<CRT>([0-9])</CRT>') AS crt,
        (regexp_replace(n."emitCnpj", '[^0-9]', '', 'g') = regexp_replace(c.cnpj, '[^0-9]', '', 'g')) AS propria,
        (n."xmlRaw" ~ '<IBSCBS[[:space:]>]'
          AND n."xmlRaw" LIKE '%<IBSCBSTot%'
          AND n."xmlRaw" LIKE '%<cClassTrib>%') AS adequada
      FROM nfes n
      JOIN companies c ON c.id = n."companyId"
      WHERE ${whereClause}
      ORDER BY n."dhEmi" DESC
    `

    const dispensada = (n: (typeof notas)[number]) =>
      !n.adequada && n.competencia < '2027-01' && ['1', '2', '4'].includes(n.crt ?? '')

    const grupo = () => ({ total: 0, adequadas: 0, pendentes: 0, dispensadas: 0, valorPendente: 0 })
    const resumo = { geral: grupo(), proprias: grupo(), terceiros: grupo(), nfe: grupo(), nfce: grupo() }
    for (const n of notas) {
      const alvos = [resumo.geral, n.propria ? resumo.proprias : resumo.terceiros]
      if (n.mod === 55) alvos.push(resumo.nfe)
      if (n.mod === 65) alvos.push(resumo.nfce)
      for (const g of alvos) {
        g.total++
        if (n.adequada) g.adequadas++
        else if (dispensada(n)) g.dispensadas++
        else { g.pendentes++; g.valorPendente += n.vNF }
      }
    }

    return reply.send({
      resumo,
      pendentes: notas.filter(n => !n.adequada && !dispensada(n)).slice(0, 50)
        .map(({ adequada: _adequada, competencia: _competencia, crt: _crt, ...n }) => n),
    })
  })

  // GET /api/tax/reforma — dados da reforma tributária
  app.get('/reforma', { preHandler: [app.authenticate] }, async (_req, reply) => {
    const { REFORMA_TRIBUTARIA } = await import('../services/tax/taxData.js')
    return reply.send(REFORMA_TRIBUTARIA)
  })
}
