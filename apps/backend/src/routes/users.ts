import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '../lib/prisma.js'

const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'MANAGER', 'OPERATOR']).default('OPERATOR'),
})

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'OPERATOR']).optional(),
  active: z.boolean().optional(),
})

function isAdmin(request: { user: { role: string } }): boolean {
  return request.user.role === 'ADMIN'
}

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /users (admin only)
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isAdmin(request)) {
      return reply.status(403).send({ error: 'Admin access required' })
    }

    const query = request.query as { search?: string; active?: string }
    const where: Record<string, unknown> = {}

    if (query.active !== undefined) {
      where.active = query.active === 'true'
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const users = await prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
      orderBy: { name: 'asc' },
    })

    return reply.send({ users })
  })

  // POST /users
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isAdmin(request)) {
      return reply.status(403).send({ error: 'Admin access required' })
    }

    const body = createUserSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const existing = await prisma.user.findUnique({
      where: { email: body.data.email.toLowerCase() },
    })
    if (existing) {
      return reply.status(409).send({ error: 'Email already in use' })
    }

    const hashedPassword = await bcrypt.hash(body.data.password, 10)

    const user = await prisma.user.create({
      data: {
        name: body.data.name,
        email: body.data.email.toLowerCase(),
        password: hashedPassword,
        role: body.data.role,
      },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    })

    return reply.status(201).send({ user })
  })

  // PUT /users/:id
  fastify.put('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const requestingUser = request.user

    // Users can update their own profile, admins can update anyone
    if (requestingUser.id !== id && !isAdmin(request)) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const body = updateUserSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    // Non-admins cannot change role or active status
    if (!isAdmin(request)) {
      delete (body.data as Record<string, unknown>).role
      delete (body.data as Record<string, unknown>).active
    }

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) {
      return reply.status(404).send({ error: 'User not found' })
    }

    const updateData: Record<string, unknown> = {}
    if (body.data.name) updateData.name = body.data.name
    if (body.data.email) updateData.email = body.data.email.toLowerCase()
    if (body.data.password) updateData.password = await bcrypt.hash(body.data.password, 10)
    if (body.data.role !== undefined) updateData.role = body.data.role
    if (body.data.active !== undefined) updateData.active = body.data.active

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    })

    return reply.send({ user })
  })

  // DELETE /users/:id (soft deactivate)
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isAdmin(request)) {
      return reply.status(403).send({ error: 'Admin access required' })
    }

    const { id } = request.params as { id: string }

    // Cannot deactivate yourself
    if (request.user.id === id) {
      return reply.status(400).send({ error: 'Cannot deactivate your own account' })
    }

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    await prisma.user.update({ where: { id }, data: { active: false } })

    return reply.send({ success: true })
  })
}

export default usersRoutes
