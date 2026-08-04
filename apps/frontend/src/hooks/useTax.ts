import { useMutation, useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

export interface TaxInput {
  produto: string
  ncm: string
  origem: string
  destino: string
  regime: 'simples' | 'lucro_presumido' | 'lucro_real' | 'mei'
  tipoOperacao: 'venda' | 'transferencia' | 'devolucao' | 'remessa' | 'importacao' | 'exportacao'
  consumidorFinal: boolean
  importado: boolean
  cfopManual?: string
  valorUnitario?: number
}

export interface NcmSugestao {
  ncm: string
  descricao: string
}

export function useTaxConsulta() {
  return useMutation({
    mutationFn: (input: TaxInput) =>
      api.post('/tax/consulta', input).then(r => r.data),
  })
}

export function useNcmSearch(q: string) {
  return useQuery<NcmSugestao[]>({
    queryKey: ['ncm-search', q],
    queryFn: () =>
      api.get(`/tax/ncm/search?q=${encodeURIComponent(q)}`).then(r => r.data),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60 * 1000,   // 5 min — NCM não muda com frequência
    placeholderData: [],
  })
}
