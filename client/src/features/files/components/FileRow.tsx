import { Star } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { FileActions, type FileActionHandlers } from '@/features/files/components/FileActions'
import { FileThumb } from '@/features/files/components/FileThumb'
import {
  categoryMeta,
  formatBytes,
  relativeDate,
  visibilityMeta,
} from '@/features/files/lib/file-meta'
import { getInitials } from '@/lib/format'
import type { FileNode } from '@/types/file'

interface FileRowProps extends FileActionHandlers {
  node: FileNode
  onOpen: (node: FileNode) => void
}

export function FileRow({ node, onOpen, ...handlers }: FileRowProps) {
  const visibility = visibilityMeta[node.visibility]
  const owner = node.owner

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
      className="group/file hover:bg-glass-tile/60 focus-visible:ring-ring/40 flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 outline-none transition-colors duration-[var(--motion-control)] ease-[var(--ease-glass)] focus-visible:ring-2"
    >
      <FileThumb node={node} />

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium" title={node.name}>
            {node.name}
          </span>
          {node.isStarred && (
            <Star className="fill-warning text-warning size-3.5 shrink-0" aria-hidden />
          )}
        </span>
        <span className="text-muted-foreground truncate text-xs">
          {node.kind === 'FOLDER' ? 'Folder' : categoryMeta[node.category].label}
          {node.description ? ` · ${node.description}` : ''}
        </span>
      </div>

      <Badge variant={visibility.variant} className="hidden shrink-0 text-[10px] sm:inline-flex">
        {node.visibility === 'PROJECT' && node.project ? node.project.key : visibility.label}
      </Badge>

      <span className="text-muted-foreground hidden w-20 shrink-0 text-right text-xs tabular-nums md:block">
        {node.kind === 'FOLDER' ? '—' : formatBytes(node.size)}
      </span>

      <span className="text-muted-foreground hidden w-28 shrink-0 text-right text-xs lg:block">
        {relativeDate(node.isTrashed && node.trashedAt ? node.trashedAt : node.updatedAt)}
      </span>

      {owner && (
        <Avatar className="hidden size-7 shrink-0 xl:flex" title={owner.name}>
          {owner.avatarUrl && <AvatarImage src={owner.avatarUrl} alt={owner.name} />}
          <AvatarFallback className="text-[10px]">{getInitials(owner.name)}</AvatarFallback>
        </Avatar>
      )}

      <FileActions node={node} {...handlers} />
    </div>
  )
}
