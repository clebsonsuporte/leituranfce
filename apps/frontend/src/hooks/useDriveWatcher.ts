import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

export interface DriveWatcherStatus {
  running: boolean
  filesDetected: number
  filesProcessed: number
  errors: string[]
  config: {
    enabled: boolean
    rootFolderId: string
    companyId: string
    intervalMinutes: number
    lastActivity?: string
  }
}

export function useDriveWatcherStatus() {
  return useQuery<DriveWatcherStatus>({
    queryKey: ['drive-watcher-status'],
    queryFn: async () => {
      const res = await api.get('/drive-watcher/status')
      return res.data
    },
    refetchInterval: 5000,
  })
}

export function useStartDriveWatcher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: { rootFolderId: string; companyId?: string; intervalMinutes?: number }) => {
      const res = await api.post('/drive-watcher/start', data)
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-watcher-status'] })
    },
  })
}

export function useStopDriveWatcher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.post('/drive-watcher/stop')
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-watcher-status'] })
    },
  })
}

export function useSyncDriveNow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await api.post('/drive-watcher/sync-now')
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drive-watcher-status'] })
    },
  })
}
