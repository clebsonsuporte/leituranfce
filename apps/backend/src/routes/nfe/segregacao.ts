import type { FastifyPluginAsync } from 'fastify'
import prisma from '../../lib/prisma.js'
import { derivarTribIcms, derivarTribPis } from '../../services/tax/tributacaoItem.js'

const segregacaoRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /nfe/segregacao/items?companyId=xxx&competencia=2026-02
  fastify.get('/items', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as {
      companyId?: string
      competencia?: string
      startDate?: string
      endDate?: string
    }

    const where: Record<string, unknown> = {}

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
    const classificadas = nfes.map(nfe => ({
      ...nfe,
      items: nfe.items.map(item => {
        const pis = derivarTribPis(item.ncm, item.cstPis, item.cstCofins)
        return {
          ...item,
          tribIcms: derivarTribIcms(item.cstIcms, item.csosnIcms),
          tribPis: pis.tribPis,
          tribAviso: pis.aviso,
        }
      }),
    }))

    return reply.send({ nfes: classificadas, total: classificadas.length })
  })
}

export default segregacaoRoutes
