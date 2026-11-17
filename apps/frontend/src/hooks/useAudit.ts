import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

export type RegimePisCofins = 'normal' | 'st' | 'monofasico'

export interface PisCofinsDivergencia {
  tipo: string
  severidade: 'alta' | 'media'
  mensagem: string
}

export interface PisCofinsItem {
  regime: RegimePisCofins
  grupo: string | null
  base: string | null
  verificar: string | null
  divergencia: PisCofinsDivergencia | null
}

export interface CfopSegregacao {
  cfop: string
  descricao: string
  direcao: 'saida' | 'entrada'
  total: number
  normal: number
  st: number
  monofasico: number
  monofasicoDeclarado: number
  stDeclarado: number
  divergente: number
  itens: number
}

export interface PisCofinsProdutoDivergente extends PisCofinsDivergencia {
  xProd: string
  ncm: string | null
  cfop: string
  cstPis: string | null
  valor: number
  count: number
  regime: RegimePisCofins
  grupo: string | null
  base: string | null
  verificar: string | null
}

export interface PisCofinsCfopData {
  cfops: CfopSegregacao[]
  totais: { saida: CfopSegregacao; entrada: CfopSegregacao }
  resumo: {
    produtosDivergentes: number
    monofasicoNaoDeclarado: number
    stNaoDeclarada: number
    declaradoSemBase: number
  }
  divergencias: PisCofinsProdutoDivergente[]
  divergenciasTotal: number
}

interface ReformaGrupo {
  total: number
  adequadas: number
  pendentes: number
  dispensadas: number
  valorPendente: number
}

export interface ReformaPendentesData {
  resumo: Record<'geral' | 'proprias' | 'terceiros' | 'nfe' | 'nfce', ReformaGrupo>
  pendentes: Array<{
    id: string
    mod: number
    nNF: string
    serie: string
    dhEmi: string
    emitNome: string
    vNF: number
    propria: boolean
  }>
}

function filterParams(companyId?: string, competencia?: string) {
  const params = new URLSearchParams()
  if (companyId) params.set('companyId', companyId)
  if (competencia) params.set('competencia', competencia)
  return params
}

export function usePisCofinsCfop(companyId?: string, competencia?: string) {
  return useQuery({
    queryKey: ['pis-cofins-cfop', companyId, competencia],
    queryFn: async () => {
      const { data } = await api.get(`/tax/pis-cofins-cfop?${filterParams(companyId, competencia)}`)
      return data as PisCofinsCfopData
    },
  })
}

export function useReformaPendentes(companyId?: string, competencia?: string) {
  return useQuery({
    queryKey: ['reforma-pendentes', companyId, competencia],
    queryFn: async () => {
      const { data } = await api.get(`/tax/reforma/pendentes?${filterParams(companyId, competencia)}`)
      return data as ReformaPendentesData
    },
  })
}

export interface CfopValidationResult {
  status: 'correto' | 'incorreto' | 'incerto'
  cfopSugerido: string | null
  motivo: string | null
}

export interface AuditItem {
  xProd: string
  ncm: string | null
  cfop: string
  tpNF: number
  count: number
  vTotal: number
  ncmStatus: 'compativel' | 'incompativel' | 'incerto' | null
  ncmDesc: string | null
  ncmSugerido: string | null
  motivo: string | null
  cfopStatus: 'ok' | 'atencao' | 'erro'
  cfopMotivo: string
  risco: 'alto' | 'medio' | 'ok' | 'nao_validado'
  cstPis: string | null
  pisCofins: PisCofinsItem
}

export interface AuditSummary {
  total: number
  alto: number
  medio: number
  ok: number
  naoValidado: number
  ncmIncompativel: number
  ncmIncerto: number
  ncmCompativel: number
  cfopErro: number
  cfopAtencao: number
  pisCofinsMonofasico: number
  pisCofinsSt: number
  pisCofinsDivergente: number
}

export const cfopValidationKey = (i: Pick<AuditItem, 'xProd' | 'ncm' | 'cfop' | 'tpNF'>) =>
  `${i.xProd}||${i.ncm ?? ''}||${i.cfop}||${i.tpNF}`
