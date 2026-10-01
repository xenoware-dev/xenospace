import { softSurface } from '@/components/ui/card'
import { categoryMeta, formatBytes } from '@/features/files/lib/file-meta'
import { cn } from '@/lib/utils'
import type { FileSummary } from '@/types/file'

/** How the library's bytes are spread across kinds of file. */
export function StorageBreakdown({ summary }: { summary: FileSummary }) {
  const rows = summary.byCategory.filter((row) => row.size > 0).slice(0, 6)
  const total = rows.reduce((sum, row) => sum + row.size, 0)

  if (!rows.length) return null

  return (
    <div className={cn(softSurface, 'flex flex-col gap-3 p-4')}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted-foreground text-sm">Storage used</p>
        <p className="text-sm font-semibold tabular-nums">{formatBytes(summary.totalSize)}</p>
      </div>

      {/* One track split by share of bytes, so the mix reads at a glance. */}
      <div className="bg-data-track flex h-2 overflow-hidden rounded-full">
        {rows.map((row, index) => (
          <span
            key={row.category}
            className="bg-data h-full"
            style={{
              width: `${(row.size / total) * 100}%`,
              // Successive bands step down in opacity rather than taking on hue,
              // which keeps the panel greyscale-plus-one-accent.
              opacity: 1 - index * 0.13,
            }}
            title={`${categoryMeta[row.category].label}: ${formatBytes(row.size)}`}
          />
        ))}
      </div>

      <ul className="flex flex-col gap-1.5">
        {rows.map((row, index) => {
          const Icon = categoryMeta[row.category].icon

          return (
            <li key={row.category} className="flex items-center gap-2 text-xs">
              <span
                className="bg-data size-2 shrink-0 rounded-full"
                style={{ opacity: 1 - index * 0.13 }}
                aria-hidden
              />
              <Icon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              <span className="flex-1 truncate">{categoryMeta[row.category].label}</span>
              <span className="text-muted-foreground tabular-nums">{row.count}</span>
              <span className="w-16 text-right tabular-nums">{formatBytes(row.size)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
