import { useMemo, useState } from 'react'
import { ChevronRight, Folder, FolderOpen, Plus, Search } from 'lucide-react'
import { Link } from 'react-router-dom'

import { SectionLabel } from '@/components/layout/SidebarNav'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { WorkspaceNode } from '@/types/dashboard'

const rowBase =
  'group flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-[color,background-color] duration-[var(--motion-control)] ease-[var(--ease-glass)]'

function matches(node: WorkspaceNode, query: string): boolean {
  if (!query) return true
  if (node.name.toLowerCase().includes(query)) return true
  return (node.children ?? []).some((child) => matches(child, query))
}

function TreeNode({
  node,
  query,
  root = true,
}: {
  node: WorkspaceNode
  query: string
  root?: boolean
}) {
  const hasChildren = Boolean(node.children?.length)
  const [open, setOpen] = useState(root)
  // A search hit inside a collapsed branch should reveal it.
  const expanded = hasChildren && (open || query.length > 0)

  const visibleChildren = (node.children ?? []).filter((child) => matches(child, query))

  if (!hasChildren) {
    const leafClass = cn(
      rowBase,
      'text-muted-foreground hover:bg-glass-tile hover:text-foreground'
    )

    const body = (
      <>
        <Folder className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">{node.name}</span>
        <span className="text-muted-foreground/70 text-xs tabular-nums">{node.count}</span>
      </>
    )

    // Project rows navigate; a bare group with no children stays inert.
    return node.url ? (
      <Link to={node.url} className={leafClass}>
        {body}
      </Link>
    ) : (
      <button type="button" className={leafClass}>
        {body}
      </button>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={expanded}
        className={cn(rowBase, 'text-foreground hover:bg-glass-tile font-medium')}
      >
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 transition-transform duration-[var(--motion-control)] ease-[var(--ease-glass)]',
            expanded && 'rotate-90'
          )}
        />
        {expanded ? (
          <FolderOpen className="size-3.5 shrink-0" />
        ) : (
          <Folder className="size-3.5 shrink-0" />
        )}
        <span className="flex-1 truncate">{node.name}</span>
        <span className="text-muted-foreground/70 text-xs tabular-nums">{node.count}</span>
      </button>
      {expanded && (
        <div className="border-glass-border animate-branch-enter ml-[18px] flex flex-col gap-0.5 border-l pl-1">
          {visibleChildren.map((child) => (
            <TreeNode key={child.name} node={child} query={query} root={false} />
          ))}
        </div>
      )}
    </div>
  )
}

export function WorkspaceTree() {
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()

  const tree = useWorkspaceStore((s) => s.overview?.tree)
  const status = useWorkspaceStore((s) => s.status)

  const roots = useMemo(
    () => (tree ?? []).filter((node) => matches(node, normalized)),
    [tree, normalized]
  )

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between pr-1">
        <SectionLabel>Workspaces</SectionLabel>
        <Button variant="ghost" size="icon" className="-mt-1 size-6" asChild>
          <Link to="/projects" aria-label="New project">
            <Plus className="size-3.5" />
          </Link>
        </Button>
      </div>

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search workspaces"
          aria-label="Search workspaces"
          className="glass-control placeholder:text-muted-foreground focus-visible:ring-ring/40 h-9 w-full rounded-xl pr-3 pl-9 text-sm outline-none focus-visible:ring-2"
        />
      </div>

      <div className="flex flex-col gap-0.5">
        {roots.length > 0 ? (
          roots.map((node) => <TreeNode key={node.name} node={node} query={normalized} />)
        ) : (
          <p className="text-muted-foreground px-2.5 py-2 text-xs">
            {!tree && status !== 'error'
              ? 'Loading…'
              : normalized
                ? 'No matching workspaces.'
                : 'No projects yet.'}
          </p>
        )}
      </div>
    </div>
  )
}
