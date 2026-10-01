import {
  Download,
  FolderInput,
  Info,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { fileApi } from '@/services/file.service'
import type { FileNode } from '@/types/file'

export interface FileActionHandlers {
  onDetails: (node: FileNode) => void
  onRename: (node: FileNode) => void
  onMove: (node: FileNode) => void
  onStar: (node: FileNode) => void
  onTrash: (node: FileNode) => void
  onRestore: (node: FileNode) => void
  onDelete: (node: FileNode) => void
}

interface FileActionsProps extends FileActionHandlers {
  node: FileNode
  /** Rendered over a grid tile, where the trigger only appears on hover. */
  align?: 'start' | 'end'
}

/** The one action menu behind both the grid tile and the list row. */
export function FileActions({ node, align = 'end', ...handlers }: FileActionsProps) {
  const isFile = node.kind === 'FILE'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Actions for ${node.name}`}
          onClick={(event) => event.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        {node.isTrashed ? (
          <>
            <DropdownMenuItem
              disabled={!node.canManage}
              onSelect={() => handlers.onRestore(node)}
            >
              <RotateCcw />
              Restore
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!node.canManage}
              onSelect={() => handlers.onDelete(node)}
            >
              <Trash2 />
              Delete permanently
            </DropdownMenuItem>
          </>
        ) : (
          <>
            {isFile && (
              <DropdownMenuItem asChild>
                <a href={fileApi.downloadUrl(node.id)} download>
                  <Download />
                  Download
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => handlers.onDetails(node)}>
              <Info />
              Details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handlers.onStar(node)}>
              {node.isStarred ? <StarOff /> : <Star />}
              {node.isStarred ? 'Remove star' : 'Add star'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!node.canManage} onSelect={() => handlers.onRename(node)}>
              <Pencil />
              Rename & details
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!node.canManage} onSelect={() => handlers.onMove(node)}>
              <FolderInput />
              Move to…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={!node.canManage}
              onSelect={() => handlers.onTrash(node)}
            >
              <Trash2 />
              Move to trash
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
