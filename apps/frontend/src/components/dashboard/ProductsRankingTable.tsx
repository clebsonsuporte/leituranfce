import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useProductsRanking } from '@/hooks/useDashboard'
import { formatCurrency } from '@/lib/utils'

export default function ProductsRankingTable() {
  const { data: products = [], isLoading } = useProductsRanking(10)

  const maxValue = products.length > 0 ? Math.max(...products.map((p) => p.vProd)) : 1

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top 10 Produtos por Valor</CardTitle>
        <p className="text-xs text-gray-400 mt-1">Produtos com maior valor no período</p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Nenhum produto encontrado
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {products.map((product, index) => {
              const pct = (product.vProd / maxValue) * 100
              return (
                <div key={index} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-400 w-5 shrink-0">
                        {index + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {product.xProd}
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(product.vProd)}
                      </p>
                      <p className="text-xs text-gray-400">{product.count} notas</p>
                    </div>
                  </div>
                  <div className="ml-7 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-500 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
