import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma.js'

const companySchema = z.object({
  cnpj: z.string().min(14).max(14),
  name: z.string().min(1),
  fantasia: z.string().optional(),
  regime: z.enum(['SIMPLES', 'LUCRO_PRESUMIDO', 'LUCRO_REAL']).optional(),
})

const companiesRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /companies
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { search?: string; active?: string }
    const where: Record<string, unknown> = {}

    if (query.active !== undefined) {
      where.active = query.active === 'true'
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { cnpj: { contains: query.search } },
        { fantasia: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const companies = await prisma.company.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { nfes: true } },
      },
    })

    return reply.send({ companies })
  })

  // POST /companies
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = companySchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const cnpjClean = body.data.cnpj.replace(/\D/g, '')

    const existing = await prisma.company.findUnique({ where: { cnpj: cnpjClean } })
    if (existing) {
      return reply.status(409).send({ error: 'CNPJ already registered' })
    }

    const company = await prisma.company.create({
      data: {
        cnpj: cnpjClean,
        name: body.data.name,
        fantasia: body.data.fantasia,
        regime: body.data.regime,
      },
    })

    return reply.status(201).send({ company })
  })

  // GET /companies/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: { select: { nfes: true, importLogs: true } },
      },
    })

    if (!company) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    return reply.send({ company })
  })

  // PUT /companies/:id
  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = companySchema.partial().safeParse(request.body)

    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const company = await prisma.company.findUnique({ where: { id } })
    if (!company) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    const updated = await prisma.company.update({
      where: { id },
      data: {
        ...(body.data.name && { name: body.data.name }),
        ...(body.data.fantasia !== undefined && { fantasia: body.data.fantasia }),
        ...(body.data.regime !== undefined && { regime: body.data.regime }),
      },
    })

    return reply.send({ company: updated })
  })

  // DELETE /companies/:id — exclusão definitiva (o botão antes só desativava,
  // por isso empresas "excluídas" continuavam aparecendo como inativas). NF-e
  // (e itens/eventos, que já cascade a partir dela), DfeSyncLog e Alert não
  // têm onDelete: Cascade a partir de Company — apagados explicitamente aqui,
  // numa transação, antes de apagar a empresa. ImportLog.companyId é opcional
  // e vira null em vez de apagado, pra manter o histórico de importações.
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const company = await prisma.company.findUnique({ where: { id } })
    if (!company) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    const deletedNfes = await prisma.$transaction(async (tx) => {
      await tx.dfeSyncLog.deleteMany({ where: { companyId: id } })
      await tx.alert.deleteMany({ where: { companyId: id } })
      await tx.importLog.updateMany({ where: { companyId: id }, data: { companyId: null } })
      const { count } = await tx.nfe.deleteMany({ where: { companyId: id } })
      await tx.company.delete({ where: { id } })
      return count
    })

    return reply.send({ success: true, deletedNfes })
  })

  // GET /companies/:id/stats
  fastify.get('/:id/stats', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const query = request.query as { competencia?: string }

    const company = await prisma.company.findUnique({ where: { id } })
    if (!company) {
      return reply.status(404).send({ error: 'Company not found' })
    }

    const where: Record<string, unknown> = { companyId: id }
    if (query.competencia) where.competencia = query.competencia

    const [totalNfes, totals] = await Promise.all([
      prisma.nfe.count({ where }),
      prisma.nfe.aggregate({
        where,
        _sum: { vNF: true, vICMS: true, vPIS: true, vCOFINS: true },
      }),
    ])

    const lastImport = await prisma.importLog.findFirst({
      where: { companyId: id },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, status: true, success: true },
    })

    return reply.send({
      totalNfes,
      vNF: totals._sum.vNF || 0,
      vICMS: totals._sum.vICMS || 0,
      vPIS: totals._sum.vPIS || 0,
      vCOFINS: totals._sum.vCOFINS || 0,
      lastImport,
    })
  })
}

export default companiesRoutes
