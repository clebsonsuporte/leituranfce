import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useTaxBreakdown } from '@/hooks/useDashboard'
import { formatCurrency } from '@/lib/utils'

function CustomTooltip({ active, payload }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { pct: number } }>
}) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700">{item.name}</p>
      <p className="text-gray-600">{formatCurrency(item.value)}</p>
      <p className="text-gray-400">{item.payload.pct.toFixed(1)}% do total</p>
    </div>
  )
}

function CustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, pct }: {
  cx: number
  cy: number
  midAngle: number
  innerRadius: number
  outerRadius: number
  pct: number
}) {
  if (pct < 5) return null
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold">
      {pct.toFixed(0)}%
    </text>
  )
}

export default function TaxBreakdownChart() {
  const { data, isLoading } = useTaxBreakdown()

  const chartData = data?.data.filter((d) => d.value > 0) || []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Distribuição de Impostos</CardTitle>
        <p className="text-xs text-gray-400 mt-1">
          Total: {formatCurrency(data?.total || 0)}
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : chartData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-gray-400 text-sm">
            Nenhum dado disponível
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={CustomLabel as unknown as boolean}
                outerRadius={100}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '12px' }}
                formatter={(value, entry) => {
                  return `${value}: ${formatCurrency(entry.payload?.value)}`
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
