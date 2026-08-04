import Fastify from 'fastify'
import fastifyMultipart from '@fastify/multipart'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import bcrypt from 'bcryptjs'
import authPlugin from './plugins/auth.js'
import corsPlugin from './plugins/cors.js'
import prisma from './lib/prisma.js'
import authRoutes from './routes/auth.js'
import companiesRoutes from './routes/companies.js'
import dfeRoutes from './routes/dfe.js'
import nfeRoutes from './routes/nfe/index.js'
import importRoutes from './routes/nfe/import.js'
import segregacaoRoutes from './routes/nfe/segregacao.js'
import dashboardRoutes from './routes/dashboard.js'
import productsRoutes from './routes/products.js'
import reportsRoutes from './routes/reports.js'
import alertsRoutes from './routes/alerts.js'
import usersRoutes from './routes/users.js'
import watcherRoutes from './routes/watcher.js'
import driveWatcherRoutes from './routes/driveWatcher.js'
import emailRoutes from './routes/email.js'
import taxRoutes from './routes/tax.js'
import { initWatcher } from './services/watcher/folderWatcher.js'
import { initDriveWatcher } from './services/drive/driveWatcher.js'
import { initDfeSync } from './services/dfe/syncScheduler.js'

const PORT = parseInt(process.env.PORT || '3001', 10)
const HOST = process.env.HOST || '0.0.0.0'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// Build do frontend (Vite) — só existe em produção, gerado por `npm run build`
// no monorepo. Em dev, o próprio Vite serve o frontend (com proxy de /api).
const FRONTEND_DIST = path.resolve(__dirname, '../../frontend/dist')

async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
  })

  // Register plugins
  await fastify.register(corsPlugin)
  await fastify.register(fastifyCookie, { secret: process.env.JWT_SECRET })
  await fastify.register(authPlugin)
  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB max per file
      files: 1000, // max 1000 files per request
    },
  })

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  // Register all routes under /api prefix
  await fastify.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' })
      await api.register(companiesRoutes, { prefix: '/companies' })
      await api.register(dfeRoutes)
      await api.register(nfeRoutes, { prefix: '/nfe' })
      await api.register(importRoutes, { prefix: '/nfe/import' })
      await api.register(segregacaoRoutes, { prefix: '/nfe/segregacao' })
      await api.register(dashboardRoutes, { prefix: '/dashboard' })
      await api.register(productsRoutes, { prefix: '/products' })
      await api.register(reportsRoutes, { prefix: '/reports' })
      await api.register(alertsRoutes, { prefix: '/alerts' })
      await api.register(usersRoutes, { prefix: '/users' })
      await api.register(watcherRoutes, { prefix: '/watcher' })
      await api.register(driveWatcherRoutes, { prefix: '/drive-watcher' })
      await api.register(emailRoutes, { prefix: '/email' })
      await api.register(taxRoutes, { prefix: '/tax' })
    },
    { prefix: '/api' }
  )

  // Serve o build do frontend a partir do próprio backend, para não depender
  // de dois serviços/origens separados em produção (o frontend chama a API
  // via caminho relativo /api, então precisam estar no mesmo domínio).
  if (existsSync(FRONTEND_DIST)) {
    await fastify.register(fastifyStatic, { root: FRONTEND_DIST })

    fastify.setNotFoundHandler((request, reply) => {
      if (request.raw.url?.startsWith('/api')) {
        return reply.status(404).send({ error: 'Not found' })
      }
      // SPA: qualquer rota não-API cai no index.html (roteamento no client)
      return reply.sendFile('index.html')
    })
  }

  // Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error)

    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: error.message,
        details: error.validation,
      })
    }

    const statusCode = error.statusCode || 500
    return reply.status(statusCode).send({
      error: statusCode >= 500 ? 'Internal Server Error' : error.message,
      message: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    })
  })

  return fastify
}

async function start() {
  const app = await buildApp()

  try {
    // Test database connection
    await prisma.$connect()
    app.log.info('Database connected')

    // Auto-start folder watcher if previously configured
    await initWatcher()

    // Auto-start Google Drive watcher if previously configured
    await initDriveWatcher()

    // Restore automatic DFe distribution sync schedules, if any are configured
    initDfeSync()

    // Create default admin user if not exists
    const adminExists = await prisma.user.findUnique({
      where: { email: 'admin@fiscal.com' },
    })

    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('Admin@123', 10)
      await prisma.user.create({
        data: {
          name: 'Administrador',
          email: 'admin@fiscal.com',
          password: hashedPassword,
          role: 'ADMIN',
        },
      })
      app.log.info('Default admin user created: admin@fiscal.com / Admin@123')
    }

    await app.listen({ port: PORT, host: HOST })
    app.log.info(`Server running at http://localhost:${PORT}`)
  } catch (err) {
    app.log.error(err)
    await prisma.$disconnect()
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...')
  await prisma.$disconnect()
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...')
  await prisma.$disconnect()
  process.exit(0)
})

start()
