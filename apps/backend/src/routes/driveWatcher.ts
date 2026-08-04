import type { FastifyPluginAsync } from 'fastify'
import { startWatcher, stopWatcher, getStatus, loadConfig, saveConfig, pollOnce } from '../services/drive/driveWatcher.js'

const driveWatcherRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /drive-watcher/status
  fastify.get('/status', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    return reply.send(getStatus())
  })

  // POST /drive-watcher/start
  fastify.post('/start', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as { rootFolderId?: string; companyId?: string; intervalMinutes?: number }
    const rootFolderId = body?.rootFolderId || loadConfig().rootFolderId || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID

    if (!rootFolderId) {
      return reply.status(400).send({ error: 'rootFolderId is required' })
    }
    if (!process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON && !process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_PATH) {
      return reply.status(400).send({
        error:
          'GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON ou GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_PATH não configurado no .env — veja o README para os passos de configuração da conta de serviço.',
      })
    }

    try {
      await startWatcher(rootFolderId, body?.companyId || 'auto', body?.intervalMinutes)
      return reply.send({ ok: true, message: `Monitorando pasta do Drive: ${rootFolderId}` })
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  // POST /drive-watcher/stop
  fastify.post('/stop', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    await stopWatcher()
    return reply.send({ ok: true, message: 'Monitoramento do Drive parado' })
  })

  // POST /drive-watcher/sync-now — força um ciclo imediato sem esperar o intervalo
  fastify.post('/sync-now', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    pollOnce().catch((err) => fastify.log.error(err, 'drive-watcher manual sync failed'))
    return reply.send({ ok: true, message: 'Sincronização iniciada' })
  })

  // POST /drive-watcher/config (só salva config sem iniciar)
  fastify.post('/config', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as { rootFolderId?: string; companyId?: string; intervalMinutes?: number }
    const config = loadConfig()
    if (body?.rootFolderId !== undefined) config.rootFolderId = body.rootFolderId
    if (body?.companyId !== undefined) config.companyId = body.companyId
    if (body?.intervalMinutes !== undefined) config.intervalMinutes = body.intervalMinutes
    saveConfig(config)
    return reply.send({ ok: true, config })
  })
}

export default driveWatcherRoutes
