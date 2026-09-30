import { cn } from '@/lib/utils'

interface SparklineProps {
  /** Ordered series, oldest first. Twelve points is the house default. */
  data: number[]
  /** Describes the series for screen readers, e.g. "Tasks completed, last 12 weeks". */
  label: string
  width?: number
  height?: number
  className?: string
}

/**
 * Single-series trend line: recessive stroke for history, accent dot on the
 * current period. Rendered at a fixed size so the stroke and marker never
 * distort.
 */
export function Sparkline({
  data,
  label,
  width = 120,
  height = 36,
  className,
}: SparklineProps) {
  if (data.length < 2) return null

  const pad = 4
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1

  const points = data.map((value, i) => ({
    x: pad + (i * (width - pad * 2)) / (data.length - 1),
    y: height - pad - ((value - min) / span) * (height - pad * 2),
  }))

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
  const last = points[points.length - 1]

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className={cn('overflow-visible', className)}
    >
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted-foreground/70"
      />
      <circle cx={last.x} cy={last.y} r={4} fill="currentColor" className="text-data" />
    </svg>
  )
}
