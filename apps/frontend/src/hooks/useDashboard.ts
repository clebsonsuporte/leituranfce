import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { useFilterStore } from '../stores/filterStore'

function useFilters() {
  const { selectedCompanyId, selectedCompetencia } = useFilterStore()
  return { companyId: selectedCompanyId, competencia: selectedCompetencia }
}

export function useDashboardSummary() {
  const filters = useFilters()
  return useQuery({
    queryKey: ['dashboard', 'summary', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.companyId) params.set('companyId', filters.companyId)
      if (filters.competencia) params.set('competencia', filters.competencia)
      const { data } = await api.get(`/dashboard/summary?${params}`)
      return data
    },
  })
}

export function useMonthlyTrend(months = 12) {
  const { selectedCompanyId } = useFilterStore()
  return useQuery({
    queryKey: ['dashboard', 'monthly-trend', selectedCompanyId, months],
    queryFn: async () => {
      const params = new URLSearchParams({ months: String(months) })
      if (selectedCompanyId) params.set('companyId', selectedCompanyId)
      const { data } = await api.get(`/dashboard/monthly-trend?${params}`)
      return data.data as Array<{
        competencia: string
        label: string
        entradas: number
        saidas: number
        countEntradas: number
        countSaidas: number
      }>
    },
  })
}

export function useCfopRanking(limit = 10) {
  const filters = useFilters()
  return useQuery({
    queryKey: ['dashboard', 'cfop-ranking', filters, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (filters.companyId) params.set('companyId', filters.companyId)
      if (filters.competencia) params.set('competencia', filters.competencia)
      const { data } = await api.get(`/dashboard/cfop-ranking?${params}`)
      return data.data as Array<{
        cfop: string
        vProd: number
        vICMS: number
        vPIS: number
        vCOFINS: number
        count: number
      }>
    },
  })
}

export function useProductsRanking(limit = 10) {
  const filters = useFilters()
  return useQuery({
    queryKey: ['dashboard', 'products-ranking', filters, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (filters.companyId) params.set('companyId', filters.companyId)
      if (filters.competencia) params.set('competencia', filters.competencia)
      const { data } = await api.get(`/dashboard/products-ranking?${params}`)
      return data.data as Array<{
        xProd: string
        vProd: number
        qCom: number
        vICMS: number
        count: number
      }>
    },
  })
}

export function useTaxBreakdown() {
  const filters = useFilters()
  return useQuery({
    queryKey: ['dashboard', 'tax-breakdown', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.companyId) params.set('companyId', filters.companyId)
      if (filters.competencia) params.set('competencia', filters.competencia)
      const { data } = await api.get(`/dashboard/tax-breakdown?${params}`)
      return data as {
        data: Array<{ name: string; value: number; pct: number; color: string }>
        total: number
      }
    },
  })
}

export interface MissingNotesGroup {
  companyId: string
  companyName: string
  mod: number
  serie: string
  gaps: number[]
  count: number
}

export function useMissingNotes() {
  const filters = useFilters()
  return useQuery({
    queryKey: ['dashboard', 'missing-notes', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.companyId) params.set('companyId', filters.companyId)
      if (filters.competencia) params.set('competencia', filters.competencia)
      const { data } = await api.get(`/dashboard/missing-notes?${params}`)
      return data as { total: number; groups: MissingNotesGroup[] }
    },
  })
}

export function useTopClients(limit = 5) {
  const filters = useFilters()
  return useQuery({
    queryKey: ['dashboard', 'top-clients', filters, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) })
      if (filters.companyId) params.set('companyId', filters.companyId)
      if (filters.competencia) params.set('competencia', filters.competencia)
      const { data } = await api.get(`/dashboard/top-clients?${params}`)
      return data.data as Array<{
        destCnpj: string | null
        destNome: string
        vNF: number
        count: number
      }>
    },
  })
}
