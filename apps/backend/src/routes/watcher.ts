import type { FastifyPluginAsync } from 'fastify'
import { startWatcher, stopWatcher, getStatus, loadConfig } from '../services/watcher/folderWatcher.js'

const watcherRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /watcher/status
  fastify.get('/status', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    return reply.send(getStatus())
  })

  // POST /watcher/start
  fastify.post('/start', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as { folderPath?: string; companyId?: string }
    const folderPath = body?.folderPath || loadConfig().folderPath

    if (!folderPath) {
      return reply.status(400).send({ error: 'folderPath is required' })
    }

    try {
      await startWatcher(folderPath, body?.companyId || 'auto')
      return reply.send({ ok: true, message: `Watching: ${folderPath}` })
    } catch (err) {
      return reply.status(500).send({ error: (err as Error).message })
    }
  })

  // POST /watcher/stop
  fastify.post('/stop', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    await stopWatcher()
    return reply.send({ ok: true, message: 'Watcher stopped' })
  })

  // POST /watcher/config  (just saves config without starting)
  fastify.post('/config', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = request.body as { folderPath?: string; companyId?: string }
    const config = loadConfig()
    if (body?.folderPath !== undefined) config.folderPath = body.folderPath
    if (body?.companyId !== undefined) config.companyId = body.companyId

    const { saveConfig } = await import('../services/watcher/folderWatcher.js')
    saveConfig(config)

    return reply.send({ ok: true, config })
  })
}

export default watcherRoutes
