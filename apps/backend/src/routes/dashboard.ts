import type { FastifyPluginAsync } from 'fastify'
import prisma from '../lib/prisma.js'
import { subMonths, format, startOfMonth, endOfMonth } from 'date-fns'

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /dashboard/summary
  fastify.get('/summary', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { companyId?: string; competencia?: string }

    const where: Record<string, unknown> = {}
    if (query.companyId) where.companyId = query.companyId
    if (query.competencia) where.competencia = query.competencia

    const [
      totalNfes,
      entradas,
      saidas,
      canceladas,
      nfce,
      totals,
      previousTotals,
    ] = await Promise.all([
      prisma.nfe.count({ where }),
      prisma.nfe.count({ where: { ...where, tpNF: 0, status: { notIn: ['CANCELADA', 'SEM_PROTOCOLO'] } } }),
      prisma.nfe.count({ where: { ...where, tpNF: 1, status: { notIn: ['CANCELADA', 'SEM_PROTOCOLO'] } } }),
      prisma.nfe.count({ where: { ...where, status: 'CANCELADA' } }),
      prisma.nfe.count({ where: { ...where, mod: 65 } }),
      prisma.nfe.aggregate({
        where: { ...where, status: { notIn: ['CANCELADA', 'SEM_PROTOCOLO'] } },
        _sum: {
          vNF: true,
          vProd: true,
          vICMS: true,
          vICMSST: true,
          vIPI: true,
          vPIS: true,
          vCOFINS: true,
          vFrete: true,
        },
      }),
      // Previous period totals for trend comparison
      query.competencia
        ? (() => {
            const [year, month] = query.competencia.split('-').map(Number)
            const prevDate = subMonths(new Date(year, month - 1, 1), 1)
            const prevComp = format(prevDate, 'yyyy-MM')
            return prisma.nfe.aggregate({
              where: {
                ...(query.companyId ? { companyId: query.companyId } : {}),
                competencia: prevComp,
                status: { notIn: ['CANCELADA', 'SEM_PROTOCOLO'] },
              },
              _sum: { vNF: true },
            })
          })()
        : Promise.resolve({ _sum: { vNF: null } }),
    ])

    const vNF = Number(totals._sum.vNF || 0)
    const prevVNF = Number(previousTotals._sum.vNF || 0)
    const trend = prevVNF > 0 ? ((vNF - prevVNF) / prevVNF) * 100 : null

    return reply.send({
      totalNfes,
      entradas,
      saidas,
      canceladas,
      nfce,
      vNF,
      vProd: Number(totals._sum.vProd || 0),
      vICMS: Number(totals._sum.vICMS || 0),
      vICMSST: Number(totals._sum.vICMSST || 0),
      vIPI: Number(totals._sum.vIPI || 0),
      vPIS: Number(totals._sum.vPIS || 0),
      vCOFINS: Number(totals._sum.vCOFINS || 0),
      vFrete: Number(totals._sum.vFrete || 0),
      totalImpostos:
        Number(totals._sum.vICMS || 0) +
        Number(totals._sum.vICMSST || 0) +
        Number(totals._sum.vIPI || 0) +
        Number(totals._sum.vPIS || 0) +
        Number(totals._sum.vCOFINS || 0),
      trend,
    })
  })

  // GET /dashboard/monthly-trend
  fastify.get('/monthly-trend', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { companyId?: string; months?: string }
    const numMonths = parseInt(query.months || '12', 10)

    const baseWhere: Record<string, unknown> = {}
    if (query.companyId) baseWhere.companyId = query.companyId

    const monthlyData = []

    for (let i = numMonths - 1; i >= 0; i--) {
      const date = subMonths(new Date(), i)
      const competencia = format(date, 'yyyy-MM')
      const label = format(date, 'MMM/yy')

      const [entrada, saida] = await Promise.all([
        prisma.nfe.aggregate({
          where: { ...baseWhere, competencia, tpNF: 0, status: { notIn: ['CANCELADA', 'SEM_PROTOCOLO'] } },
          _sum: { vNF: true },
          _count: true,
        }),
        prisma.nfe.aggregate({
          where: { ...baseWhere, competencia, tpNF: 1, status: { notIn: ['CANCELADA', 'SEM_PROTOCOLO'] } },
          _sum: { vNF: true },
          _count: true,
        }),
      ])

      monthlyData.push({
        competencia,
        label,
        entradas: Number(entrada._sum.vNF || 0),
        saidas: Number(saida._sum.vNF || 0),
        countEntradas: entrada._count,
        countSaidas: saida._count,
      })
    }

    return reply.send({ data: monthlyData })
  })

  // GET /dashboard/cfop-ranking
  fastify.get('/cfop-ranking', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { companyId?: string; competencia?: string; limit?: string }
    const limit = parseInt(query.limit || '10', 10)

    const whereNfe: Record<string, unknown> = {}
    if (query.companyId) whereNfe.companyId = query.companyId
    if (query.competencia) whereNfe.competencia = query.competencia

    const cfopData = await prisma.nfeItem.groupBy({
      by: ['cfop'],
      where: {
        nfe: whereNfe,
      },
      _sum: { vProd: true, vICMS: true, vPIS: true, vCOFINS: true },
      _count: true,
      orderBy: { _sum: { vProd: 'desc' } },
      take: limit,
    })

    return reply.send({
      data: cfopData.map((item) => ({
        cfop: item.cfop,
        vProd: Number(item._sum.vProd || 0),
        vICMS: Number(item._sum.vICMS || 0),
        vPIS: Number(item._sum.vPIS || 0),
        vCOFINS: Number(item._sum.vCOFINS || 0),
        count: item._count,
      })),
    })
  })

  // GET /dashboard/products-ranking
  fastify.get(
    '/products-ranking',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const query = request.query as { companyId?: string; competencia?: string; limit?: string }
      const limit = parseInt(query.limit || '10', 10)

      const whereNfe: Record<string, unknown> = {}
      if (query.companyId) whereNfe.companyId = query.companyId
      if (query.competencia) whereNfe.competencia = query.competencia

      const products = await prisma.nfeItem.groupBy({
        by: ['xProd'],
        where: { nfe: whereNfe },
        _sum: { vProd: true, qCom: true, vICMS: true, vPIS: true, vCOFINS: true },
        _count: true,
        orderBy: { _sum: { vProd: 'desc' } },
        take: limit,
      })

      return reply.send({
        data: products.map((p) => ({
          xProd: p.xProd,
          vProd: Number(p._sum.vProd || 0),
          qCom: Number(p._sum.qCom || 0),
          vICMS: Number(p._sum.vICMS || 0),
          vPIS: Number(p._sum.vPIS || 0),
          vCOFINS: Number(p._sum.vCOFINS || 0),
          count: p._count,
        })),
      })
    }
  )

  // GET /dashboard/tax-breakdown
  fastify.get('/tax-breakdown', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { companyId?: string; competencia?: string }

    const where: Record<string, unknown> = { status: { notIn: ['CANCELADA', 'SEM_PROTOCOLO'] } }
    if (query.companyId) where.companyId = query.companyId
    if (query.competencia) where.competencia = query.competencia

    const totals = await prisma.nfe.aggregate({
      where,
      _sum: {
        vICMS: true,
        vICMSST: true,
        vIPI: true,
        vPIS: true,
        vCOFINS: true,
      },
    })

    const vICMS = Number(totals._sum.vICMS || 0)
    const vICMSST = Number(totals._sum.vICMSST || 0)
    const vIPI = Number(totals._sum.vIPI || 0)
    const vPIS = Number(totals._sum.vPIS || 0)
    const vCOFINS = Number(totals._sum.vCOFINS || 0)
    const total = vICMS + vICMSST + vIPI + vPIS + vCOFINS

    return reply.send({
      data: [
        {
          name: 'ICMS',
          value: vICMS,
          pct: total > 0 ? (vICMS / total) * 100 : 0,
          color: '#1e40af',
        },
        {
          name: 'ICMS-ST',
          value: vICMSST,
          pct: total > 0 ? (vICMSST / total) * 100 : 0,
          color: '#3b82f6',
        },
        {
          name: 'IPI',
          value: vIPI,
          pct: total > 0 ? (vIPI / total) * 100 : 0,
          color: '#0ea5e9',
        },
        {
          name: 'PIS',
          value: vPIS,
          pct: total > 0 ? (vPIS / total) * 100 : 0,
          color: '#6366f1',
        },
        {
          name: 'COFINS',
          value: vCOFINS,
          pct: total > 0 ? (vCOFINS / total) * 100 : 0,
          color: '#8b5cf6',
        },
      ],
      total,
    })
  })

  // GET /dashboard/missing-notes
  fastify.get('/missing-notes', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { companyId?: string; competencia?: string }

    // Cancelada/Denegada/Inutilizada não são "lacuna" — o número foi usado e
    // tem um registro explicando o que aconteceu com ele. Só SEM_PROTOCOLO
    // (sem confirmação nenhuma da SEFAZ) conta como número sem explicação.
    const where: Record<string, unknown> = { status: { not: 'SEM_PROTOCOLO' } }
    if (query.companyId) where.companyId = query.companyId
    if (query.competencia) where.competencia = query.competencia

    const nfes = await prisma.nfe.findMany({
      where,
      select: { nNF: true, serie: true, mod: true, companyId: true, company: { select: { name: true } } },
      orderBy: { nNF: 'asc' },
    })

    // Group by companyId + mod + serie
    const groups = new Map<string, { companyId: string; companyName: string; mod: number; serie: string; nums: number[] }>()
    for (const nfe of nfes) {
      const key = `${nfe.companyId}|${nfe.mod}|${nfe.serie}`
      if (!groups.has(key)) {
        groups.set(key, {
          companyId: nfe.companyId,
          companyName: nfe.company?.name ?? nfe.companyId,
          mod: nfe.mod,
          serie: nfe.serie ?? '',
          nums: [],
        })
      }
      const n = parseInt(nfe.nNF, 10)
      if (!isNaN(n)) groups.get(key)!.nums.push(n)
    }

    const result: Array<{ companyId: string; companyName: string; mod: number; serie: string; gaps: number[]; count: number }> = []

    for (const g of groups.values()) {
      g.nums.sort((a, b) => a - b)
      const gaps: number[] = []
      for (let i = 1; i < g.nums.length; i++) {
        if (g.nums[i] - g.nums[i - 1] > 1) {
          for (let x = g.nums[i - 1] + 1; x < g.nums[i]; x++) {
            gaps.push(x)
          }
        }
      }
      if (gaps.length > 0) {
        result.push({ companyId: g.companyId, companyName: g.companyName, mod: g.mod, serie: g.serie, gaps, count: gaps.length })
      }
    }

    const total = result.reduce((acc, r) => acc + r.count, 0)
    return reply.send({ total, groups: result })
  })

  // GET /dashboard/sem-protocolo — notas importadas sem <protNFe> da SEFAZ
  // (achado real: nota 21274, BR AUTOPEÇAS — o XML era só o <NFe> assinado
  // pelo emitente, sem confirmação de autorização). Agrupado por empresa
  // pra facilitar achar o arquivo correto (nfeProc/procNFe) de cada uma.
  fastify.get('/sem-protocolo', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { companyId?: string; competencia?: string }

    const where: Record<string, unknown> = { status: 'SEM_PROTOCOLO' }
    if (query.companyId) where.companyId = query.companyId
    if (query.competencia) where.competencia = query.competencia

    const nfes = await prisma.nfe.findMany({
      where,
      select: {
        id: true, nNF: true, serie: true, mod: true, chNFe: true, dhEmi: true,
        companyId: true, company: { select: { name: true } },
      },
      orderBy: { dhEmi: 'desc' },
    })

    const groups = new Map<
      string,
      { companyId: string; companyName: string; notes: Array<{ id: string; nNF: string; serie: string; mod: number; chNFe: string; dhEmi: Date }> }
    >()
    for (const nfe of nfes) {
      const key = nfe.companyId
      if (!groups.has(key)) {
        groups.set(key, { companyId: nfe.companyId, companyName: nfe.company?.name ?? nfe.companyId, notes: [] })
      }
      groups.get(key)!.notes.push({ id: nfe.id, nNF: nfe.nNF, serie: nfe.serie, mod: nfe.mod, chNFe: nfe.chNFe, dhEmi: nfe.dhEmi })
    }

    return reply.send({ total: nfes.length, groups: [...groups.values()] })
  })

  // GET /dashboard/top-clients
  fastify.get('/top-clients', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = request.query as { companyId?: string; competencia?: string; limit?: string }
    const limit = parseInt(query.limit || '10', 10)

    const where: Record<string, unknown> = { tpNF: 1, status: { notIn: ['CANCELADA', 'SEM_PROTOCOLO'] } }
    if (query.companyId) where.companyId = query.companyId
    if (query.competencia) where.competencia = query.competencia

    const clients = await prisma.nfe.groupBy({
      by: ['destCnpj', 'destNome'],
      where,
      _sum: { vNF: true },
      _count: true,
      orderBy: { _sum: { vNF: 'desc' } },
      take: limit,
    })

    return reply.send({
      data: clients.map((c) => ({
        destCnpj: c.destCnpj,
        destNome: c.destNome || 'Consumidor Final',
        vNF: Number(c._sum.vNF || 0),
        count: c._count,
      })),
    })
  })
}

export default dashboardRoutes
