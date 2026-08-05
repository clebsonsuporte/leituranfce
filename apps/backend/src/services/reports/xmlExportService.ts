import prisma from '../../lib/prisma.js'
import AdmZip from 'adm-zip'

interface XmlExportFilters {
  companyId?: string
  competencia?: string
}

// Exporta em um único ZIP os XMLs originais das notas validadas do período —
// mesmo critério de "Notas Autorizadas" usado no relatório de Entradas e
// Saídas (exclui cancelada/inutilizada/sem protocolo). O xmlRaw salvo no
// banco é o mesmo conteúdo importado do Drive, sem segunda cópia/edição —
// então o ZIP exportado aqui é idêntico ao que está na pasta do cliente no
// Drive, só que já filtrado e empacotado para conferência/envio.
export async function exportXmlZip(filters: XmlExportFilters): Promise<{ buffer: Buffer; count: number }> {
  const where: Record<string, unknown> = {
    status: { notIn: ['CANCELADA', 'INUTILIZADA', 'SEM_PROTOCOLO'] },
  }
  if (filters.companyId) where.companyId = filters.companyId
  if (filters.competencia) where.competencia = filters.competencia

  const nfes = await prisma.nfe.findMany({
    where,
    select: { chNFe: true, xmlRaw: true },
    orderBy: { dhEmi: 'asc' },
  })

  const zip = new AdmZip()
  for (const nfe of nfes) {
    zip.addFile(`${nfe.chNFe}.xml`, Buffer.from(nfe.xmlRaw, 'utf-8'))
  }

  return { buffer: zip.toBuffer(), count: nfes.length }
}
