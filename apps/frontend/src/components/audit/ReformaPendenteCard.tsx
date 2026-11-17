import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, Landmark } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { ReformaPendentesData } from '@/hooks/useAudit'

export default function ReformaPendenteCard({ data, isLoading }: { data?: ReformaPendentesData; isLoading: boolean }) {
  const [aberto, setAberto] = useState(false)

  if (isLoading) return <Skeleton className="h-28 w-full rounded-xl" />
  if (!data) return null

  const { geral, proprias, terceiros, nfe, nfce } = data.resumo
  const semNotas = geral.total === 0
  const tudoOk = !semNotas && geral.pendentes === 0
  const simples = (data.regime ?? '').toLowerCase().includes('simples')
  const tom = semNotas
    ? 'border-gray-200 bg-white'
    : tudoOk ? 'border-green-200 bg-green-50/50' : 'border-amber-300 bg-amber-50/60'

  return (
    <Card className={tom}>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${tudoOk ? 'bg-green-100' : 'bg-amber-100'}`}>
            {tudoOk
              ? <CheckCircle2 className="h-5 w-5 text-green-600" />
              : <Landmark className="h-5 w-5 text-amber-700" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Reforma Tributária — notas sem IBS/CBS</p>
            {semNotas ? (
              <p className="text-sm text-gray-500 mt-0.5">
                Nenhuma nota de 2026 em diante no período selecionado — nada a verificar.
              </p>
            ) : tudoOk ? (
              <p className="text-sm text-green-800 mt-0.5">
                Todas as {geral.total} nota(s) do período já trazem os grupos IBS/CBS e o cClassTrib.
              </p>
            ) : (
              <>
                <p className="mt-0.5">
                  <span className="text-2xl font-bold text-amber-800">{geral.pendentes}</span>
                  <span className="text-sm text-gray-600"> de {geral.total} nota(s) pendentes</span>
                  <span className="text-sm text-gray-500"> · {formatCurrency(geral.valorPendente)}</span>
                </p>
                <p className="text-xs text-gray-600 mt-1">
                  XML sem os grupos <code>IBSCBS</code>, <code>IBSCBSTot</code> ou <code>cClassTrib</code> (NT
                  2025.002-RTC).
                </p>
              </>
            )}
          </div>
        </div>

        {!semNotas && !tudoOk && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Quadro titulo="Emitidas pela empresa" pend={proprias.pendentes} total={proprias.total} destaque />
              <Quadro titulo="Recebidas de fornecedores" pend={terceiros.pendentes} total={terceiros.total} />
              <Quadro titulo="NF-e (modelo 55)" pend={nfe.pendentes} total={nfe.total} />
              <Quadro titulo="NFC-e (modelo 65)" pend={nfce.pendentes} total={nfce.total} />
            </div>

            <p className="text-xs text-gray-600">
              {proprias.pendentes > 0
                ? 'As notas emitidas pela própria empresa dependem de atualizar o sistema emissor (ERP/PDV). '
                : 'As pendências são de notas recebidas — o ajuste é no emissor do fornecedor. '}
              {simples && 'Empresa no Simples Nacional: confirme com o contador a data em que o destaque passa a ser exigido para o regime.'}
            </p>

            <button
              onClick={() => setAberto(a => !a)}
              className="flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
            >
              {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Ver notas pendentes
            </button>
            {aberto && (
              <div className="overflow-x-auto border border-amber-200 rounded-lg bg-white">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-2 text-left font-semibold">Nota</th>
                      <th className="px-3 py-2 text-left font-semibold">Modelo</th>
                      <th className="px-3 py-2 text-left font-semibold">Emissão</th>
                      <th className="px-3 py-2 text-left font-semibold">Emitente</th>
                      <th className="px-3 py-2 text-right font-semibold">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.pendentes.map(n => (
                      <tr key={n.id} className="border-t border-gray-100">
                        <td className="px-3 py-1.5 font-mono">{n.nNF}/{n.serie}</td>
                        <td className="px-3 py-1.5">{n.mod === 65 ? 'NFC-e' : 'NF-e'}</td>
                        <td className="px-3 py-1.5">{formatDate(n.dhEmi)}</td>
                        <td className="px-3 py-1.5 max-w-[260px] truncate">
                          {n.emitNome}
                          {n.propria && <span className="ml-1.5 text-amber-700">(própria)</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(n.vNF)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {geral.pendentes > data.pendentes.length && (
                  <p className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
                    Mostrando as {data.pendentes.length} mais recentes, de {geral.pendentes}.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Quadro({ titulo, pend, total, destaque = false }: { titulo: string; pend: number; total: number; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 bg-white ${destaque && pend > 0 ? 'border-amber-300' : 'border-gray-200'}`}>
      <p className="text-gray-500">{titulo}</p>
      <p className="mt-0.5">
        <span className={`text-base font-semibold ${pend > 0 ? 'text-amber-800' : 'text-green-700'}`}>{pend}</span>
        <span className="text-gray-400"> / {total}</span>
      </p>
    </div>
  )
}
