import type { FastifyPluginAsync } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import prisma from '../lib/prisma.js'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const body = loginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Invalid input', details: body.error.flatten() })
    }

    const { email, password } = body.data
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })

    if (!user || !user.active) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const accessToken = fastify.jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      { expiresIn: '15m' }
    )

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'refresh'
    const refreshToken = fastify.jwt.sign(
      { id: user.id, type: 'refresh' },
      { expiresIn: '7d', key: refreshSecret } as Parameters<typeof fastify.jwt.sign>[1]
    )

    reply.setCookie?.('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/api/auth',
    })

    return reply.send({
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  })

  // POST /auth/refresh
  fastify.post('/refresh', async (request, reply) => {
    const body = request.body as { refreshToken?: string }
    const token = body?.refreshToken || (request.cookies as Record<string, string>)?.refreshToken

    if (!token) {
      return reply.status(401).send({ error: 'No refresh token' })
    }

    try {
      const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'refresh'
      const decoded = fastify.jwt.verify<{ id: string; type: string }>(token, {
        key: refreshSecret,
      } as Parameters<typeof fastify.jwt.verify>[1])

      if (decoded.type !== 'refresh') {
        return reply.status(401).send({ error: 'Invalid token type' })
      }

      const user = await prisma.user.findUnique({ where: { id: decoded.id } })
      if (!user || !user.active) {
        return reply.status(401).send({ error: 'User not found or inactive' })
      }

      const accessToken = fastify.jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        { expiresIn: '15m' }
      )

      return reply.send({ accessToken })
    } catch {
      return reply.status(401).send({ error: 'Invalid or expired refresh token' })
    }
  })

  // POST /auth/logout
  fastify.post('/logout', async (request, reply) => {
    reply.clearCookie?.('refreshToken', { path: '/api/auth' })
    return reply.send({ success: true })
  })

  // GET /auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    })

    if (!user) {
      return reply.status(404).send({ error: 'User not found' })
    }

    return reply.send({ user })
  })
}

export default authRoutes
