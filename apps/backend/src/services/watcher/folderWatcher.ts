import chokidar, { type FSWatcher } from 'chokidar'
import { readFileSync, writeFileSync, existsSync, readFile } from 'fs'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'
import { processXmlFiles } from '../nfe/importService.js'
import { extractXmlsFromFile, detectFileType } from '../archive/extractor.js'
import prisma from '../../lib/prisma.js'

const readFileAsync = promisify(readFile)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(__dirname, '../../../data/watcher-config.json')

export interface WatcherConfig {
  enabled: boolean
  folderPath: string
  companyId: string
  processedFiles: string[]
  lastActivity?: string
}

export interface WatcherStatus {
  running: boolean
  config: WatcherConfig
  filesDetected: number
  filesProcessed: number
  errors: string[]
}

const DEFAULT_CONFIG: WatcherConfig = {
  enabled: false,
  folderPath: '',
  companyId: 'auto',
  processedFiles: [],
}

let watcher: FSWatcher | null = null
let status: WatcherStatus = {
  running: false,
  config: { ...DEFAULT_CONFIG },
  filesDetected: 0,
  filesProcessed: 0,
  errors: [],
}

export function loadConfig(): WatcherConfig {
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

export function saveConfig(config: WatcherConfig): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('Failed to save watcher config:', err)
  }
}

export function getStatus(): WatcherStatus {
  return { ...status, config: loadConfig() }
}

async function processFile(filePath: string): Promise<void> {
  const config = loadConfig()
  const filename = path.basename(filePath)
  const ext = path.extname(filename).toLowerCase()

  if (!['.xml', '.zip', '.rar'].includes(ext)) return
  if (config.processedFiles.includes(filePath)) return

  try {
    const buffer = await readFileAsync(filePath)
    if (buffer.length === 0) return

    status.filesDetected++
    status.config.lastActivity = new Date().toISOString()

    const fileType = detectFileType(filename)
    let files: { filename: string; buffer: Buffer }[] = []

    if (fileType === 'xml') {
      files = [{ filename, buffer }]
    } else if (fileType === 'zip' || fileType === 'rar') {
      const { files: extracted } = await extractXmlsFromFile(filename, buffer)
      files = extracted
    }

    if (files.length === 0) return

    // Determine companyId
    let companyId = config.companyId || 'auto'
    if (companyId !== 'auto') {
      const company = await prisma.company.findUnique({ where: { id: companyId } })
      if (!company) companyId = 'auto'
    }

    // Create import log
    const importLog = await prisma.importLog.create({
      data: {
        companyId: companyId !== 'auto' ? companyId : null,
        filename,
        totalFiles: files.length,
        status: 'PROCESSING',
      },
    })

    // Process async
    processXmlFiles(files, companyId, importLog.id)
      .then(() => {
        status.filesProcessed++
        // Mark as processed
        const cfg = loadConfig()
        if (!cfg.processedFiles.includes(filePath)) {
          cfg.processedFiles.push(filePath)
          // Keep only last 1000 processed files
          if (cfg.processedFiles.length > 1000) {
            cfg.processedFiles = cfg.processedFiles.slice(-1000)
          }
          saveConfig(cfg)
        }
      })
      .catch((err) => {
        status.errors.push(`${filename}: ${(err as Error).message}`)
        if (status.errors.length > 50) status.errors = status.errors.slice(-50)
      })
  } catch (err) {
    status.errors.push(`${filename}: ${(err as Error).message}`)
    if (status.errors.length > 50) status.errors = status.errors.slice(-50)
  }
}

export async function startWatcher(folderPath: string, companyId = 'auto'): Promise<void> {
  if (watcher) {
    await watcher.close()
    watcher = null
  }

  const config: WatcherConfig = {
    ...loadConfig(),
    enabled: true,
    folderPath,
    companyId,
  }
  saveConfig(config)

  status = {
    running: true,
    config,
    filesDetected: 0,
    filesProcessed: 0,
    errors: [],
  }

  watcher = chokidar.watch(folderPath, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 1000, pollInterval: 100 },
    ignored: /(^|[/\\])\../,
    depth: 1,
  })

  watcher
    .on('add', (filePath) => {
      processFile(filePath).catch(console.error)
    })
    .on('error', (err) => {
      status.errors.push(`Watcher error: ${(err as Error).message}`)
    })

  console.log(`[Watcher] Started watching: ${folderPath}`)
}

export async function stopWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close()
    watcher = null
  }
  const config = loadConfig()
  config.enabled = false
  saveConfig(config)
  status.running = false
  console.log('[Watcher] Stopped')
}

// Auto-start if config says enabled
export async function initWatcher(): Promise<void> {
  const config = loadConfig()
  if (config.enabled && config.folderPath) {
    console.log(`[Watcher] Auto-starting from config: ${config.folderPath}`)
    await startWatcher(config.folderPath, config.companyId)
  }
}
