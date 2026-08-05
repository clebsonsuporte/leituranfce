import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

interface NfeFilters {
  companyId?: string
  competencia?: string
  status?: string
  mod?: number
  tpNF?: number
  search?: string
  page?: number
  limit?: number
}

export function useNfes(filters: NfeFilters = {}) {
  return useQuery({
    queryKey: ['nfes', filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters.companyId) params.set('companyId', filters.companyId)
      if (filters.competencia) params.set('competencia', filters.competencia)
      if (filters.status) params.set('status', filters.status)
      if (filters.mod !== undefined) params.set('mod', String(filters.mod))
      if (filters.tpNF !== undefined) params.set('tpNF', String(filters.tpNF))
      if (filters.search) params.set('search', filters.search)
      if (filters.page) params.set('page', String(filters.page))
      if (filters.limit) params.set('limit', String(filters.limit))
      const { data } = await api.get(`/nfe?${params}`)
      return data
    },
  })
}

export function useNfe(id: string | undefined) {
  return useQuery({
    queryKey: ['nfe', id],
    queryFn: async () => {
      const { data } = await api.get(`/nfe/${id}`)
      return data.nfe
    },
    enabled: !!id,
  })
}

export function useNfeFiscalAnalysis(id: string | undefined) {
  return useQuery({
    queryKey: ['nfe-fiscal-analysis', id],
    queryFn: async () => {
      const { data } = await api.get(`/nfe/${id}/fiscal-analysis`)
      return data
    },
    enabled: !!id,
  })
}

export function useDeleteNfe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/nfe/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nfes'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const { data } = await api.post('/nfe/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nfes'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['import-logs'] })
    },
  })
}

export function useImportStatus(logId: string | undefined) {
  return useQuery({
    queryKey: ['import-log', logId],
    queryFn: async () => {
      const { data } = await api.get(`/nfe/import/${logId}`)
      return data.log
    },
    enabled: !!logId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'PROCESSING') return 1500
      return false
    },
  })
}

export function useImportLogs(companyId?: string, page = 1) {
  return useQuery({
    queryKey: ['import-logs', companyId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) })
      if (companyId) params.set('companyId', companyId)
      const { data } = await api.get(`/nfe/import/list?${params}`)
      return data
    },
  })
}
