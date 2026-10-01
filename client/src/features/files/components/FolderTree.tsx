import { ChevronRight, Folder, FolderOpen, HardDrive } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import type { FileTreeNode } from '@/types/file'

const rowBase =
  'group flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-[color,background-color] duration-[var(--motion-control)] ease-[var(--ease-glass)]'

function Branch({
  folder,
  activeId,
  onSelect,
}: {
  folder: FileTreeNode
  activeId: string | null
  onSelect: (id: string) => void
}) {
  const hasChildren = folder.children.length > 0
  const [open, setOpen] = useState(false)
  // Navigating into a folder — from a breadcrumb, a card or a search hit —
  // reveals the branch holding it, the way opening a path in Finder does.
  const expanded = hasChildren && (open || containsId(folder, activeId))
  const isActive = activeId === folder.id

  return (
    <div>
      <div className={cn(rowBase, isActive && 'bg-glass-tile text-foreground font-medium')}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
            className="-ml-1 shrink-0 rounded p-0.5"
          >
            <ChevronRight
              className={cn(
                'size-3.5 transition-transform duration-[var(--motion-control)] ease-[var(--ease-glass)]',
                expanded && 'rotate-90'
              )}
            />
          </button>
        ) : (
          <span className="size-3.5 shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <FolderOpen className="size-3.5 shrink-0" />
          ) : (
            <Folder className="size-3.5 shrink-0" />
          )}
          <span className="flex-1 truncate">{folder.name}</span>
          <span className="text-muted-foreground/70 text-xs tabular-nums">{folder.count}</span>
        </button>
      </div>

      {expanded && (
        <div className="border-glass-border animate-branch-enter ml-[18px] flex flex-col gap-0.5 border-l pl-1">
          {folder.children.map((child) => (
            <Branch
              key={child.id}
              folder={child}
              activeId={activeId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function containsId(folder: FileTreeNode, id: string | null): boolean {
  if (!id) return false
  if (folder.id === id) return true
  return folder.children.some((child) => containsId(child, id))
}

interface FolderTreeProps {
  tree: FileTreeNode[]
  rootFileCount: number
  activeId: string | null
  onSelect: (id: string | null) => void
}

/** The library's own folder tree, beside the listing on wide viewports. */
export function FolderTree({ tree, rootFileCount, activeId, onSelect }: FolderTreeProps) {
  return (
    <nav aria-label="Folders" className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          rowBase,
          'hover:bg-glass-tile',
          activeId === null && 'bg-glass-tile text-foreground font-medium'
        )}
      >
        <HardDrive className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">Library</span>
        <span className="text-muted-foreground/70 text-xs tabular-nums">{rootFileCount}</span>
      </button>

      {tree.length === 0 ? (
        <p className="text-muted-foreground px-2.5 py-2 text-xs">No folders yet.</p>
      ) : (
        tree.map((folder) => (
          <Branch key={folder.id} folder={folder} activeId={activeId} onSelect={onSelect} />
        ))
      )}
    </nav>
  )
}
