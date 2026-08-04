import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useFilterStore } from '../stores/filterStore'

export function useAlerts(options?: {
  read?: boolean
  type?: string
  severity?: string
  page?: number
}) {
  const { selectedCompanyId } = useFilterStore()
  return useQuery({
    queryKey: ['alerts', selectedCompanyId, options],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedCompanyId) params.set('companyId', selectedCompanyId)
      if (options?.read !== undefined) params.set('read', String(options.read))
      if (options?.type) params.set('type', options.type)
      if (options?.severity) params.set('severity', options.severity)
      if (options?.page) params.set('page', String(options.page))
      const { data } = await api.get(`/alerts?${params}`)
      return data
    },
  })
}

export function useUnreadAlertCount() {
  const { selectedCompanyId } = useFilterStore()
  return useQuery({
    queryKey: ['alerts-count', selectedCompanyId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (selectedCompanyId) params.set('companyId', selectedCompanyId)
      const { data } = await api.get(`/alerts/count?${params}`)
      return data.count as number
    },
    refetchInterval: 60 * 1000, // refresh every minute
  })
}

export function useMarkAlertRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/alerts/${id}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['alerts-count'] })
    },
  })
}

export function useMarkAllAlertsRead() {
  const queryClient = useQueryClient()
  const { selectedCompanyId } = useFilterStore()
  return useMutation({
    mutationFn: async () => {
      await api.put('/alerts/read-all', { companyId: selectedCompanyId })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
      queryClient.invalidateQueries({ queryKey: ['alerts-count'] })
    },
  })
}
