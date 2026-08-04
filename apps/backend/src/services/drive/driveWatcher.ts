import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { listClientFolders, listRootFiles, walkDriveFolder, downloadDriveFile, type DriveFileRef } from './driveClient.js'
import { processXmlFiles, runPool } from '../nfe/importService.js'
import { extractXmlsFromFile, detectFileType } from '../archive/extractor.js'
import prisma from '../../lib/prisma.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(__dirname, '../../../data/drive-watcher-config.json')

// Drive não tem um cooldown como a SEFAZ (que limita o DFe a 30-60min) —
// 15min é só para não bater na cota de leitura da API à toa.
export const DEFAULT_INTERVAL_MINUTES = 15
export const MIN_INTERVAL_MINUTES = 5

export interface DriveWatcherConfig {
  enabled: boolean
  rootFolderId: string
  companyId: string
  intervalMinutes: number
  processedFileIds: string[]
  lastActivity?: string
}

export interface DriveWatcherStatus {
  running: boolean
  config: DriveWatcherConfig
  filesDetected: number
  filesProcessed: number
  errors: string[]
}

const DEFAULT_CONFIG: DriveWatcherConfig = {
  enabled: false,
  rootFolderId: '',
  companyId: 'auto',
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  processedFileIds: [],
}

let timer: NodeJS.Timeout | null = null
let polling = false
let status: DriveWatcherStatus = {
  running: false,
  config: { ...DEFAULT_CONFIG },
  filesDetected: 0,
  filesProcessed: 0,
  errors: [],
}

export function loadConfig(): DriveWatcherConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      const raw = readFileSync(CONFIG_PATH, 'utf-8')
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG }
}

export function saveConfig(config: DriveWatcherConfig): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('[drive-watcher] failed to persist config:', err)
  }
}

export function getStatus(): DriveWatcherStatus {
  return { ...status, config: loadConfig() }
}

function pushError(msg: string): void {
  status.errors.push(msg)
  if (status.errors.length > 50) status.errors = status.errors.slice(-50)
}

const DOWNLOAD_CONCURRENCY = 5

// Pastas com milhares de arquivos (aconteceu na prática — uma só teve 16 mil)
// são processadas em blocos deste tamanho, com o progresso salvo em disco
// após CADA bloco. Sem isso, uma pasta gigante virava uma operação
// tudo-ou-nada: qualquer reinício do processo no meio (queda de rede, Mac
// hibernando, restart do tsx watch) perdia o progresso inteiro daquela pasta
// e recomeçava do zero.
const CHUNK_SIZE = 200

async function persistProcessed(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const updatedConfig = loadConfig()
  const seen = new Set(updatedConfig.processedFileIds)
  for (const id of ids) seen.add(id)
  updatedConfig.processedFileIds = [...seen] // sem cap — são só IDs curtos, não pesa
  updatedConfig.lastActivity = new Date().toISOString()
  saveConfig(updatedConfig)
  status.config = updatedConfig
}

async function importChunk(folderLabel: string, chunk: DriveFileRef[], config: DriveWatcherConfig): Promise<void> {
  const files: { filename: string; buffer: Buffer }[] = []
  const newlyProcessedIds: string[] = []

  await runPool(chunk, DOWNLOAD_CONCURRENCY, async (ref) => {
    try {
      const buffer = await downloadDriveFile(ref.id)
      if (buffer.length > 0) {
        const fileType = detectFileType(ref.name)
        if (fileType === 'xml') {
          files.push({ filename: ref.name, buffer })
        } else if (fileType === 'zip' || fileType === 'rar') {
          const { files: extracted } = await extractXmlsFromFile(ref.name, buffer)
          files.push(...extracted)
        }
      }
      newlyProcessedIds.push(ref.id)
    } catch (err) {
      pushError(`${folderLabel}/${ref.name}: ${(err as Error).message}`)
    }
  })

  if (files.length > 0) {
    let companyId = config.companyId || 'auto'
    if (companyId !== 'auto') {
      const company = await prisma.company.findUnique({ where: { id: companyId } })
      if (!company) companyId = 'auto'
    }

    const importLog = await prisma.importLog.create({
      data: {
        companyId: companyId !== 'auto' ? companyId : null,
        filename: `Google Drive — ${folderLabel}: ${files.length} arquivo(s)`,
        totalFiles: files.length,
        status: 'PROCESSING',
      },
    })

    try {
      await processXmlFiles(files, companyId, importLog.id)
      status.filesProcessed += files.length
    } catch (err) {
      pushError(`${folderLabel}: falha ao processar lote (${(err as Error).message})`)
      await prisma.importLog.update({
        where: { id: importLog.id },
        data: { status: 'FAILED', details: { error: (err as Error).message } },
      })
    }
  }

  await persistProcessed(newlyProcessedIds)
}

// Baixa (em paralelo limitado) e importa os arquivos pendentes de UMA pasta,
// em blocos de CHUNK_SIZE, salvando progresso após cada bloco.
async function processFolderBatch(
  folderLabel: string,
  pending: DriveFileRef[],
  config: DriveWatcherConfig
): Promise<void> {
  if (pending.length === 0) return

  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    if (!loadConfig().enabled) break // permite "parar" surtir efeito entre blocos, não só entre pastas
    const chunk = pending.slice(i, i + CHUNK_SIZE)
    console.log(`[drive-watcher] ${folderLabel}: bloco ${i + 1}-${i + chunk.length} de ${pending.length}`)
    await importChunk(folderLabel, chunk, config)
  }
}

// Varre a pasta raiz pasta-por-pasta (uma por cliente) e alimenta o mesmo
// processXmlFiles usado pelo upload manual e pelo watcher de pasta local —
// sem duplicar lógica de parsing/import. Progresso incremental: cada pasta
// processada já atualiza status/config antes de seguir para a próxima,
// então dá pra acompanhar em tempo real e um "parar" surte efeito entre
// pastas em vez de precisar esperar tudo terminar.
export async function pollOnce(): Promise<void> {
  if (polling) return // evita sobreposição se um ciclo anterior ainda não terminou
  polling = true
  try {
    const config = loadConfig()
    if (!config.enabled || !config.rootFolderId) return

    const processedSet = new Set(config.processedFileIds)

    console.log('[drive-watcher] listando pastas de cliente...')
    const clientFolders = await listClientFolders(config.rootFolderId)
    console.log(`[drive-watcher] ${clientFolders.length} pastas de cliente encontradas`)

    // Arquivos soltos direto na raiz, fora de qualquer pasta de cliente
    const rootFiles = await listRootFiles(config.rootFolderId)
    const pendingRoot = rootFiles.filter((f) => !processedSet.has(f.id))
    status.filesDetected += pendingRoot.length
    await processFolderBatch('(raiz)', pendingRoot, config)

    for (const [i, folder] of clientFolders.entries()) {
      if (!loadConfig().enabled) break // permite "parar" surtir efeito entre pastas
      try {
        console.log(`[drive-watcher] (${i + 1}/${clientFolders.length}) varrendo pasta: ${folder.name}`)
        const filesHere = await walkDriveFolder(folder.id)
        const currentProcessed = new Set(loadConfig().processedFileIds)
        const pending = filesHere.filter((f) => !currentProcessed.has(f.id))
        console.log(`[drive-watcher] ${folder.name}: ${filesHere.length} arquivos, ${pending.length} pendente(s)`)
        status.filesDetected += pending.length
        await processFolderBatch(folder.name, pending, config)
        console.log(`[drive-watcher] ${folder.name}: concluído`)
      } catch (err) {
        pushError(`${folder.name}: ${(err as Error).message}`)
      }
    }
    console.log('[drive-watcher] ciclo de varredura concluído')
  } catch (err) {
    pushError(`Erro na varredura do Drive: ${(err as Error).message}`)
  } finally {
    polling = false
  }
}

function scheduleTimer(intervalMinutes: number): void {
  if (timer) clearInterval(timer)
  const intervalMs = Math.max(intervalMinutes, MIN_INTERVAL_MINUTES) * 60_000
  timer = setInterval(() => {
    pollOnce().catch((err) => pushError(`Erro no ciclo agendado: ${(err as Error).message}`))
  }, intervalMs)
}

export async function startWatcher(
  rootFolderId: string,
  companyId = 'auto',
  intervalMinutes = DEFAULT_INTERVAL_MINUTES
): Promise<void> {
  const config: DriveWatcherConfig = {
    ...loadConfig(),
    enabled: true,
    rootFolderId,
    companyId,
    intervalMinutes: Math.max(intervalMinutes, MIN_INTERVAL_MINUTES),
  }
  saveConfig(config)

  status = { running: true, config, filesDetected: 0, filesProcessed: 0, errors: [] }

  scheduleTimer(config.intervalMinutes)
  // Não espera a varredura terminar — com milhares de arquivos isso pode
  // levar minutos. O progresso é acompanhado via GET /status.
  pollOnce().catch((err) => pushError(`Erro na varredura inicial: ${(err as Error).message}`))
}

export async function stopWatcher(): Promise<void> {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  const config = loadConfig()
  config.enabled = false
  saveConfig(config)
  status.running = false
}

// Auto-start if config says enabled — mirrors initWatcher()/initDfeSync()
export async function initDriveWatcher(): Promise<void> {
  const config = loadConfig()
  if (config.enabled && config.rootFolderId) {
    console.log(`[drive-watcher] Auto-starting for folder: ${config.rootFolderId}`)
    status = { running: true, config, filesDetected: 0, filesProcessed: 0, errors: [] }
    scheduleTimer(config.intervalMinutes)
    pollOnce().catch((err) => pushError(`Erro na varredura inicial: ${(err as Error).message}`))
  }
}
