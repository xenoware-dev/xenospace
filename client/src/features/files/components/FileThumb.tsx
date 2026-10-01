import { Folder } from 'lucide-react'
import { useState } from 'react'

import { categoryMeta } from '@/features/files/lib/file-meta'
import { cn } from '@/lib/utils'
import { fileApi } from '@/services/file.service'
import type { FileNode } from '@/types/file'

interface FileThumbProps {
  node: FileNode
  /** `tile` is the square used in the grid; `inline` the small one in a row. */
  size?: 'tile' | 'inline'
  className?: string
}

/**
 * An image file shows itself; everything else shows the icon for its kind. The
 * thumbnail falls back to the icon if the fetch fails, so a missing blob never
 * leaves a broken image frame on the grid.
 */
export function FileThumb({ node, size = 'inline', className }: FileThumbProps) {
  const [failed, setFailed] = useState(false)
  const Icon = node.kind === 'FOLDER' ? Folder : categoryMeta[node.category].icon

  const showImage = node.category === 'IMAGE' && node.kind === 'FILE' && !failed
  const isTile = size === 'tile'

  return (
    <span
      className={cn(
        'glass-tile relative flex shrink-0 items-center justify-center overflow-hidden',
        isTile ? 'h-28 w-full rounded-2xl' : 'size-10 rounded-xl',
        className
      )}
    >
      {showImage ? (
        <img
          src={fileApi.previewUrl(node.id)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <Icon
          className={cn('text-muted-foreground', isTile ? 'size-8' : 'size-5')}
          aria-hidden
        />
      )}
    </span>
  )
}
