import type { FastifyPluginAsync } from 'fastify'
import prisma from '../lib/prisma.js'

const alertsRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /alerts
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as {
      companyId?: string
      read?: string
      type?: string
      severity?: string
      page?: string
      limit?: string
    }

    const page = parseInt(query.page || '1', 10)
    const limit = parseInt(query.limit || '50', 10)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (query.companyId) where.companyId = query.companyId
    if (query.read !== undefined) where.read = query.read === 'true'
    if (query.type) where.type = query.type
    if (query.severity) where.severity = query.severity

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.alert.count({ where }),
    ])

    const unreadCount = await prisma.alert.count({
      where: { ...where, read: false },
    })

    return reply.send({ alerts, total, unreadCount, page, limit })
  })

  // GET /alerts/count (unread count for badge)
  fastify.get('/count', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { companyId?: string }

    const where: Record<string, unknown> = { read: false }
    if (query.companyId) where.companyId = query.companyId

    const count = await prisma.alert.count({ where })
    return reply.send({ count })
  })

  // PUT /alerts/:id/read
  fastify.put('/:id/read', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    const alert = await prisma.alert.findUnique({ where: { id } })
    if (!alert) {
      return reply.status(404).send({ error: 'Alert not found' })
    }

    await prisma.alert.update({ where: { id }, data: { read: true } })

    return reply.send({ success: true })
  })

  // PUT /alerts/read-all
  fastify.put('/read-all', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as { companyId?: string }

    const where: Record<string, unknown> = { read: false }
    if (body?.companyId) where.companyId = body.companyId

    const result = await prisma.alert.updateMany({
      where,
      data: { read: true },
    })

    return reply.send({ updated: result.count })
  })

  // DELETE /alerts/:id
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }

    await prisma.alert.delete({ where: { id } }).catch(() => null)

    return reply.send({ success: true })
  })
}

export default alertsRoutes
