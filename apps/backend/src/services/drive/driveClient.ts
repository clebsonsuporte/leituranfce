import { readFileSync } from 'fs'
import { google, drive_v3 } from 'googleapis'

const ACCEPTED_EXTENSIONS = ['.xml', '.zip', '.rar']
const IGNORED_FOLDER_NAMES = new Set(['_cache_dashboard'])

export interface DriveFileRef {
  id: string
  name: string
}

let driveClient: drive_v3.Drive | null = null

// Em produção (hospedagem na nuvem) normalmente não existe um caminho de
// disco persistente para guardar a chave — GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
// (o conteúdo do JSON direto, como variável de ambiente) cobre esse caso.
// Em dev local, GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_PATH (caminho do arquivo)
// continua funcionando normalmente. Um dos dois é obrigatório.
function loadServiceAccountKey(): { client_email: string; private_key: string } {
  const inlineJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON
  if (inlineJson) {
    return JSON.parse(inlineJson)
  }

  const keyPath = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_PATH
  if (!keyPath) {
    throw new Error(
      'Defina GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON (conteúdo do JSON) ou GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_PATH (caminho do arquivo)'
    )
  }
  return JSON.parse(readFileSync(keyPath, 'utf-8'))
}

function getClient(): drive_v3.Drive {
  if (driveClient) return driveClient

  const key = loadServiceAccountKey()
  const auth = new google.auth.JWT({
    email: key.client_email,
    key: key.private_key,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })

  driveClient = google.drive({ version: 'v3', auth })
  return driveClient
}

// Sem timeout explícito, uma conexão que trava (rede caindo, Mac hibernando
// no meio de uma chamada) deixa a promise pendurada para sempre — e como
// pollOnce() usa uma flag `polling` para evitar sobreposição, isso trava o
// watcher inteiro silenciosamente (roda "true" mas nunca mais progride).
const REQUEST_TIMEOUT_MS = 30_000

async function listChildren(folderId: string): Promise<drive_v3.Schema$File[]> {
  const drive = getClient()
  const out: drive_v3.Schema$File[] = []
  let pageToken: string | undefined

  do {
    const res = await drive.files.list(
      {
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType)',
        pageSize: 1000,
        pageToken,
      },
      { timeout: REQUEST_TIMEOUT_MS }
    )
    out.push(...(res.data.files ?? []))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)

  return out
}

function isFolder(f: drive_v3.Schema$File): boolean {
  return f.mimeType === 'application/vnd.google-apps.folder'
}

function isAcceptedFile(f: drive_v3.Schema$File): boolean {
  const lower = (f.name ?? '').toLowerCase()
  return !!f.id && ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export interface DriveFolderRef {
  id: string
  name: string
}

// Só o primeiro nível — as pastas de cliente diretamente dentro da raiz
// "XML-Clientes", ignorando a pasta de cache do sistema antigo.
export async function listClientFolders(rootFolderId: string): Promise<DriveFolderRef[]> {
  const children = await listChildren(rootFolderId)
  return children
    .filter((c) => isFolder(c) && c.id && c.name && !IGNORED_FOLDER_NAMES.has(c.name))
    .map((c) => ({ id: c.id!, name: c.name! }))
}

// Arquivos .xml/.zip/.rar que estão diretamente na raiz (fora de qualquer
// pasta de cliente) — caso raro, mas cobre a estrutura por garantia.
export async function listRootFiles(rootFolderId: string): Promise<DriveFileRef[]> {
  const children = await listChildren(rootFolderId)
  return children.filter(isAcceptedFile).map((c) => ({ id: c.id!, name: c.name! }))
}

// Percorre recursivamente a subárvore de UMA pasta (ex.: a pasta de um
// cliente específico), retornando os arquivos .xml/.zip/.rar — espelha o
// _walkIds() do motor antigo em Apps Script para essa pasta.
export async function walkDriveFolder(folderId: string): Promise<DriveFileRef[]> {
  const out: DriveFileRef[] = []

  async function walk(id: string): Promise<void> {
    const children = await listChildren(id)
    for (const child of children) {
      if (isFolder(child)) {
        if (child.name && IGNORED_FOLDER_NAMES.has(child.name)) continue
        if (child.id) await walk(child.id)
        continue
      }
      if (isAcceptedFile(child)) out.push({ id: child.id!, name: child.name! })
    }
  }

  await walk(folderId)
  return out
}

export async function downloadDriveFile(fileId: string): Promise<Buffer> {
  const drive = getClient()
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer', timeout: REQUEST_TIMEOUT_MS }
  )
  return Buffer.from(res.data as ArrayBuffer)
}
