import type { FastifyPluginAsync } from 'fastify'
import prisma from '../lib/prisma.js'

const productsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /products
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as {
      companyId?: string
      competencia?: string
      search?: string
      ncm?: string
      cfop?: string
      page?: string
      limit?: string
      sortBy?: string
      sortDir?: string
    }

    const page = parseInt(query.page || '1', 10)
    const limit = Math.min(parseInt(query.limit || '50', 10), 500)
    const skip = (page - 1) * limit

    const whereNfe: Record<string, unknown> = {}
    if (query.companyId) whereNfe.companyId = query.companyId
    if (query.competencia) whereNfe.competencia = query.competencia

    const whereItem: Record<string, unknown> = { nfe: whereNfe }
    if (query.ncm) whereItem.ncm = query.ncm
    if (query.cfop) whereItem.cfop = query.cfop
    if (query.search) {
      whereItem.OR = [
        { xProd: { contains: query.search, mode: 'insensitive' } },
        { ncm: { contains: query.search } },
      ]
    }

    const sortBy = (query.sortBy || 'vProd') as string
    const sortDir = (query.sortDir || 'desc') as 'asc' | 'desc'
    const validSorts = ['vProd', 'qCom', 'vICMS', 'vPIS', 'vCOFINS']
    const orderBy = validSorts.includes(sortBy)
      ? { _sum: { [sortBy]: sortDir } }
      : { _sum: { vProd: sortDir } }

    const [products, totalGroups] = await Promise.all([
      prisma.nfeItem.groupBy({
        by: ['xProd', 'ncm', 'cfop'],
        where: whereItem,
        _sum: {
          qCom: true,
          vProd: true,
          vICMS: true,
          vST: true,
          vPIS: true,
          vCOFINS: true,
          vIPI: true,
        },
        _count: true,
        orderBy,
        skip,
        take: limit,
      }),
      prisma.nfeItem.groupBy({
        by: ['xProd', 'ncm', 'cfop'],
        where: whereItem,
        _count: true,
      }),
    ])

    // Calculate total vProd for percentage
    const totalAgg = await prisma.nfeItem.aggregate({
      where: whereItem,
      _sum: { vProd: true },
    })
    const totalVProd = Number(totalAgg._sum.vProd || 0)

    return reply.send({
      products: products.map((p) => ({
        xProd: p.xProd,
        ncm: p.ncm,
        cfop: p.cfop,
        qCom: Number(p._sum.qCom || 0),
        vProd: Number(p._sum.vProd || 0),
        vICMS: Number(p._sum.vICMS || 0),
        vST: Number(p._sum.vST || 0),
        vPIS: Number(p._sum.vPIS || 0),
        vCOFINS: Number(p._sum.vCOFINS || 0),
        vIPI: Number(p._sum.vIPI || 0),
        count: p._count,
        pctFaturamento:
          totalVProd > 0 ? (Number(p._sum.vProd || 0) / totalVProd) * 100 : 0,
      })),
      total: totalGroups.length,
      page,
      limit,
      totalPages: Math.ceil(totalGroups.length / limit),
    })
  })

  // GET /products/ncm-summary
  fastify.get('/ncm-summary', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { companyId?: string; competencia?: string }

    const whereNfe: Record<string, unknown> = {}
    if (query.companyId) whereNfe.companyId = query.companyId
    if (query.competencia) whereNfe.competencia = query.competencia

    const ncmData = await prisma.nfeItem.groupBy({
      by: ['ncm'],
      where: { nfe: whereNfe, ncm: { not: null } },
      _sum: { vProd: true, vICMS: true, qCom: true },
      _count: true,
      orderBy: { _sum: { vProd: 'desc' } },
      take: 20,
    })

    return reply.send({
      data: ncmData.map((n) => ({
        ncm: n.ncm,
        vProd: Number(n._sum.vProd || 0),
        vICMS: Number(n._sum.vICMS || 0),
        qCom: Number(n._sum.qCom || 0),
        count: n._count,
      })),
    })
  })
}

export default productsRoutes
