import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, XCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import type { CfopSegregacao, PisCofinsCfopData } from '@/hooks/useAudit'

function Valor({ v, className = '' }: { v: number; className?: string }) {
  return (
    <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${v === 0 ? 'text-gray-300' : className}`}>
      {formatCurrency(v)}
    </td>
  )
}

function Linha({ l, destaque = false }: { l: CfopSegregacao; destaque?: boolean }) {
  const naoDeclarado = l.direcao === 'saida' ? Math.max(0, l.monofasico - l.monofasicoDeclarado) : 0
  return (
    <tr className={destaque ? 'bg-gray-50 font-semibold border-t border-gray-300' : 'border-t border-gray-100'}>
      <td className="px-3 py-2">
        {destaque ? l.descricao : (
          <>
            <span className="font-mono font-semibold">{l.cfop}</span>
            <span className="text-gray-500 ml-2">{l.descricao}</span>
          </>
        )}
      </td>
      <Valor v={l.total} className="text-gray-900" />
      <Valor v={l.normal} className="text-gray-700" />
      <Valor v={l.st} className="text-purple-700" />
      <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${l.monofasico === 0 ? 'text-gray-300' : 'text-teal-700'}`}>
        {formatCurrency(l.monofasico)}
        {naoDeclarado > 0.005 && (
          <span
            className="block text-[11px] font-normal text-amber-700"
            title="Valor de produtos monofásicos por NCM cuja nota não saiu com CST 04"
          >
            {formatCurrency(naoDeclarado)} sem CST 04
          </span>
        )}
      </td>
    </tr>
  )
}

export default function PisCofinsCfopCard({ data, isLoading }: { data?: PisCofinsCfopData; isLoading: boolean }) {
  const [aberto, setAberto] = useState(false)
  const saidas = data?.cfops.filter(c => c.direcao === 'saida') ?? []
  const entradas = data?.cfops.filter(c => c.direcao === 'entrada') ?? []

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-700 normal-case tracking-normal">
          PIS/COFINS por CFOP — Normal, Substituição Tributária e Monofásico
        </CardTitle>
        <p className="text-xs text-gray-500 leading-relaxed">
          Cada CFOP é dividido pelo regime que a <strong>lei define para o NCM</strong> do produto, não pelo que veio
          marcado na nota. <strong>Normal</strong> paga PIS e COFINS integralmente; <strong>Subst. Tributária</strong> e{' '}
          <strong>Monofásico</strong> já foram tributados na indústria ou no importador e devem ser segregados na
          apuração.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.cfops.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Nenhuma nota no período selecionado.</p>
        ) : (
          <>
            {data.resumo.produtosDivergentes > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                <p className="font-medium flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {data.resumo.produtosDivergentes} produto(s) com PIS/COFINS da nota diferente do que a lei define
                </p>
                <ul className="mt-1 ml-5 list-disc text-xs space-y-0.5">
                  {data.resumo.monofasicoNaoDeclarado > 0 && (
                    <li>
                      <strong>{formatCurrency(data.resumo.monofasicoNaoDeclarado)}</strong> em produtos monofásicos
                      vendidos sem CST 04 — receita que pode estar pagando PIS/COFINS de novo.
                    </li>
                  )}
                  {data.resumo.stNaoDeclarada > 0 && (
                    <li>
                      <strong>{formatCurrency(data.resumo.stNaoDeclarada)}</strong> em produtos com substituição
                      tributária vendidos sem CST 05.
                    </li>
                  )}
                  {data.resumo.declaradoSemBase > 0 && (
                    <li>
                      <strong>{formatCurrency(data.resumo.declaradoSemBase)}</strong> marcados como monofásico/ST na
                      nota sem o NCM constar nas listas da lei — conferir, pode haver recolhimento a menor.
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-3 py-2 text-left font-semibold">CFOP</th>
                    <th className="px-3 py-2 text-right font-semibold">Total</th>
                    <th className="px-3 py-2 text-right font-semibold">Normal</th>
                    <th className="px-3 py-2 text-right font-semibold">Subst. Tributária</th>
                    <th className="px-3 py-2 text-right font-semibold">Monofásico</th>
                  </tr>
                </thead>
                <tbody>
                  {saidas.map(l => <Linha key={l.cfop} l={l} />)}
                  {saidas.length > 0 && <Linha l={data.totais.saida} destaque />}
                  {entradas.map(l => <Linha key={l.cfop} l={l} />)}
                  {entradas.length > 0 && <Linha l={data.totais.entrada} destaque />}
                </tbody>
              </table>
            </div>

            {data.divergencias.length > 0 && (
              <div>
                <button
                  onClick={() => setAberto(a => !a)}
                  className="flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
                >
                  {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Ver os {data.divergenciasTotal} produto(s) divergentes
                </button>
                {aberto && (
                  <div className="mt-2 overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 uppercase tracking-wide">
                          <th className="px-3 py-2 text-left font-semibold">Produto</th>
                          <th className="px-3 py-2 text-left font-semibold">NCM</th>
                          <th className="px-3 py-2 text-left font-semibold">CFOP</th>
                          <th className="px-3 py-2 text-left font-semibold">CST nota</th>
                          <th className="px-3 py-2 text-left font-semibold">Análise</th>
                          <th className="px-3 py-2 text-right font-semibold">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.divergencias.map((d, i) => (
                          <tr key={i} className="border-t border-gray-100 align-top">
                            <td className="px-3 py-2 font-medium max-w-[220px]">{d.xProd}</td>
                            <td className="px-3 py-2 font-mono">{d.ncm ?? '—'}</td>
                            <td className="px-3 py-2 font-mono">{d.cfop}</td>
                            <td className="px-3 py-2 font-mono">{d.cstPis ?? '—'}</td>
                            <td className="px-3 py-2 max-w-[420px]">
                              <p className="flex gap-1.5">
                                {d.severidade === 'alta'
                                  ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                                  : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />}
                                <span>{d.mensagem}</span>
                              </p>
                              {d.base && <p className="text-gray-400 mt-0.5 ml-5">Base legal: {d.base}</p>}
                              {d.verificar && <p className="text-amber-700 mt-0.5 ml-5">{d.verificar}</p>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{formatCurrency(d.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {data.divergenciasTotal > data.divergencias.length && (
                      <p className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">
                        Mostrando os {data.divergencias.length} maiores por valor, de {data.divergenciasTotal}.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <p className="text-[11px] text-gray-400">
              Classificação automática pelo NCM (Leis 9.718/1998, 10.147/2000, 10.485/2002 e 13.097/2015). Alguns NCM
              dependem do "Ex" da TIPI, que não vem no XML — confirme os itens sinalizados antes de retificar.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
