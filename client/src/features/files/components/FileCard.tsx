import { Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { FileActions, type FileActionHandlers } from '@/features/files/components/FileActions'
import { FileThumb } from '@/features/files/components/FileThumb'
import { metaLine, relativeDate, visibilityMeta } from '@/features/files/lib/file-meta'
import { cn } from '@/lib/utils'
import type { FileNode } from '@/types/file'

interface FileCardProps extends FileActionHandlers {
  node: FileNode
  /** Opening a folder navigates into it; opening a file shows its details. */
  onOpen: (node: FileNode) => void
}

export function FileCard({ node, onOpen, ...handlers }: FileCardProps) {
  const visibility = visibilityMeta[node.visibility]

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(node)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(node)
        }
      }}
      className={cn(
        'glass-tile group/file flex cursor-pointer flex-col gap-3 rounded-2xl p-3 text-left',
        'focus-visible:ring-ring/40 outline-none focus-visible:ring-2',
        'transition-[filter,transform] duration-[var(--motion-control)] ease-[var(--ease-glass)]',
        'hover:brightness-105'
      )}
    >
      <div className="relative">
        <FileThumb node={node} size="tile" />
        {node.isStarred && (
          <Star className="fill-warning text-warning absolute top-2 left-2 size-4" aria-hidden />
        )}
        {/* The menu stays out of the way until the tile is hovered or focused. */}
        <div className="absolute top-1 right-1 opacity-0 transition-opacity duration-[var(--motion-control)] group-hover/file:opacity-100 group-focus-within/file:opacity-100">
          <FileActions node={node} {...handlers} />
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate text-sm font-medium" title={node.name}>
          {node.name}
        </p>
        <p className="text-muted-foreground truncate text-xs">{metaLine(node)}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <Badge variant={visibility.variant} className="text-[10px]">
            {node.visibility === 'PROJECT' && node.project
              ? node.project.key
              : visibility.label}
          </Badge>
          <span className="text-muted-foreground/70 shrink-0 text-[10px]">
            {relativeDate(node.isTrashed && node.trashedAt ? node.trashedAt : node.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  )
}
