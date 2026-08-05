import prisma from '../../lib/prisma.js'
import { PRODUTOS_COM_ST } from '../tax/taxData.js'

export async function checkSequenceBreaks(companyId: string, competencia: string): Promise<void> {
  // Cancelada/Denegada/Inutilizada não são "lacuna" — o número foi usado e
  // tem um registro explicando o que aconteceu com ele. Só SEM_PROTOCOLO
  // (sem confirmação nenhuma da SEFAZ) conta como número sem explicação.
  const nfes = await prisma.nfe.findMany({
    where: {
      companyId,
      competencia,
      status: { not: 'SEM_PROTOCOLO' },
    },
    select: { nNF: true, serie: true, mod: true },
    orderBy: { nNF: 'asc' },
  })

  // Group by serie+mod
  const groups = new Map<string, number[]>()
  for (const nfe of nfes) {
    const key = `${nfe.mod}-${nfe.serie}`
    const nums = groups.get(key) || []
    const n = parseInt(nfe.nNF, 10)
    if (!isNaN(n)) nums.push(n)
    groups.set(key, nums)
  }

  for (const [key, nums] of groups) {
    nums.sort((a, b) => a - b)
    const gaps: number[] = []
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] - nums[i - 1] > 1) {
        for (let g = nums[i - 1] + 1; g < nums[i]; g++) {
          gaps.push(g)
        }
      }
    }

    if (gaps.length > 0) {
      const [mod, serie] = key.split('-')
      const gapsPreview = gaps.slice(0, 10).join(', ') + (gaps.length > 10 ? '...' : '')

      await prisma.alert.create({
        data: {
          companyId,
          type: 'SEQUENCE_BREAK',
          severity: 'WARNING',
          title: `Quebra de sequência - Série ${serie} (Mod ${mod})`,
          message: `${gaps.length} nota(s) faltando na competência ${competencia}: ${gapsPreview}`,
          data: { competencia, mod, serie, gaps },
        },
      })
    }
  }
}

export async function checkTaxDivergences(nfeId: string, companyId: string): Promise<void> {
  const nfe = await prisma.nfe.findUnique({
    where: { id: nfeId },
    include: { items: true },
  })

  if (!nfe) return

  if (nfe.status === 'SEM_PROTOCOLO') {
    await prisma.alert.create({
      data: {
        companyId,
        type: 'IMPORT_ERROR',
        severity: 'WARNING',
        title: `NF-e ${nfe.nNF} sem protocolo de autorização`,
        message: `O XML importado da NF-e ${nfe.nNF} (série ${nfe.serie}) é o documento assinado pelo emitente, mas não contém o protocolo de autorização da SEFAZ (sem cStat/nProt). Não há confirmação de que esta nota foi realmente autorizada — procure o arquivo correto (nfeProc/procNFe) ou confira a situação diretamente no site da SEFAZ.`,
        data: { nfeId, chNFe: nfe.chNFe, nNF: nfe.nNF, serie: nfe.serie },
      },
    })
  }

  const sumVICMS = nfe.items.reduce((acc, i) => acc + Number(i.vICMS), 0)
  const sumVPIS = nfe.items.reduce((acc, i) => acc + Number(i.vPIS), 0)
  const sumVCOFINS = nfe.items.reduce((acc, i) => acc + Number(i.vCOFINS), 0)
  const sumVIPI = nfe.items.reduce((acc, i) => acc + Number(i.vIPI), 0)

  const tolerance = 0.05
  const nfeVICMS = Number(nfe.vICMS)
  const nfeVPIS = Number(nfe.vPIS)
  const nfeVCOFINS = Number(nfe.vCOFINS)
  const nfeVIPI = Number(nfe.vIPI)

  const divergences: string[] = []

  if (Math.abs(sumVICMS - nfeVICMS) > tolerance) {
    divergences.push(
      `ICMS: total NF-e R$ ${nfeVICMS.toFixed(2)} vs soma itens R$ ${sumVICMS.toFixed(2)}`
    )
  }
  if (Math.abs(sumVPIS - nfeVPIS) > tolerance) {
    divergences.push(
      `PIS: total NF-e R$ ${nfeVPIS.toFixed(2)} vs soma itens R$ ${sumVPIS.toFixed(2)}`
    )
  }
  if (Math.abs(sumVCOFINS - nfeVCOFINS) > tolerance) {
    divergences.push(
      `COFINS: total NF-e R$ ${nfeVCOFINS.toFixed(2)} vs soma itens R$ ${sumVCOFINS.toFixed(2)}`
    )
  }
  if (nfeVIPI > 0 && Math.abs(sumVIPI - nfeVIPI) > tolerance) {
    divergences.push(
      `IPI: total NF-e R$ ${nfeVIPI.toFixed(2)} vs soma itens R$ ${sumVIPI.toFixed(2)}`
    )
  }

  if (divergences.length > 0) {
    await prisma.alert.create({
      data: {
        companyId,
        type: 'TAX_DIVERGENCE',
        severity: 'ERROR',
        title: `Divergência de impostos - NF-e ${nfe.nNF}`,
        message: `Divergência encontrada: ${divergences.join('; ')}`,
        data: { nfeId, chNFe: nfe.chNFe, divergences },
      },
    })
  }

  await auditFiscalItems(nfe.id, nfe.nNF, nfe.tpNF, companyId, nfe.items)
}

const CST_ST = ['10', '30', '60', '70']
const CSOSN_ST = ['10', '30', '60', '70', '201', '202', '203', '500']

// Auditoria fiscal item a item — inspirada nas checagens automáticas que os
// principais concorrentes (Jettax, e-Auditoria) rodam antes da entrega ao
// cliente, para pegar erro de digitação/configuração do emissor antes que
// vire problema no fechamento. Reaproveita PRODUTOS_COM_ST (taxData.ts), a
// mesma tabela usada no Consultor Tributário manual.
async function auditFiscalItems(
  nfeId: string,
  nNF: string,
  tpNF: number,
  companyId: string,
  items: { nItem: number; xProd: string; ncm: string | null; cfop: string; cstIcms: string | null; csosnIcms: string | null; vST: unknown }[]
): Promise<void> {
  for (const item of items) {
    const problems: string[] = []
    const itemLabel = `item ${item.nItem} - ${item.xProd}`

    // 1) CFOP incompatível com o sentido da operação (tpNF: 0=entrada, 1=saída)
    const cfopDigit = item.cfop?.replace(/\D/g, '').charAt(0)
    if (cfopDigit) {
      const isEntrada = ['1', '2', '3'].includes(cfopDigit)
      const isSaida = ['5', '6', '7'].includes(cfopDigit)
      if (tpNF === 1 && isEntrada) problems.push(`${itemLabel}: CFOP ${item.cfop} é de entrada numa nota de saída`)
      if (tpNF === 0 && isSaida) problems.push(`${itemLabel}: CFOP ${item.cfop} é de saída numa nota de entrada`)
    }

    // 2) ICMS sem CST nem CSOSN
    if (!item.cstIcms && !item.csosnIcms) {
      problems.push(`${itemLabel}: sem CST nem CSOSN de ICMS`)
    }

    // 3) NCM ausente ou fora do padrão (8 dígitos numéricos)
    if (!item.ncm || !/^\d{8}$/.test(item.ncm)) {
      problems.push(`${itemLabel}: NCM ausente ou inválido (${item.ncm || '—'})`)
    }

    if (problems.length > 0) {
      await prisma.alert.create({
        data: {
          companyId,
          type: 'FISCAL_AUDIT',
          severity: 'WARNING',
          title: `Inconsistência fiscal - NF-e ${nNF}`,
          message: problems.join('; '),
          data: { nfeId, nItem: item.nItem, xProd: item.xProd, problems },
        },
      })
    }

    // 4) Produto com NCM tipicamente sujeito a ST, mas sem tratamento de ST no item
    if (item.ncm && /^\d{8}$/.test(item.ncm)) {
      const stMatch = PRODUTOS_COM_ST.find((p) => p.ncmPrefixos.some((prefix) => item.ncm!.startsWith(prefix)))
      const temTratamentoST =
        (item.cstIcms && CST_ST.includes(item.cstIcms)) ||
        (item.csosnIcms && CSOSN_ST.includes(item.csosnIcms)) ||
        Number(item.vST) > 0
      if (stMatch && !temTratamentoST) {
        await prisma.alert.create({
          data: {
            companyId,
            type: 'FISCAL_AUDIT',
            severity: 'INFO',
            title: `Possível ST não aplicada - NF-e ${nNF}`,
            message: `${itemLabel} (NCM ${item.ncm}, ${stMatch.descricao}) pode estar sujeito a Substituição Tributária (${stMatch.convenio}), mas não tem CST/CSOSN de ST nem valor de ICMS-ST destacado. Revisar se o convênio se aplica ao estado da operação.`,
            data: { nfeId, nItem: item.nItem, xProd: item.xProd, ncm: item.ncm, convenio: stMatch.convenio },
          },
        })
      }
    }
  }
}

export async function checkDuplicates(companyId?: string): Promise<void> {
  // Find NF-es with same chNFe that were somehow duplicated
  const duplicates = await prisma.$queryRaw<Array<{ chNFe: string; count: bigint }>>`
    SELECT "chNFe", COUNT(*) as count
    FROM nfes
    WHERE ${companyId ? `"companyId" = ${companyId}` : 'TRUE'}
    GROUP BY "chNFe"
    HAVING COUNT(*) > 1
  `

  for (const dup of duplicates) {
    await prisma.alert.create({
      data: {
        companyId,
        type: 'DUPLICATE_XML',
        severity: 'ERROR',
        title: `NF-e duplicada encontrada`,
        message: `chNFe ${dup.chNFe} aparece ${dup.count} vezes no sistema`,
        data: { chNFe: dup.chNFe, count: Number(dup.count) },
      },
    })
  }
}

export async function createImportErrorAlert(
  companyId: string,
  filename: string,
  error: string
): Promise<void> {
  await prisma.alert.create({
    data: {
      companyId,
      type: 'IMPORT_ERROR',
      severity: 'WARNING',
      title: `Erro ao importar XML`,
      message: `Arquivo ${filename}: ${error}`,
      data: { filename, error },
    },
  })
}
