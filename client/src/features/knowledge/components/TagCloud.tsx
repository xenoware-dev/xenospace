import { Badge } from '@/components/ui/badge'
import { softSurface } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { TagUsage } from '@/types/knowledge'

interface TagCloudProps {
  tags: TagUsage[]
  activeTag: string | null
  onSelect: (tag: string | null) => void
}

/** The tags people actually use, biggest first, as a one-click filter. */
export function TagCloud({ tags, activeTag, onSelect }: TagCloudProps) {
  if (!tags.length) return null

  return (
    <div className={cn(softSurface, 'flex flex-col gap-3 p-4')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium">Popular tags</p>
        {activeTag && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-4"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tags.map(({ tag, count }) => (
          <button key={tag} type="button" onClick={() => onSelect(activeTag === tag ? null : tag)}>
            <Badge
              variant={activeTag === tag ? 'default' : 'outline'}
              className="cursor-pointer font-normal transition-[background-color,color] duration-[var(--motion-control)]"
            >
              {tag}
              <span className="opacity-60">{count}</span>
            </Badge>
          </button>
        ))}
      </div>
    </div>
  )
}
