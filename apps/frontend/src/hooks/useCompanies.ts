import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

export function useCompanies(search?: string) {
  return useQuery({
    queryKey: ['companies', search],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      const { data } = await api.get(`/companies?${params}`)
      return data.companies as Array<{
        id: string
        cnpj: string
        name: string
        fantasia: string | null
        regime: string | null
        active: boolean
        createdAt: string
        _count: { nfes: number }
      }>
    },
  })
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const { data } = await api.get(`/companies/${id}`)
      return data.company
    },
    enabled: !!id,
  })
}

export function useCompanyStats(id: string | undefined, competencia?: string) {
  return useQuery({
    queryKey: ['company-stats', id, competencia],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (competencia) params.set('competencia', competencia)
      const { data } = await api.get(`/companies/${id}/stats?${params}`)
      return data
    },
    enabled: !!id,
  })
}

export function useCreateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      cnpj: string
      name: string
      fantasia?: string
      regime?: string
    }) => {
      const { data } = await api.post('/companies', payload)
      return data.company
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
    },
  })
}

export function useUpdateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string
      name?: string
      fantasia?: string
      regime?: string
    }) => {
      const { data } = await api.put(`/companies/${id}`, payload)
      return data.company
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      queryClient.invalidateQueries({ queryKey: ['company', variables.id] })
    },
  })
}

export function useDeleteCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/companies/${id}`)
      return data as { success: boolean; deletedNfes: number }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
    },
  })
}
