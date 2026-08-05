import { useState } from 'react'
import { Search, ArrowUpDown, Package, ChevronLeft, ChevronRight } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import KpiCard from '@/components/dashboard/KpiCard'
import api from '@/lib/api'
import { useFilterStore } from '@/stores/filterStore'
import { formatCurrency, formatNumber } from '@/lib/utils'

export default function ProductsPage() {
  const { selectedCompanyId, selectedCompetencia } = useFilterStore()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('vProd')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const params = new URLSearchParams({ page: String(page), limit: '50', sortBy, sortDir })
  if (selectedCompanyId) params.set('companyId', selectedCompanyId)
  if (selectedCompetencia) params.set('competencia', selectedCompetencia)
  if (search) params.set('search', search)

  const { data, isLoading } = useQuery({
    queryKey: ['products', selectedCompanyId, selectedCompetencia, search, page, sortBy, sortDir],
    queryFn: async () => {
      const { data } = await api.get(`/products?${params}`)
      return data
    },
  })

  const products = data?.products || []
  const total = data?.total || 0
  const totalPages = data?.totalPages || 1

  // Top 10 for bar chart
  const top10 = products.slice(0, 10)

  function handleSort(col: string) {
    if (sortBy === col) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
    setPage(1)
  }

  const totalVProd = products.reduce((a: number, p: { vProd: number }) => a + p.vProd, 0)
  const totalQCom = products.reduce((a: number, p: { qCom: number }) => a + p.qCom, 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Produtos e NCM</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Análise por produto, NCM e CFOP
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total SKUs"
          value={total}
          icon={<Package className="h-5 w-5 text-primary-700" />}
          iconBg="bg-primary-100"
          isLoading={isLoading}
        />
        <KpiCard
          label="Qtd Total"
          value={formatNumber(totalQCom, 0)}
          icon={<Package className="h-5 w-5 text-blue-700" />}
          iconBg="bg-blue-100"
          isLoading={isLoading}
        />
        <KpiCard
          label="Valor Total"
          value={formatCurrency(totalVProd)}
          icon={<Package className="h-5 w-5 text-green-700" />}
          iconBg="bg-green-100"
          isLoading={isLoading}
          valueSize="sm"
        />
        <KpiCard
          label="Maior Produto"
          value={products[0]?.xProd?.slice(0, 20) || '-'}
          icon={<Package className="h-5 w-5 text-purple-700" />}
          iconBg="bg-purple-100"
          isLoading={isLoading}
          valueSize="sm"
        />
      </div>

      {/* Bar chart top 10 */}
      {top10.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Produtos por Valor</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={top10} margin={{ top: 5, right: 10, left: 10, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="xProd"
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  angle={-35}
                  textAnchor="end"
                  interval={0}
                  tickFormatter={(v: string) => v.slice(0, 18) + (v.length > 18 ? '…' : '')}
                />
                <YAxis
                  tickFormatter={(v: number) => `R$ ${(v / 1000).toFixed(0)}K`}
                  tick={{ fontSize: 10, fill: '#9ca3af' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), 'Valor']}
                  labelFormatter={(l: string) => l}
                />
                <Bar dataKey="vProd" fill="#1e40af" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Search + Table */}
      <div className="space-y-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por produto ou NCM..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="h-9 w-full pl-9 pr-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead>NCM</TableHead>
                <TableHead>CFOP</TableHead>
                <SortHead col="qCom" current={sortBy} dir={sortDir} onClick={handleSort}>Qtd</SortHead>
                <SortHead col="vProd" current={sortBy} dir={sortDir} onClick={handleSort} className="text-right">Valor Total</SortHead>
                <SortHead col="vICMS" current={sortBy} dir={sortDir} onClick={handleSort} className="text-right">ICMS</SortHead>
                <SortHead col="vPIS" current={sortBy} dir={sortDir} onClick={handleSort} className="text-right">PIS</SortHead>
                <SortHead col="vCOFINS" current={sortBy} dir={sortDir} onClick={handleSort} className="text-right">COFINS</SortHead>
                <TableHead className="text-right">% Fat.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 9 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : products.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-gray-400">
                        Nenhum produto encontrado
                      </TableCell>
                    </TableRow>
                  )
                  : products.map((p: {
                      xProd: string
                      ncm: string
                      cfop: string
                      qCom: number
                      vProd: number
                      vICMS: number
                      vPIS: number
                      vCOFINS: number
                      count: number
                      pctFaturamento: number
                    }, i: number) => (
                    <TableRow key={i}>
                      <TableCell>
                        <p className="text-sm font-medium truncate max-w-[200px]">{p.xProd}</p>
                        <p className="text-xs text-gray-400">{p.count} nota(s)</p>
                      </TableCell>
                      <TableCell className="text-xs text-gray-600">{p.ncm || '-'}</TableCell>
                      <TableCell className="text-xs">{p.cfop}</TableCell>
                      <TableCell className="text-sm">{formatNumber(p.qCom, 3)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatCurrency(p.vProd)}</TableCell>
                      <TableCell className="text-right text-sm text-gray-600">{formatCurrency(p.vICMS)}</TableCell>
                      <TableCell className="text-right text-sm text-gray-600">{formatCurrency(p.vPIS)}</TableCell>
                      <TableCell className="text-right text-sm text-gray-600">{formatCurrency(p.vCOFINS)}</TableCell>
                      <TableCell className="text-right">
                        <span className="text-xs font-medium text-gray-600">{p.pctFaturamento.toFixed(1)}%</span>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>

          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <p className="text-sm text-gray-500">{total.toLocaleString('pt-BR')} produtos</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page <= 1}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-sm">{page}/{totalPages}</span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages}
                  className="p-1 rounded hover:bg-gray-100 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SortHead({
  col, current, dir, onClick, children, className,
}: {
  col: string
  current: string
  dir: string
  onClick: (col: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <TableHead
      className={`cursor-pointer select-none hover:text-gray-900 ${className || ''}`}
      onClick={() => onClick(col)}
    >
      <span className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={`h-3 w-3 ${current === col ? 'text-primary-600' : 'text-gray-300'}`} />
      </span>
    </TableHead>
  )
}
