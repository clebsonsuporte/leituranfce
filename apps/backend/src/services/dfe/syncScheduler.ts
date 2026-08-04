import { readFileSync, writeFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import prisma from '../../lib/prisma.js'
import { runDistributionSync } from './distributionService.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(__dirname, '../../../data/dfe-sync-config.json')

export interface CompanySyncConfig {
  enabled: boolean
  intervalMinutes: number
}

export type SchedulerConfig = Record<string, CompanySyncConfig>

export const DEFAULT_INTERVAL_MINUTES = 60
/** SEFAZ enforces a ~1h cooldown after "no new docs" — polling faster only wastes the quota. */
export const MIN_INTERVAL_MINUTES = 30

const timers = new Map<string, NodeJS.Timeout>()

function loadSchedulerConfig(): SchedulerConfig {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'))
    }
  } catch {
    // ignore — start from an empty config
  }
  return {}
}

function saveSchedulerConfig(config: SchedulerConfig): void {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
  } catch (err) {
    console.error('[dfe-scheduler] failed to persist config:', err)
  }
}

function clearCompanyTimer(companyId: string): void {
  const timer = timers.get(companyId)
  if (timer) {
    clearInterval(timer)
    timers.delete(companyId)
  }
}

function scheduleCompany(companyId: string, intervalMinutes: number): void {
  clearCompanyTimer(companyId)
  const intervalMs = Math.max(intervalMinutes, MIN_INTERVAL_MINUTES) * 60_000
  const timer = setInterval(() => {
    runDistributionSync(companyId).catch((err) => {
      // "no certificate" / "expired" / "already running" are expected steady-state
      // outcomes of an unattended poll — log instead of crashing the scheduler.
      console.error(`[dfe-scheduler] sync skipped for company ${companyId}: ${(err as Error).message}`)
    })
  }, intervalMs)
  timers.set(companyId, timer)
}

export function getCompanySyncConfig(companyId: string): CompanySyncConfig {
  const config = loadSchedulerConfig()
  return config[companyId] ?? { enabled: false, intervalMinutes: DEFAULT_INTERVAL_MINUTES }
}

export async function setCompanySyncConfig(
  companyId: string,
  input: { enabled: boolean; intervalMinutes?: number }
): Promise<CompanySyncConfig> {
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) {
    throw new Error('Company not found')
  }

  const intervalMinutes = Math.max(input.intervalMinutes ?? DEFAULT_INTERVAL_MINUTES, MIN_INTERVAL_MINUTES)
  const entry: CompanySyncConfig = { enabled: input.enabled, intervalMinutes }

  const config = loadSchedulerConfig()
  config[companyId] = entry
  saveSchedulerConfig(config)

  if (entry.enabled) {
    scheduleCompany(companyId, intervalMinutes)
  } else {
    clearCompanyTimer(companyId)
  }

  return entry
}

/** Restores every enabled per-company timer from disk on server boot — mirrors initWatcher(). */
export function initDfeSync(): void {
  const config = loadSchedulerConfig()
  let enabledCount = 0
  for (const [companyId, entry] of Object.entries(config)) {
    if (entry.enabled) {
      scheduleCompany(companyId, entry.intervalMinutes)
      enabledCount++
    }
  }
  if (enabledCount > 0) {
    console.log(`[dfe-scheduler] auto-sync restored for ${enabledCount} compan${enabledCount === 1 ? 'y' : 'ies'}`)
  }
}
