import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import prisma from '../lib/prisma.js'
import {
  CertificateError,
  encryptCertificate,
  readCertificateInfo,
} from '../services/dfe/certificateService.js'
import { DistributionSyncError, runDistributionSync } from '../services/dfe/distributionService.js'
import {
  getCompanySyncConfig,
  setCompanySyncConfig,
  DEFAULT_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
} from '../services/dfe/syncScheduler.js'

const CERT_EXTENSIONS = ['.pfx', '.p12']
/** Pernambuco (26) — sensible default for this dashboard's audience; admins can override per company. */
const DEFAULT_CUF_AUTOR = 26

const syncConfigSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.number().int().min(MIN_INTERVAL_MINUTES).optional(),
})

function isAdmin(request: { user: { role: string } }): boolean {
  return request.user.role === 'ADMIN'
}

function certificateToMetadata(cert: {
  cnpj: string
  cUFAutor: number
  validFrom: Date
  validUntil: Date
  active: boolean
  lastNsu: string
  lastSyncAt: Date | null
  updatedAt: Date
}) {
  return {
    cnpj: cert.cnpj,
    cUFAutor: cert.cUFAutor,
    validFrom: cert.validFrom,
    validUntil: cert.validUntil,
    expired: cert.validUntil.getTime() < Date.now(),
    active: cert.active,
    lastNsu: cert.lastNsu,
    lastSyncAt: cert.lastSyncAt,
    updatedAt: cert.updatedAt,
  }
}

const dfeRoutes: FastifyPluginAsync = async (fastify) => {
  // ─── Certificado digital (sub-recurso de Company) ──────────────────────────

  // POST /companies/:id/certificate — upload/replace do .pfx (multipart: file + password [+ cUFAutor])
  fastify.post('/companies/:id/certificate', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isAdmin(request)) {
      return reply.status(403).send({ error: 'Acesso restrito a administradores' })
    }

    const { id: companyId } = request.params as { id: string }
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) {
      return reply.status(404).send({ error: 'Empresa não encontrada' })
    }

    let fileBuffer: Buffer | undefined
    let filename = ''
    let password = ''
    let cUFAutor = DEFAULT_CUF_AUTOR

    for await (const part of request.parts()) {
      if (part.type === 'field' && part.fieldname === 'password') {
        password = String(part.value)
        continue
      }
      if (part.type === 'field' && part.fieldname === 'cUFAutor') {
        const parsed = parseInt(String(part.value), 10)
        if (!Number.isNaN(parsed)) cUFAutor = parsed
        continue
      }
      if (part.type !== 'file') continue

      const chunks: Buffer[] = []
      for await (const chunk of part.file) chunks.push(chunk)
      fileBuffer = Buffer.concat(chunks)
      filename = part.filename || 'certificado.pfx'
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return reply.status(400).send({ error: 'Envie o arquivo do certificado (.pfx ou .p12)' })
    }
    if (!CERT_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext))) {
      return reply.status(400).send({ error: 'Formato inválido. Envie um arquivo .pfx ou .p12' })
    }
    if (!password) {
      return reply.status(400).send({ error: 'Informe a senha do certificado' })
    }

    let info
    try {
      info = readCertificateInfo(fileBuffer, password)
    } catch (err) {
      if (err instanceof CertificateError) {
        return reply.status(400).send({ error: err.message })
      }
      throw err
    }

    if (info.cnpj !== company.cnpj) {
      return reply.status(400).send({
        error: `O CNPJ do certificado (${info.cnpj}) não corresponde ao CNPJ da empresa (${company.cnpj}).`,
      })
    }
    if (info.validUntil.getTime() < Date.now()) {
      return reply.status(400).send({ error: `Este certificado está expirado desde ${info.validUntil.toLocaleDateString('pt-BR')}.` })
    }

    const encrypted = encryptCertificate(fileBuffer, password)

    const certificate = await prisma.companyCertificate.upsert({
      where: { companyId },
      create: {
        companyId,
        cnpj: info.cnpj,
        cUFAutor,
        pfxData: encrypted.pfxData,
        pfxPassword: encrypted.pfxPassword,
        validFrom: info.validFrom,
        validUntil: info.validUntil,
      },
      update: {
        cnpj: info.cnpj,
        cUFAutor,
        pfxData: encrypted.pfxData,
        pfxPassword: encrypted.pfxPassword,
        validFrom: info.validFrom,
        validUntil: info.validUntil,
        active: true,
        // Replacing the certificate restarts the NSU cursor — the new certificate
        // is a fresh credential as far as the Ambiente Nacional is concerned.
        lastNsu: '000000000000000',
        lastSyncAt: null,
      },
    })

    return reply.status(201).send({ certificate: certificateToMetadata(certificate) })
  })

  // GET /companies/:id/certificate — metadados (nunca retorna o .pfx ou a senha)
  fastify.get('/companies/:id/certificate', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id: companyId } = request.params as { id: string }
    const certificate = await prisma.companyCertificate.findUnique({ where: { companyId } })
    return reply.send({ certificate: certificate ? certificateToMetadata(certificate) : null })
  })

  // DELETE /companies/:id/certificate
  fastify.delete('/companies/:id/certificate', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isAdmin(request)) {
      return reply.status(403).send({ error: 'Acesso restrito a administradores' })
    }

    const { id: companyId } = request.params as { id: string }
    const certificate = await prisma.companyCertificate.findUnique({ where: { companyId } })
    if (!certificate) {
      return reply.status(404).send({ error: 'Certificado não encontrado' })
    }

    await prisma.companyCertificate.delete({ where: { companyId } })
    // Sem certificado não há como sincronizar — desliga o agendamento automático junto.
    await setCompanySyncConfig(companyId, { enabled: false }).catch(() => undefined)

    return reply.status(204).send()
  })

  // ─── Distribuição DFe — sincronização automática ───────────────────────────

  // GET /nfe/dfe/config/:companyId
  fastify.get('/nfe/dfe/config/:companyId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { companyId } = request.params as { companyId: string }
    return reply.send({ config: getCompanySyncConfig(companyId) })
  })

  // PATCH /nfe/dfe/config/:companyId — liga/desliga o sync automático e define o intervalo
  fastify.patch('/nfe/dfe/config/:companyId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!isAdmin(request)) {
      return reply.status(403).send({ error: 'Acesso restrito a administradores' })
    }

    const { companyId } = request.params as { companyId: string }
    const body = syncConfigSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: 'Dados inválidos', details: body.error.flatten() })
    }

    if (body.data.enabled) {
      const certificate = await prisma.companyCertificate.findUnique({ where: { companyId } })
      if (!certificate || !certificate.active) {
        return reply.status(400).send({ error: 'Configure o certificado digital da empresa antes de ativar a sincronização automática.' })
      }
      if (certificate.validUntil.getTime() < Date.now()) {
        return reply.status(400).send({ error: 'O certificado digital está expirado. Atualize-o antes de ativar a sincronização automática.' })
      }
    }

    try {
      const config = await setCompanySyncConfig(companyId, {
        enabled: body.data.enabled,
        intervalMinutes: body.data.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES,
      })
      return reply.send({ config })
    } catch (err) {
      return reply.status(404).send({ error: (err as Error).message })
    }
  })

  // POST /nfe/dfe/sync/:companyId — dispara um ciclo manual ("Sincronizar agora")
  fastify.post('/nfe/dfe/sync/:companyId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { companyId } = request.params as { companyId: string }
    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) {
      return reply.status(404).send({ error: 'Empresa não encontrada' })
    }

    try {
      const logId = await runDistributionSync(companyId)
      return reply.status(202).send({
        logId,
        message: 'Sincronização iniciada. Consulte /nfe/dfe/sync/:logId para acompanhar o progresso.',
      })
    } catch (err) {
      if (err instanceof DistributionSyncError) {
        return reply.status(400).send({ error: err.message })
      }
      throw err
    }
  })

  // GET /nfe/dfe/sync/:logId — status de um ciclo (polling)
  fastify.get('/nfe/dfe/sync/:logId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { logId } = request.params as { logId: string }
    const log = await prisma.dfeSyncLog.findUnique({
      where: { id: logId },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
        importLog: { select: { id: true, status: true, processed: true, success: true, duplicates: true, errors: true, totalFiles: true } },
      },
    })
    if (!log) {
      return reply.status(404).send({ error: 'Registro de sincronização não encontrado' })
    }
    return reply.send({ log })
  })

  // GET /nfe/dfe/sync — histórico paginado
  fastify.get('/nfe/dfe/sync', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { companyId?: string; page?: string; limit?: string }
    const page = parseInt(query.page || '1', 10)
    const limit = parseInt(query.limit || '20', 10)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (query.companyId) where.companyId = query.companyId

    const [logs, total] = await Promise.all([
      prisma.dfeSyncLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          company: { select: { id: true, name: true, cnpj: true } },
          importLog: { select: { id: true, status: true, totalFiles: true, success: true, duplicates: true, errors: true } },
        },
      }),
      prisma.dfeSyncLog.count({ where }),
    ])

    return reply.send({ logs, total, page, limit })
  })
}

export default dfeRoutes
