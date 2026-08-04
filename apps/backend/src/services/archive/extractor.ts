import AdmZip from 'adm-zip'

export interface ExtractedFile {
  filename: string
  buffer: Buffer
}

export type ArchiveType = 'zip' | 'rar' | 'xml' | 'unknown'

export function detectFileType(filename: string): ArchiveType {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.zip')) return 'zip'
  if (lower.endsWith('.rar')) return 'rar'
  if (lower.endsWith('.xml')) return 'xml'
  return 'unknown'
}

export function extractFromZip(buffer: Buffer): ExtractedFile[] {
  const results: ExtractedFile[] = []

  try {
    const zip = new AdmZip(buffer)
    const entries = zip.getEntries()

    for (const entry of entries) {
      if (entry.isDirectory) continue

      const name = entry.entryName.toLowerCase()
      if (!name.endsWith('.xml')) continue

      const content = zip.readFile(entry)
      if (!content || content.length === 0) continue

      // Use only the filename, not the full path inside the zip
      const shortName = entry.name || entry.entryName.split('/').pop() || entry.entryName
      results.push({ filename: shortName, buffer: content })
    }
  } catch (err) {
    throw new Error(`Failed to extract ZIP: ${(err as Error).message}`)
  }

  return results
}

export async function extractFromRar(buffer: Buffer): Promise<ExtractedFile[]> {
  const results: ExtractedFile[] = []

  try {
    // node-unrar-js uses a dynamic import due to WASM loading
    const { createExtractorFromData } = await import('node-unrar-js')
    const extractor = await createExtractorFromData({ data: new Uint8Array(buffer).buffer })

    const extracted = extractor.extract({ files: undefined })
    const files = [...extracted.files]

    for (const file of files) {
      if (file.fileHeader.flags.directory) continue

      const name = file.fileHeader.name.toLowerCase()
      if (!name.endsWith('.xml')) continue

      if (!file.extraction) continue

      const content = Buffer.from(file.extraction)
      if (content.length === 0) continue

      const shortName =
        file.fileHeader.name.split(/[\\/]/).pop() || file.fileHeader.name
      results.push({ filename: shortName, buffer: content })
    }
  } catch (err) {
    throw new Error(`Failed to extract RAR: ${(err as Error).message}`)
  }

  return results
}

export async function extractXmlsFromFile(
  filename: string,
  buffer: Buffer
): Promise<{ files: ExtractedFile[]; archiveType: ArchiveType; error?: string }> {
  const archiveType = detectFileType(filename)

  if (archiveType === 'xml') {
    return { files: [{ filename, buffer }], archiveType }
  }

  if (archiveType === 'zip') {
    try {
      const files = extractFromZip(buffer)
      return { files, archiveType }
    } catch (err) {
      return { files: [], archiveType, error: (err as Error).message }
    }
  }

  if (archiveType === 'rar') {
    try {
      const files = await extractFromRar(buffer)
      return { files, archiveType }
    } catch (err) {
      return { files: [], archiveType, error: (err as Error).message }
    }
  }

  return { files: [], archiveType: 'unknown', error: `Unsupported file type: ${filename}` }
}
