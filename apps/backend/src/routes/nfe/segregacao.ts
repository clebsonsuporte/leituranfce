import type { FastifyPluginAsync } from 'fastify'
import prisma from '../../lib/prisma.js'
import { Prisma } from '@prisma/client'
import { atividadePgdas, derivarTribIcms, derivarTribPis } from '../../services/tax/tributacaoItem.js'

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

const segregacaoRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /nfe/segregacao/items?companyId=xxx&competencia=2026-02
  fastify.get('/items', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as {
      companyId?: string
      competencia?: string
      startDate?: string
      endDate?: string
    }

    // Receita do PGDAS-D: só notas de saída; a emissão própria é filtrada abaixo.
    const where: Record<string, unknown> = { tpNF: 1 }

    if (query.companyId && query.companyId !== 'all') {
      where.companyId = query.companyId
    }
    if (query.competencia) {
      where.competencia = query.competencia
    }
    if (query.startDate && query.endDate) {
      where.dhEmi = {
        gte: new Date(query.startDate),
        lte: new Date(query.endDate + 'T23:59:59'),
      }
    }

    const nfes = await prisma.nfe.findMany({
      where,
      select: {
        id: true,
        chNFe: true,
        nNF: true,
        serie: true,
        mod: true,
        dhEmi: true,
        competencia: true,
        tpNF: true,
        status: true,
        natOp: true,
        emitCnpj: true,
        emitNome: true,
        destCnpj: true,
        destCpf: true,
        destNome: true,
        vNF: true,
        vProd: true,
        vDesc: true,
        vICMS: true,
        vICMSST: true,
        vPIS: true,
        vCOFINS: true,
        vFrete: true,
        company: { select: { cnpj: true } },
        items: {
          select: {
            nItem: true,
            cProd: true,
            xProd: true,
            ncm: true,
            cfop: true,
            uCom: true,
            qCom: true,
            vProd: true,
            vDesc: true,
            cstIcms: true,
            csosnIcms: true,
            vBCIcms: true,
            pICMS: true,
            vICMS: true,
            vST: true,
            cstPis: true,
            vPIS: true,
            cstCofins: true,
            vCOFINS: true,
            vIPI: true,
            tribIcms: true,
            tribPis: true,
          },
        },
      },
      orderBy: { dhEmi: 'asc' },
    })

    // Classificação recalculada na leitura: notas importadas antes de uma mudança
    // de regra não precisam ser reimportadas.
    // Nota de venda do fornecedor para o cliente também é tpNF=1, mas é compra, não receita.
    const proprias = nfes.filter(nfe => soDigitos(nfe.emitCnpj) === soDigitos(nfe.company.cnpj))

    const classificadas = proprias.map(({ company: _company, ...nfe }) => ({
      ...nfe,
      items: nfe.items.map(item => {
        const pis = derivarTribPis(item.ncm, item.cstPis, item.cstCofins)
        return {
          ...item,
          tribIcms: derivarTribIcms(item.cstIcms, item.csosnIcms),
          tribPis: pis.tribPis,
          tribAviso: pis.aviso,
          atividade: atividadePgdas(item.cfop),
        }
      }),
    }))

    // Devoluções de venda não entram na soma; vão à parte para dedução da receita
    // (Res. CGSN 140/2018, art. 17): entrada emitida pela empresa ou nota de devolução do cliente.
    const filtros: Prisma.Sql[] = [Prisma.sql`n.status NOT IN ('CANCELADA', 'DENEGADA', 'INUTILIZADA')`]
    if (where.companyId) filtros.push(Prisma.sql`n."companyId" = ${where.companyId as string}`)
    if (query.competencia) filtros.push(Prisma.sql`n.competencia = ${query.competencia}`)
    if (query.startDate && query.endDate) {
      filtros.push(Prisma.sql`n."dhEmi" BETWEEN ${new Date(query.startDate)} AND ${new Date(query.endDate + 'T23:59:59')}`)
    }
    const [devolucoesVenda] = await prisma.$queryRaw<Array<{ valor: number; itens: number }>>`
      SELECT COALESCE(SUM(ni."vProd" - ni."vDesc")::float, 0) AS valor, COUNT(*)::int AS itens
      FROM nfe_items ni
      JOIN nfes n ON n.id = ni."nfeId"
      JOIN companies c ON c.id = n."companyId"
      WHERE ${Prisma.join(filtros, ' AND ')}
        AND (
          (n."tpNF" = 0
            AND regexp_replace(n."emitCnpj", '[^0-9]', '', 'g') = regexp_replace(c.cnpj, '[^0-9]', '', 'g')
            AND ni.cfop IN ('1201','1202','1203','1204','1410','1411','1660','1661','1662',
                            '2201','2202','2203','2204','2410','2411','2660','2661','2662'))
          OR
          (n."tpNF" = 1
            AND regexp_replace(n."emitCnpj", '[^0-9]', '', 'g') <> regexp_replace(c.cnpj, '[^0-9]', '', 'g')
            AND ni.cfop IN ('5201','5202','5410','5411','6201','6202','6410','6411'))
        )
    `

    return reply.send({ nfes: classificadas, total: classificadas.length, devolucoesVenda })
  })
}

export default segregacaoRoutes
