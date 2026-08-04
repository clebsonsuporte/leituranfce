import type { CompanyCertificate } from '@prisma/client'
import prisma from '../../lib/prisma.js'
import { decryptCertificate } from './certificateService.js'
import { consultarDistribuicaoPorNsu, type Ambiente } from './soapClient.js'
import { processXmlFiles, type ImportFile } from '../nfe/importService.js'

export class DistributionSyncError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DistributionSyncError'
  }
}

/** Override with DFE_AMBIENTE=2 to point at SEFAZ homologação while validating the integration. */
const AMBIENTE: Ambiente = process.env.DFE_AMBIENTE === '2' ? 2 : 1

/** Bounds a single run so one cycle can't loop forever inside a setInterval tick. */
const MAX_BATCHES_PER_RUN = 20

const CSTAT_DOCS_FOUND = '138'
const CSTAT_NO_NEW_DOCS = '137'
const CSTAT_RATE_LIMITED = '656'

/**
 * Validates the company's certificate, opens a DfeSyncLog and kicks off the NSU
 * pagination cycle in the background — mirrors how POST /nfe/import returns a
 * logId immediately while processXmlFiles keeps running asynchronously.
 * Returns the new log id so callers (routes, scheduler) can poll its progress.
 */
export async function runDistributionSync(companyId: string): Promise<string> {
  const cert = await prisma.companyCertificate.findUnique({ where: { companyId } })
  if (!cert || !cert.active) {
    throw new DistributionSyncError('Esta empresa não possui certificado digital configurado.')
  }
  if (cert.validUntil.getTime() < Date.now()) {
    throw new DistributionSyncError('O certificado digital desta empresa está expirado. Atualize-o para continuar.')
  }

  const alreadyRunning = await prisma.dfeSyncLog.findFirst({
    where: { companyId, status: 'PROCESSING' },
  })
  if (alreadyRunning) {
    throw new DistributionSyncError('Já existe uma sincronização em andamento para esta empresa.')
  }

  const log = await prisma.dfeSyncLog.create({
    data: { companyId, startNsu: cert.lastNsu, status: 'PROCESSING' },
  })

  executeSyncCycle(log.id, companyId, cert).catch((err) => {
    console.error(`[dfe] sync cycle ${log.id} crashed unexpectedly:`, err)
  })

  return log.id
}

async function executeSyncCycle(logId: string, companyId: string, cert: CompanyCertificate): Promise<void> {
  try {
    const { pfxBuffer, password } = decryptCertificate(cert.pfxData, cert.pfxPassword)

    const collected: ImportFile[] = []
    let docsSummary = 0
    let cursor = cert.lastNsu
    let finalMessage = ''

    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
      const result = await consultarDistribuicaoPorNsu({
        ambiente: AMBIENTE,
        cUFAutor: cert.cUFAutor,
        cnpj: cert.cnpj,
        ultNSU: cursor,
        pfxBuffer,
        passphrase: password,
      })

      if (result.cStat === CSTAT_RATE_LIMITED) {
        finalMessage =
          'A SEFAZ limitou as consultas (consumo indevido). O sistema tentará novamente no próximo ciclo, respeitando o intervalo mínimo de 1 hora.'
        break
      }

      if (result.cStat !== CSTAT_DOCS_FOUND && result.cStat !== CSTAT_NO_NEW_DOCS) {
        throw new DistributionSyncError(`A SEFAZ recusou a consulta (cStat ${result.cStat}): ${result.xMotivo}`)
      }

      for (const doc of result.docs) {
        const mod = doc.xml.match(/<mod>(\d+)<\/mod>/)?.[1] ?? doc.chave?.slice(20, 22)
        console.log(`[dfe] doc nsu=${doc.nsu} schema=${doc.schema} mod=${mod ?? '?'} full=${doc.isFullDocument}`)
        if (doc.isFullDocument) {
          collected.push({ filename: `${doc.chave ?? doc.nsu}.xml`, buffer: Buffer.from(doc.xml, 'utf-8') })
        } else {
          docsSummary++
        }
      }

      // Persist the cursor after every batch so a crash mid-run never re-downloads what we already have.
      cursor = result.ultNSU
      await prisma.companyCertificate.update({ where: { id: cert.id }, data: { lastNsu: cursor } })

      if (result.cStat === CSTAT_NO_NEW_DOCS) {
        finalMessage = 'Nenhum documento novo encontrado.'
        break
      }
      if (cursor >= result.maxNSU) {
        finalMessage = `${collected.length + docsSummary} documento(s) novo(s) localizado(s).`
        break
      }
    }

    let importLogId: string | undefined
    if (collected.length > 0) {
      const importLog = await prisma.importLog.create({
        data: {
          companyId,
          filename: `Distribuição DFe — NSU ${cert.lastNsu} a ${cursor}`,
          totalFiles: collected.length,
          status: 'PROCESSING',
        },
      })
      importLogId = importLog.id
      await processXmlFiles(collected, companyId, importLog.id)
    }

    await prisma.companyCertificate.update({ where: { id: cert.id }, data: { lastSyncAt: new Date() } })

    await prisma.dfeSyncLog.update({
      where: { id: logId },
      data: {
        status: 'COMPLETED',
        endNsu: cursor,
        docsFound: collected.length,
        docsSummary,
        importLogId,
        message: finalMessage || `${collected.length} documento(s) baixado(s) e enviado(s) para importação.`,
      },
    })
  } catch (err) {
    await prisma.dfeSyncLog.update({
      where: { id: logId },
      data: { status: 'FAILED', message: (err as Error).message },
    })
  }
}
