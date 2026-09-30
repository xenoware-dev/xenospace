import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

import { Sparkline } from '@/components/common/Sparkline'
import { softSurface } from '@/components/ui/card'
import { formatCompact, formatSignedPercent } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface DeltaProps {
  /** Signed change, in percent. */
  value: number
  /** The period compared against, e.g. "last week". */
  period: string
  /** Whether a rise is the good outcome. Defaults to true. */
  upIsGood?: boolean
  className?: string
}

export function Delta({ value, period, upIsGood = true, className }: DeltaProps) {
  if (value === 0) {
    return (
      <span className={cn('text-muted-foreground text-xs font-medium', className)}>
        No change vs {period}
      </span>
    )
  }

  const isGood = value > 0 === upIsGood
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        isGood ? 'bg-success/12 text-success' : 'bg-destructive/12 text-destructive',
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      {formatSignedPercent(value)}
      <span className="text-muted-foreground font-medium">vs {period}</span>
    </span>
  )
}

interface StatTileProps {
  label: string
  value: number
  delta?: Omit<DeltaProps, 'className'>
  trend?: number[]
}

export function StatTile({ label, value, delta, trend }: StatTileProps) {
  return (
    <div className={cn(softSurface, 'flex flex-col gap-3 p-4')}>
      <p className="text-muted-foreground text-sm">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <p className="text-2xl leading-none font-semibold">{formatCompact(value)}</p>
        {trend && <Sparkline data={trend} label={`${label} trend`} width={80} height={28} />}
      </div>
      {delta && <Delta {...delta} />}
    </div>
  )
}
