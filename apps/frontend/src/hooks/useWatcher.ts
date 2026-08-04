import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

export interface WatcherStatus {
  running: boolean
  filesDetected: number
  filesProcessed: number
  errors: string[]
  config: {
    enabled: boolean
    folderPath: string
    companyId: string
    lastActivity?: string
  }
}

export function useWatcherStatus() {
  return useQuery<WatcherStatus>({
    queryKey: ['watcher-status'],
    queryFn: async () => {
      const res = await api.get('/watcher/status')
      return res.data
    },
    refetchInterval: 5000,
  })
}

export function useStartWatcher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { folderPath: string; companyId?: string }) => {
      const res = await api.post('/watcher/start', data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watcher-status'] })
    },
  })
}

export function useStopWatcher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.post('/watcher/stop')
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watcher-status'] })
    },
  })
}

export function useSegregacaoItems(companyId?: string, competencia?: string) {
  return useQuery({
    queryKey: ['segregacao', companyId, competencia],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (companyId && companyId !== 'all') params.set('companyId', companyId)
      if (competencia) params.set('competencia', competencia)
      const res = await api.get(`/nfe/segregacao/items?${params}`)
      return res.data
    },
    enabled: !!(companyId || competencia),
  })
}
