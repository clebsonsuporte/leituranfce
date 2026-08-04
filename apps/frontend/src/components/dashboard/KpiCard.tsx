import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  iconBg?: string
  trend?: number | null
  trendLabel?: string
  isLoading?: boolean
  className?: string
  valueSize?: 'sm' | 'md' | 'lg'
}

export default function KpiCard({
  label,
  value,
  icon,
  iconBg = 'bg-primary-100',
  trend,
  trendLabel,
  isLoading,
  className,
  valueSize = 'md',
}: KpiCardProps) {
  if (isLoading) {
    return (
      <Card className={cn('p-5', className)}>
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-10 w-10 rounded-lg" />
        </div>
      </Card>
    )
  }

  const trendIcon =
    trend === null || trend === undefined ? (
      <Minus className="h-3 w-3" />
    ) : trend > 0 ? (
      <TrendingUp className="h-3 w-3" />
    ) : trend < 0 ? (
      <TrendingDown className="h-3 w-3" />
    ) : (
      <Minus className="h-3 w-3" />
    )

  const trendColor =
    trend === null || trend === undefined
      ? 'text-gray-500'
      : trend > 0
        ? 'text-green-600'
        : trend < 0
          ? 'text-red-600'
          : 'text-gray-500'

  return (
    <Card className={cn('hover:shadow-md transition-shadow', className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">
              {label}
            </p>
            <p
              className={cn(
                'font-bold text-gray-900 mt-1 leading-tight truncate',
                valueSize === 'sm' && 'text-xl',
                valueSize === 'md' && 'text-2xl',
                valueSize === 'lg' && 'text-3xl'
              )}
            >
              {value}
            </p>
            {(trend !== undefined || trendLabel) && (
              <div className={cn('flex items-center gap-1 mt-2 text-xs font-medium', trendColor)}>
                {trendIcon}
                {trend !== null && trend !== undefined && (
                  <span>{trend > 0 ? '+' : ''}{trend.toFixed(1)}%</span>
                )}
                {trendLabel && <span className="text-gray-400">{trendLabel}</span>}
              </div>
            )}
          </div>
          <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
