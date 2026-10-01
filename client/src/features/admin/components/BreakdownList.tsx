import { cn } from '@/lib/utils'

export interface BreakdownRow {
  key: string
  label: string
  count: number
  /** Optional trailing note, e.g. a badge or a secondary figure. */
  note?: React.ReactNode
}

interface BreakdownListProps {
  rows: BreakdownRow[]
  /** What the bars are measured against. Defaults to the largest row. */
  total?: number
  emptyLabel: string
  className?: string
}

/**
 * A ranked list where each row carries its own share as a bar. Bars are drawn
 * against the whole rather than against the leader, so a long tail still reads
 * as a long tail; the accent steps down in opacity instead of taking on hue,
 * the way the storage breakdown does.
 */
export function BreakdownList({ rows, total, emptyLabel, className }: BreakdownListProps) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground py-4 text-sm">{emptyLabel}</p>
  }

  const basis = total ?? Math.max(...rows.map((row) => row.count))

  return (
    <ul className={cn('flex flex-col gap-3', className)}>
      {rows.map((row, index) => {
        const percent = basis > 0 ? (row.count / basis) * 100 : 0

        return (
          <li key={row.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm">{row.label}</span>
              <span className="flex shrink-0 items-center gap-2">
                {row.note}
                <span className="text-sm font-semibold tabular-nums">{row.count}</span>
              </span>
            </div>
            <div
              className="bg-data-track h-1.5 overflow-hidden rounded-full"
              role="meter"
              aria-valuenow={row.count}
              aria-valuemin={0}
              aria-valuemax={basis}
              aria-label={row.label}
            >
              <div
                className="bg-data h-full rounded-full transition-[width] duration-[var(--motion-view-in)] ease-[var(--ease-glass)]"
                style={{
                  width: `${percent}%`,
                  opacity: Math.max(0.4, 1 - index * 0.08),
                }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
