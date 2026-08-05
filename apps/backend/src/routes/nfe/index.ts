import type { FastifyPluginAsync } from 'fastify'
import prisma from '../../lib/prisma.js'
import { analisarFiscalNfe } from '../../services/tax/nfeFiscalAnalysis.js'

const nfeRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /nfe - list with filters
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as {
      companyId?: string
      competencia?: string
      status?: string
      mod?: string
      tpNF?: string
      search?: string
      page?: string
      limit?: string
    }

    const page = parseInt(query.page || '1', 10)
    const limit = Math.min(parseInt(query.limit || '50', 10), 500)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (query.companyId) where.companyId = query.companyId
    if (query.competencia) where.competencia = query.competencia
    if (query.status) where.status = query.status
    if (query.mod) where.mod = parseInt(query.mod, 10)
    if (query.tpNF !== undefined) where.tpNF = parseInt(query.tpNF, 10)

    if (query.search) {
      const search = query.search
      where.OR = [
        { nNF: { contains: search } },
        { chNFe: { contains: search } },
        { emitNome: { contains: search, mode: 'insensitive' } },
        { destNome: { contains: search, mode: 'insensitive' } },
        { natOp: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [nfes, total] = await Promise.all([
      prisma.nfe.findMany({
        where,
        orderBy: { dhEmi: 'desc' },
        skip,
        take: limit,
        include: {
          company: { select: { id: true, name: true, cnpj: true } },
          _count: { select: { items: true, events: true } },
        },
      }),
      prisma.nfe.count({ where }),
    ])

    return reply.send({
      nfes,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    })
  })

  // GET /nfe/:id - detail with items and events
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const nfe = await prisma.nfe.findUnique({
      where: { id },
      include: {
        company: true,
        items: { orderBy: { nItem: 'asc' } },
        events: { orderBy: { nSeqEvento: 'asc' } },
        importLog: {
          select: { id: true, filename: true, createdAt: true, status: true },
        },
      },
    })

    if (!nfe) {
      return reply.status(404).send({ error: 'NF-e not found' })
    }

    return reply.send({ nfe })
  })

  // GET /nfe/:id/fiscal-analysis - CFOP detalhado, campos fiscais e leitura da Reforma Tributária
  fastify.get('/:id/fiscal-analysis', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const nfe = await prisma.nfe.findUnique({
      where: { id },
      include: {
        company: { select: { regime: true } },
        items: { orderBy: { nItem: 'asc' } },
      },
    })

    if (!nfe) {
      return reply.status(404).send({ error: 'NF-e not found' })
    }

    const analysis = analisarFiscalNfe(nfe)
    return reply.send(analysis)
  })

  // POST /nfe/backfill-protocol-status - correção única: alguns XMLs
  // importados (achado real: nota 21274, E.GREGORIO LIMA-AUTO-PECAS,
  // jul/2026) são o <NFe> assinado pelo emitente SEM o <protNFe> da SEFAZ —
  // o parser antigo tratava a ausência de cStat como AUTORIZADA por padrão.
  // Reescaneia as notas hoje marcadas AUTORIZADA e corrige para
  // SEM_PROTOCOLO as que não têm <protNFe>/<nfeProc> no xmlRaw. Idempotente
  // — pode rodar de novo sem efeito colateral.
  fastify.post('/backfill-protocol-status', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    const BATCH_SIZE = 500
    let cursor: string | undefined
    let scanned = 0
    let corrected = 0
    const exemplos: { id: string; nNF: string; serie: string; emitNome: string }[] = []

    for (;;) {
      const batch = await prisma.nfe.findMany({
        where: { status: 'AUTORIZADA' },
        select: { id: true, xmlRaw: true, nNF: true, serie: true, emitNome: true, companyId: true },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
      })
      if (batch.length === 0) break

      for (const nfe of batch) {
        scanned++
        const temProtocolo = nfe.xmlRaw.includes('<protNFe') || nfe.xmlRaw.includes('<nfeProc')
        if (!temProtocolo) {
          await prisma.nfe.update({ where: { id: nfe.id }, data: { status: 'SEM_PROTOCOLO' } })
          corrected++
          if (exemplos.length < 30) {
            exemplos.push({ id: nfe.id, nNF: nfe.nNF, serie: nfe.serie, emitNome: nfe.emitNome })
          }
        }
      }

      cursor = batch[batch.length - 1].id
      if (batch.length < BATCH_SIZE) break
    }

    return reply.send({ scanned, corrected, exemplos })
  })

  // DELETE /nfe/:id
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const nfe = await prisma.nfe.findUnique({ where: { id } })
    if (!nfe) {
      return reply.status(404).send({ error: 'NF-e not found' })
    }

    await prisma.nfe.delete({ where: { id } })

    return reply.send({ success: true })
  })

  // GET /nfe/:id/xml - return raw XML
  fastify.get('/:id/xml', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const nfe = await prisma.nfe.findUnique({
      where: { id },
      select: { xmlRaw: true, chNFe: true, nNF: true },
    })

    if (!nfe) {
      return reply.status(404).send({ error: 'NF-e not found' })
    }

    reply.header('Content-Type', 'application/xml')
    reply.header(
      'Content-Disposition',
      `attachment; filename="${nfe.chNFe || nfe.nNF}-nfe.xml"`
    )
    return reply.send(nfe.xmlRaw)
  })
}

export default nfeRoutes
