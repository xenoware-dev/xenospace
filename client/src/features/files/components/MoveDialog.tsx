import { AxiosError } from 'axios'
import { ChevronRight, Folder, HardDrive, Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { fileApi } from '@/services/file.service'
import type { FileNode, FileTreeNode } from '@/types/file'

interface MoveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  node: FileNode | null
  tree: FileTreeNode[]
  onMoved: () => void
}

/** Ids that a node may not move into: itself, and anything beneath it. */
function forbiddenIds(tree: FileTreeNode[], nodeId: string): Set<string> {
  const found = new Set<string>()

  const collect = (branch: FileTreeNode) => {
    found.add(branch.id)
    branch.children.forEach(collect)
  }

  const walk = (branches: FileTreeNode[]) => {
    for (const branch of branches) {
      if (branch.id === nodeId) {
        collect(branch)
        return true
      }
      if (walk(branch.children)) return true
    }
    return false
  }

  walk(tree)
  return found
}

function FolderOption({
  folder,
  depth,
  selected,
  forbidden,
  onSelect,
}: {
  folder: FileTreeNode
  depth: number
  selected: string | null
  forbidden: Set<string>
  onSelect: (id: string) => void
}) {
  const isForbidden = forbidden.has(folder.id)

  return (
    <>
      <button
        type="button"
        disabled={isForbidden}
        onClick={() => onSelect(folder.id)}
        style={{ paddingLeft: `${depth * 16 + 10}px` }}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl py-2 pr-3 text-left text-sm',
          'transition-colors duration-[var(--motion-control)] ease-[var(--ease-glass)]',
          'hover:bg-glass-tile disabled:cursor-not-allowed disabled:opacity-40',
          selected === folder.id && 'bg-glass-tile text-foreground font-medium'
        )}
      >
        {folder.children.length > 0 ? (
          <ChevronRight className="size-3.5 shrink-0 rotate-90" aria-hidden />
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <Folder className="size-3.5 shrink-0" aria-hidden />
        <span className="flex-1 truncate">{folder.name}</span>
        <span className="text-muted-foreground/70 text-xs tabular-nums">{folder.count}</span>
      </button>
      {folder.children.map((child) => (
        <FolderOption
          key={child.id}
          folder={child}
          depth={depth + 1}
          selected={selected}
          forbidden={forbidden}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

export function MoveDialog({ open, onOpenChange, node, tree, onMoved }: MoveDialogProps) {
  const [target, setTarget] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Each opening starts from where the item already sits.
  useEffect(() => {
    if (open) setTarget(node?.parent ?? null)
  }, [open, node])

  const forbidden = useMemo(
    () => (node?.kind === 'FOLDER' ? forbiddenIds(tree, node.id) : new Set<string>()),
    [tree, node]
  )

  const unchanged = target === (node?.parent ?? null)

  const onConfirm = async () => {
    if (!node) return

    setIsSaving(true)
    try {
      const { message } = await fileApi.move(node.id, target)
      toast.success(message)
      onOpenChange(false)
      onMoved()
    } catch (error: unknown) {
      const fallback = 'Unable to move this item'
      toast.error(
        error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move {node?.name}</DialogTitle>
          <DialogDescription>
            Pick the folder it should live in. A folder cannot be moved inside itself.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="glass-control max-h-72 rounded-2xl p-1.5">
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              onClick={() => setTarget(null)}
              className={cn(
                'flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm',
                'hover:bg-glass-tile transition-colors duration-[var(--motion-control)] ease-[var(--ease-glass)]',
                target === null && 'bg-glass-tile text-foreground font-medium'
              )}
            >
              <HardDrive className="size-3.5 shrink-0" aria-hidden />
              Library root
            </button>

            {tree.map((folder) => (
              <FolderOption
                key={folder.id}
                folder={folder}
                depth={1}
                selected={target}
                forbidden={forbidden}
                onSelect={setTarget}
              />
            ))}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={isSaving || unchanged} onClick={onConfirm}>
            {isSaving && <Loader2 className="animate-spin" />}
            Move here
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
