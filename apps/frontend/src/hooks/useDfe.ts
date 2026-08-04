import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

export interface CertificateMetadata {
  cnpj: string
  cUFAutor: number
  validFrom: string
  validUntil: string
  expired: boolean
  active: boolean
  lastNsu: string
  lastSyncAt: string | null
  updatedAt: string
}

export interface DfeSyncConfig {
  enabled: boolean
  intervalMinutes: number
}

export interface DfeSyncLog {
  id: string
  companyId: string
  startNsu: string
  endNsu: string | null
  docsFound: number
  docsSummary: number
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED'
  message: string | null
  importLogId: string | null
  createdAt: string
  updatedAt: string
  company?: { id: string; name: string; cnpj: string }
  importLog?: {
    id: string
    status: string
    totalFiles: number
    success: number
    duplicates: number
    errors: number
    processed?: number
  } | null
}

// ─── Certificado digital ─────────────────────────────────────────────────────

export function useCompanyCertificate(companyId: string | undefined) {
  return useQuery({
    queryKey: ['company-certificate', companyId],
    queryFn: async () => {
      const { data } = await api.get(`/companies/${companyId}/certificate`)
      return data.certificate as CertificateMetadata | null
    },
    enabled: !!companyId,
  })
}

export function useUploadCertificate(companyId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const { data } = await api.post(`/companies/${companyId}/certificate`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data.certificate as CertificateMetadata
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-certificate', companyId] })
    },
  })
}

export function useDeleteCertificate(companyId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.delete(`/companies/${companyId}/certificate`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-certificate', companyId] })
      queryClient.invalidateQueries({ queryKey: ['dfe-sync-config', companyId] })
    },
  })
}

// ─── Configuração de sincronização automática ───────────────────────────────

export function useDfeSyncConfig(companyId: string | undefined) {
  return useQuery({
    queryKey: ['dfe-sync-config', companyId],
    queryFn: async () => {
      const { data } = await api.get(`/nfe/dfe/config/${companyId}`)
      return data.config as DfeSyncConfig
    },
    enabled: !!companyId,
  })
}

export function useUpdateDfeSyncConfig(companyId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { enabled: boolean; intervalMinutes?: number }) => {
      const { data } = await api.patch(`/nfe/dfe/config/${companyId}`, payload)
      return data.config as DfeSyncConfig
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dfe-sync-config', companyId] })
    },
  })
}

// ─── Ciclos de sincronização (Distribuição DFe) ──────────────────────────────

export function useTriggerDfeSync(companyId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/nfe/dfe/sync/${companyId}`)
      return data as { logId: string; message: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dfe-sync-history', companyId] })
    },
  })
}

export function useDfeSyncStatus(logId: string | undefined) {
  return useQuery({
    queryKey: ['dfe-sync-log', logId],
    queryFn: async () => {
      const { data } = await api.get(`/nfe/dfe/sync/${logId}`)
      return data.log as DfeSyncLog
    },
    enabled: !!logId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === 'PROCESSING') return 2000
      return false
    },
  })
}

export function useDfeSyncHistory(companyId: string | undefined, page = 1) {
  return useQuery({
    queryKey: ['dfe-sync-history', companyId, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page) })
      if (companyId) params.set('companyId', companyId)
      const { data } = await api.get(`/nfe/dfe/sync?${params}`)
      return data as { logs: DfeSyncLog[]; total: number; page: number; limit: number }
    },
    enabled: !!companyId,
  })
}
