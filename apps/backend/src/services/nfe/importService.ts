import prisma from '../../lib/prisma.js'
import { parseXml, isEventXml, type ParsedNfe } from '../xml/parser.js'
import { checkSequenceBreaks, checkTaxDivergences } from './alertService.js'

export interface ImportFile {
  filename: string
  buffer: Buffer
}

export interface ImportResult {
  filename: string
  status: 'success' | 'duplicate' | 'event_applied' | 'event_pending' | 'error' | 'skipped'
  chNFe?: string
  error?: string
}

const IMPORT_CONCURRENCY = 8

// Roda `worker` para cada item de `items`, no máximo `concurrency` em paralelo.
// Evita tanto o gargalo de um loop sequencial (um round-trip ao banco por vez)
// quanto o excesso de conexões simultâneas em lotes com milhares de arquivos.
export async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  async function next(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor++]
      await worker(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()))
}

const CANCEL_EVENTS = new Set(['110111', '110112'])

function statusForEvent(tpEvento: string): 'CANCELADA' | 'INUTILIZADA' | null {
  if (CANCEL_EVENTS.has(tpEvento)) return 'CANCELADA'
  if (tpEvento === '110130') return 'INUTILIZADA'
  return null
}

// Aplica eventos de cancelamento/inutilização que chegaram ANTES da NF-e ter
// sido importada e ficaram represados em PendingNfeEvent. Espelha o
// idx.cancellations do motor antigo em Apps Script, só que em tabela.
async function applyPendingEvents(nfeId: string, chNFe: string): Promise<void> {
  const pending = await prisma.pendingNfeEvent.findMany({ where: { chNFe } })
  if (pending.length === 0) return

  // Se houver mais de um evento pendente para a mesma chave, o mais recente vence.
  pending.sort((a, b) => b.dhEvento.getTime() - a.dhEvento.getTime())

  let resolvedStatus: 'CANCELADA' | 'INUTILIZADA' | null = null
  for (const ev of pending) {
    const s = statusForEvent(ev.tpEvento)
    if (s && !resolvedStatus) resolvedStatus = s
    await prisma.nfeEvent.create({
      data: {
        nfeId,
        tpEvento: ev.tpEvento,
        nSeqEvento: ev.nSeqEvento,
        dhEvento: ev.dhEvento,
        xMotivo: ev.xMotivo,
        nProt: ev.nProt,
      },
    })
  }

  if (resolvedStatus) {
    await prisma.nfe.update({ where: { id: nfeId }, data: { status: resolvedStatus } })
  }

  await prisma.pendingNfeEvent.deleteMany({ where: { chNFe } })
}

// Achado real (import LOJAO GAIBU, 355 arquivos, 7 erros): quando uma
// empresa nova é importada pela primeira vez, os primeiros arquivos do lote
// processam em paralelo (IMPORT_CONCURRENCY) e todos batem no cache vazio
// ao mesmo tempo — todos tentam `company.upsert()` pro mesmo CNPJ, só um
// vence, os demais recebem violação de unique constraint (P2002) e a nota
// inteira era descartada (nem chegava a criar o Nfe). Esse fallback busca a
// empresa que a corrida já criou em vez de deixar a nota cair fora.
async function resolveOrCreateCompany(cnpj: string, name: string): Promise<string> {
  try {
    const company = await prisma.company.upsert({
      where: { cnpj },
      create: { cnpj, name, fantasia: name, active: true },
      update: {},
    })
    return company.id
  } catch (err) {
    const isUniqueViolation = (err as { code?: string })?.code === 'P2002'
    if (!isUniqueViolation) throw err
    const existing = await prisma.company.findUnique({ where: { cnpj } })
    if (existing) return existing.id
    throw err
  }
}

export async function processXmlFiles(
  files: ImportFile[],
  companyId: string,
  logId: string
): Promise<ImportResult[]> {
  const results: ImportResult[] = []
  const nfeFiles: ImportFile[] = []
  const eventFiles: ImportFile[] = []
  const createdNfeIds: { id: string; companyId: string; competencia: string }[] = []
  // Cache company resolution to avoid N upserts for same CNPJ
  const companyCache = new Map<string, string>()

  // First pass: separate NF-e from event XMLs
  for (const file of files) {
    const xmlContent = file.buffer.toString('utf-8')
    if (isEventXml(xmlContent)) {
      eventFiles.push(file)
    } else {
      nfeFiles.push(file)
    }
  }

  // Parse tudo primeiro (é só CPU/string parsing, sem I/O) pra poder olhar o
  // lote inteiro antes de decidir a quem cada nota pertence.
  //
  // Achado real (CJC CONSTRUCOES E DISTRIBUICOES virou "empresa" com 2
  // notas): o lote veio da pasta de um cliente real no Drive (destinatário
  // de fato é J & D COMERCIO DE MATERIAIS DE CONSTRUCAO), mas o XML é a nota
  // de VENDA da própria CJC (fornecedora) — tpNF=1, emitCnpj=CJC. tpNF
  // sempre reflete a operação de quem assina o XML, nunca do destinatário;
  // não dá pra usar tpNF pra saber "de quem é essa nota" isoladamente. Usar
  // emitCnpj sempre criava uma empresa fantasma pra cada fornecedor cuja
  // nota de venda ao cliente apareceu na pasta dele (ex.: baixada via
  // Manifestação do Destinatário).
  //
  // Como cada chamada de processXmlFiles já corresponde a um lote de UMA
  // pasta de cliente no Drive (ou um upload manual do mesmo cliente), o CNPJ
  // que mais aparece — como emitente OU destinatário — em TODO o lote é,
  // com folga, o cliente de verdade: as notas de venda dele (emitCnpj) são
  // a maioria; as poucas notas de compra de fornecedores (destCnpj=cliente)
  // são minoria. Isso só entra em ação no modo "auto" — quando o usuário já
  // escolheu a empresa manualmente, não há ambiguidade a resolver.
  const parsedFiles: { file: ImportFile; nfe: ParsedNfe }[] = []
  for (const file of nfeFiles) {
    const parseResult = parseXml(file.buffer.toString('utf-8'))
    if (parseResult.type === 'non_fiscal') {
      results.push({ filename: file.filename, status: 'skipped', error: parseResult.error })
      await prisma.importLog.update({ where: { id: logId }, data: { processed: { increment: 1 } } })
      continue
    }
    if (parseResult.type === 'unknown' || !parseResult.nfe) {
      results.push({ filename: file.filename, status: 'error', error: parseResult.error || 'Could not parse XML' })
      await prisma.importLog.update({
        where: { id: logId },
        data: { errors: { increment: 1 }, processed: { increment: 1 } },
      })
      continue
    }
    parsedFiles.push({ file, nfe: parseResult.nfe })
  }

  let anchorCnpj: string | undefined
  if (!companyId || companyId === 'auto') {
    const freq = new Map<string, number>()
    for (const { nfe } of parsedFiles) {
      freq.set(nfe.emitCnpj, (freq.get(nfe.emitCnpj) || 0) + 1)
      if (nfe.destCnpj) freq.set(nfe.destCnpj, (freq.get(nfe.destCnpj) || 0) + 1)
    }
    if (freq.size > 0) {
      anchorCnpj = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0]
    }
  }

  // Process NF-e files with bounded concurrency. Each file is fully isolated
  // in its own try/catch — one bad file (CNPJ inválido, race de conexão, XML
  // corrompido) nunca deve derrubar o restante do lote.
  await runPool(parsedFiles, IMPORT_CONCURRENCY, async ({ file, nfe }) => {
    try {
      // Check for duplicate by xmlHash
      const existing = await prisma.nfe.findUnique({ where: { xmlHash: nfe.xmlHash } })
      if (existing) {
        results.push({ filename: file.filename, status: 'duplicate', chNFe: nfe.chNFe })
        await prisma.importLog.update({
          where: { id: logId },
          data: { duplicates: { increment: 1 }, processed: { increment: 1 } },
        })
        return
      }

      // Se o "dono" do lote (anchorCnpj) é o destinatário desta nota — e não
      // o emitente — é uma compra do cliente pra um fornecedor: registra
      // como ENTRADA pro cliente, mesmo que o XML (do ponto de vista de quem
      // emitiu) diga tpNF=1. emitCnpj/emitNome continuam fiéis ao documento
      // real (quem de fato emitiu) — só a empresa "dona" e o tpNF mudam.
      const isCompraDoAnchor = !!anchorCnpj && nfe.emitCnpj !== anchorCnpj && nfe.destCnpj === anchorCnpj
      const effectiveTpNF = isCompraDoAnchor ? 0 : nfe.tpNF
      const subjectCnpj = anchorCnpj ?? nfe.emitCnpj
      const subjectNome = isCompraDoAnchor ? (nfe.destNome || nfe.emitNome) : nfe.emitNome

      let resolvedCompanyId = companyId
      if (!companyId || companyId === 'auto') {
        const cached = companyCache.get(subjectCnpj)
        if (cached) {
          resolvedCompanyId = cached
        } else {
          resolvedCompanyId = await resolveOrCreateCompany(subjectCnpj, subjectNome)
          companyCache.set(subjectCnpj, resolvedCompanyId)
          // Backfill importLog companyId on first resolution
          await prisma.importLog.updateMany({
            where: { id: logId, companyId: null },
            data: { companyId: resolvedCompanyId },
          })
        }
      }

      const createdNfe = await prisma.nfe.create({
        data: {
          companyId: resolvedCompanyId,
          chNFe: nfe.chNFe,
          xmlHash: nfe.xmlHash,
          mod: nfe.mod,
          serie: nfe.serie,
          nNF: nfe.nNF,
          dhEmi: nfe.dhEmi,
          competencia: nfe.competencia,
          tpNF: effectiveTpNF,
          natOp: nfe.natOp,
          emitCnpj: nfe.emitCnpj,
          emitNome: nfe.emitNome,
          emitUF: nfe.emitUF,
          destCnpj: nfe.destCnpj,
          destCpf: nfe.destCpf,
          destNome: nfe.destNome,
          vProd: nfe.vProd,
          vDesc: nfe.vDesc,
          vNF: nfe.vNF,
          vICMS: nfe.vICMS,
          vICMSST: nfe.vICMSST,
          vIPI: nfe.vIPI,
          vPIS: nfe.vPIS,
          vCOFINS: nfe.vCOFINS,
          vFrete: nfe.vFrete,
          status: nfe.status,
          xmlRaw: nfe.xmlRaw,
          importLogId: logId,
          items: {
            create: nfe.items.map((item) => ({
              nItem: item.nItem,
              cProd: item.cProd,
              xProd: item.xProd,
              ncm: item.ncm,
              cfop: item.cfop,
              uCom: item.uCom,
              qCom: item.qCom,
              vUnCom: item.vUnCom,
              vProd: item.vProd,
              vDesc: item.vDesc,
              cstIcms: item.cstIcms,
              csosnIcms: item.csosnIcms,
              vBCIcms: item.vBCIcms,
              pICMS: item.pICMS,
              vICMS: item.vICMS,
              vST: item.vST,
              cstPis: item.cstPis,
              vPIS: item.vPIS,
              cstCofins: item.cstCofins,
              vCOFINS: item.vCOFINS,
              vIPI: item.vIPI,
              tribIcms: item.tribIcms,
              tribPis: item.tribPis,
            })),
          },
        },
      })

      // Reaplica eventos de cancelamento/inutilização que chegaram antes desta nota
      await applyPendingEvents(createdNfe.id, nfe.chNFe)

      results.push({ filename: file.filename, status: 'success', chNFe: nfe.chNFe })
      await prisma.importLog.update({
        where: { id: logId },
        data: { success: { increment: 1 }, processed: { increment: 1 } },
      })

      // Collect for batch post-processing (avoid exhausting connection pool)
      createdNfeIds.push({ id: createdNfe.id, companyId: resolvedCompanyId, competencia: nfe.competencia })
    } catch (err) {
      const error = err as Error
      // Handle unique constraint violation for chNFe
      if (error.message?.includes('Unique constraint') && error.message?.includes('chNFe')) {
        results.push({ filename: file.filename, status: 'duplicate', chNFe: nfe.chNFe })
        await prisma.importLog.update({
          where: { id: logId },
          data: { duplicates: { increment: 1 }, processed: { increment: 1 } },
        })
      } else {
        results.push({ filename: file.filename, status: 'error', chNFe: nfe.chNFe, error: error.message })
        await prisma.importLog.update({
          where: { id: logId },
          data: { errors: { increment: 1 }, processed: { increment: 1 } },
        })
      }
    }
  })

  // Process event files (cancellations, etc.) — depois das NF-e, também com concorrência limitada
  await runPool(eventFiles, IMPORT_CONCURRENCY, async (file) => {
    try {
      const xmlContent = file.buffer.toString('utf-8')
      const parseResult = parseXml(xmlContent)

      if (parseResult.type !== 'event') {
        results.push({ filename: file.filename, status: 'error', error: parseResult.error || 'Could not parse event XML' })
        return
      }

      if (!parseResult.event) {
        // Envelope de evento reconhecido (ex.: pedido "-ped-eve.xml"), mas ainda
        // sem a confirmação homologada da SEFAZ — não é um erro, só não há
        // nada a aplicar até o "-eve.xml" de resposta chegar.
        results.push({
          filename: file.filename,
          status: 'skipped',
          chNFe: parseResult.chNFe,
          error: parseResult.error || 'Evento sem confirmação da SEFAZ',
        })
        return
      }

      const event = parseResult.event
      const chNFe = parseResult.chNFe

      if (!chNFe) {
        results.push({ filename: file.filename, status: 'skipped', error: 'Could not extract chNFe from event XML' })
        return
      }

      const targetNfe = await prisma.nfe.findUnique({ where: { chNFe } })

      if (!targetNfe) {
        // Nota ainda não importada — guarda o evento para aplicar retroativamente
        // quando a NF-e chegar (via applyPendingEvents), em vez de perdê-lo.
        await prisma.pendingNfeEvent.upsert({
          where: {
            chNFe_tpEvento_nSeqEvento: {
              chNFe,
              tpEvento: event.tpEvento,
              nSeqEvento: event.nSeqEvento,
            },
          },
          create: {
            chNFe,
            tpEvento: event.tpEvento,
            nSeqEvento: event.nSeqEvento,
            dhEvento: event.dhEvento,
            xMotivo: event.xMotivo,
            nProt: event.nProt,
          },
          update: {},
        })
        results.push({ filename: file.filename, status: 'event_pending', chNFe })
        await prisma.importLog.update({
          where: { id: logId },
          data: { processed: { increment: 1 } },
        })
        return
      }

      // Create the event
      await prisma.nfeEvent.create({
        data: {
          nfeId: targetNfe.id,
          tpEvento: event.tpEvento,
          nSeqEvento: event.nSeqEvento,
          dhEvento: event.dhEvento,
          xMotivo: event.xMotivo,
          nProt: event.nProt,
        },
      })

      // Update NF-e status based on event type
      const newStatus = statusForEvent(event.tpEvento)
      if (newStatus && newStatus !== targetNfe.status) {
        await prisma.nfe.update({ where: { id: targetNfe.id }, data: { status: newStatus } })
      }

      results.push({ filename: file.filename, status: 'event_applied', chNFe })
      await prisma.importLog.update({
        where: { id: logId },
        data: { success: { increment: 1 }, processed: { increment: 1 } },
      })
    } catch (err) {
      results.push({ filename: file.filename, status: 'error', error: (err as Error).message })
      await prisma.importLog.update({
        where: { id: logId },
        data: { errors: { increment: 1 }, processed: { increment: 1 } },
      })
    }
  })

  // Final: update log status
  const finalLog = await prisma.importLog.findUnique({ where: { id: logId } })
  if (finalLog) {
    await prisma.importLog.update({
      where: { id: logId },
      data: {
        // FAILED só quando TODOS os arquivos falharam e nenhum foi processado com sucesso ou duplicata
        status: finalLog.errors > 0 && finalLog.success === 0 && finalLog.duplicates === 0 ? 'FAILED' : 'COMPLETED',
        details: results as object,
      },
    })
  }

  // Batch post-processing: deduplicate company/competencia pairs for sequence breaks
  const affectedPairs = new Set<string>()
  for (const { companyId: cId, competencia } of createdNfeIds) {
    affectedPairs.add(`${cId}:${competencia}`)
  }
  for (const pair of affectedPairs) {
    const [cId, comp] = pair.split(':')
    checkSequenceBreaks(cId, comp).catch(console.error)
  }

  // Roda a auditoria fiscal (checkTaxDivergences) para TODAS as notas criadas,
  // não só lotes pequenos — com concorrência limitada em vez de um corte
  // arbitrário, para não esgotar o pool de conexões em lotes grandes (ex.:
  // varredura do Drive, que costuma trazer centenas de notas por pasta) sem
  // deixar de auditar exatamente os lotes onde mais importa pegar erro.
  runPool(createdNfeIds, 8, async ({ id, companyId: cId }) => {
    await checkTaxDivergences(id, cId).catch(console.error)
  }).catch(console.error)

  return results
}
