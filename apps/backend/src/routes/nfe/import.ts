import type { FastifyPluginAsync } from 'fastify'
import prisma from '../../lib/prisma.js'
import { processXmlFiles } from '../../services/nfe/importService.js'
import { extractXmlsFromFile, detectFileType } from '../../services/archive/extractor.js'

const ACCEPTED_EXTENSIONS = ['.xml', '.zip', '.rar']

const importRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /nfe/import
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parts = request.parts()
    const files: { filename: string; buffer: Buffer }[] = []
    const archiveSummary: { name: string; type: string; xmlCount: number; error?: string }[] = []
    let companyId = 'auto'

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'companyId') {
        companyId = String(part.value)
        continue
      }

      if (part.type !== 'file') continue

      const chunks: Buffer[] = []
      for await (const chunk of part.file) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)
      const filename = part.filename || 'unknown'
      const lower = filename.toLowerCase()

      if (!ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue
      if (buffer.length === 0) continue

      const fileType = detectFileType(filename)

      if (fileType === 'xml') {
        files.push({ filename, buffer })
      } else if (fileType === 'zip' || fileType === 'rar') {
        const { files: extracted, error } = await extractXmlsFromFile(filename, buffer)
        archiveSummary.push({
          name: filename,
          type: fileType.toUpperCase(),
          xmlCount: extracted.length,
          error,
        })
        files.push(...extracted)
        fastify.log.info(`Extracted ${extracted.length} XMLs from ${fileType.toUpperCase()}: ${filename}`)
      }
    }

    if (files.length === 0) {
      return reply.status(400).send({
        error: 'Nenhum XML encontrado. Envie arquivos .xml, .zip ou .rar contendo XMLs de NF-e.',
        archiveSummary,
      })
    }

    // Validate company exists if provided
    if (companyId !== 'auto') {
      const company = await prisma.company.findUnique({ where: { id: companyId } })
      if (!company) {
        return reply.status(404).send({ error: 'Company not found' })
      }
    }

    // Create import log (companyId resolved later for 'auto' mode)
    const importLog = await prisma.importLog.create({
      data: {
        companyId: companyId !== 'auto' ? companyId : null,
        filename:
          archiveSummary.length > 0
            ? archiveSummary.map((a) => a.name).join(', ')
            : files.length === 1
              ? files[0].filename
              : `${files.length} arquivos`,
        totalFiles: files.length,
        status: 'PROCESSING',
      },
    })

    // Process asynchronously
    setImmediate(async () => {
      try {
        await processXmlFiles(files, companyId, importLog.id)
      } catch (err) {
        console.error('Import processing error:', err)
        await prisma.importLog.update({
          where: { id: importLog.id },
          data: {
            status: 'FAILED',
            details: { error: (err as Error).message },
          },
        })
      }
    })

    return reply.status(202).send({
      logId: importLog.id,
      totalFiles: files.length,
      message: 'Import started. Poll /nfe/import/:logId for status.',
    })
  })

  // GET /nfe/import/:logId
  fastify.get('/:logId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { logId } = request.params as { logId: string }

    const log = await prisma.importLog.findUnique({
      where: { id: logId },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
      },
    })

    if (!log) {
      return reply.status(404).send({ error: 'Import log not found' })
    }

    return reply.send({ log })
  })

  // GET /nfe/import (list recent imports)
  fastify.get('/list', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { companyId?: string; page?: string; limit?: string }
    const page = parseInt(query.page || '1', 10)
    const limit = parseInt(query.limit || '20', 10)
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (query.companyId) where.companyId = query.companyId

    const [logs, total] = await Promise.all([
      prisma.importLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          company: { select: { id: true, name: true, cnpj: true } },
        },
      }),
      prisma.importLog.count({ where }),
    ])

    return reply.send({ logs, total, page, limit })
  })
}

export default importRoutes
