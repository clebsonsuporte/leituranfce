import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; email: string; role: string } | { id: string; type: 'refresh' }
    user: { id: string; email: string; role: string }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    optionalAuthenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const jwtSecret = process.env.JWT_SECRET
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required')
  }

  await fastify.register(fastifyJwt, {
    secret: jwtSecret,
    sign: {
      expiresIn: '15m',
    },
  })

  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' })
      }
    }
  )

  fastify.decorate(
    'optionalAuthenticate',
    async function (request: FastifyRequest, _reply: FastifyReply) {
      try {
        await request.jwtVerify()
      } catch {
        // Optional - do nothing if no token
      }
    }
  )
}

export default fp(authPlugin, { name: 'auth' })
