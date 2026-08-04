import { FastifyInstance } from 'fastify'
import prisma from '../lib/prisma.js'
import { testSmtpConnection, sendFechamentoEmail } from '../services/emailService.js'

export default async function emailRoutes(app: FastifyInstance) {

  // ─── Configurações SMTP ──────────────────────────────────────────────────

  // GET /api/email/settings
  app.get('/settings', { preHandler: [app.authenticate] }, async (_req, reply) => {
    const cfg = await prisma.emailSettings.findFirst()
    if (!cfg) return reply.send(null)
    // Mascarar a senha na resposta
    return reply.send({ ...cfg, password: cfg.password ? '••••••••' : '' })
  })

  // PUT /api/email/settings
  app.put('/settings', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = req.body as {
      host: string; port: number; secure: boolean;
      user: string; password?: string;
      fromName: string; fromEmail: string
    }

    const existing = await prisma.emailSettings.findFirst()

    // Manter a senha antiga se não foi informada
    let password = body.password || ''
    if (existing && (!body.password || body.password === '••••••••')) {
      password = existing.password
    }

    const data = {
      host: body.host,
      port: Number(body.port),
      secure: Boolean(body.secure),
      user: body.user,
      password,
      fromName: body.fromName,
      fromEmail: body.fromEmail,
    }

    const cfg = existing
      ? await prisma.emailSettings.update({ where: { id: existing.id }, data })
      : await prisma.emailSettings.create({ data })

    return reply.send({ ...cfg, password: '••••••••' })
  })

  // POST /api/email/test — testa conexão SMTP
  app.post('/test', { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = req.body as {
      host: string; port: number; secure: boolean; user: string; password?: string
    }

    // Se a senha é o placeholder, pegar do banco
    let password = body.password || ''
    if (!password || password === '••••••••') {
      const existing = await prisma.emailSettings.findFirst()
      password = existing?.password || ''
    }

    const result = await testSmtpConnection({ ...body, password })
    return reply.send(result)
  })

  // ─── Contatos/destinatários por empresa ─────────────────────────────────

  // GET /api/email/companies/:companyId/contacts
  app.get('/companies/:companyId/contacts', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { companyId } = req.params as { companyId: string }
    const contacts = await prisma.companyEmail.findMany({
      where: { companyId },
      orderBy: { createdAt: 'asc' },
    })
    return reply.send(contacts)
  })

  // POST /api/email/companies/:companyId/contacts
  app.post('/companies/:companyId/contacts', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { companyId } = req.params as { companyId: string }
    const { email, name } = req.body as { email: string; name?: string }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.status(400).send({ error: 'E-mail inválido' })
    }

    try {
      const contact = await prisma.companyEmail.create({
        data: { companyId, email: email.toLowerCase().trim(), name: name?.trim() || null },
      })
      return reply.status(201).send(contact)
    } catch {
      return reply.status(409).send({ error: 'Este e-mail já está cadastrado para esta empresa' })
    }
  })

  // DELETE /api/email/companies/:companyId/contacts/:id
  app.delete('/companies/:companyId/contacts/:id', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { id } = req.params as { companyId: string; id: string }
    await prisma.companyEmail.delete({ where: { id } })
    return reply.send({ ok: true })
  })

  // ─── Enviar e-mail ───────────────────────────────────────────────────────

  // POST /api/email/send
  app.post('/send', { preHandler: [app.authenticate] }, async (req, reply) => {
    const { companyId, competencia, recipients, extraMessage } = req.body as {
      companyId: string
      competencia: string
      recipients: string[]
      extraMessage?: string
    }

    if (!companyId || !competencia) {
      return reply.status(400).send({ error: 'Empresa e competência são obrigatórios' })
    }

    try {
      const result = await sendFechamentoEmail({ companyId, competencia, recipients, extraMessage })
      return reply.send({ ok: true, ...result })
    } catch (err: unknown) {
      const e = err as Error
      return reply.status(500).send({ error: e.message || 'Erro ao enviar e-mail' })
    }
  })
}
