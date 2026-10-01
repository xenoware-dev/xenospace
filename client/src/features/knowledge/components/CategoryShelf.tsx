import { Layers, Pencil, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { softSurface } from '@/components/ui/card'
import { categoryIcons } from '@/features/knowledge/lib/knowledge-meta'
import { cn } from '@/lib/utils'
import type { ArticleCategory } from '@/types/knowledge'

interface CategoryShelfProps {
  categories: ArticleCategory[]
  /** Null is "every shelf". */
  activeId: string | null
  totalCount: number
  onSelect: (id: string | null) => void
  /** Curators get the add and edit affordances; everyone else just browses. */
  canCurate: boolean
  onAdd: () => void
  onEdit: (category: ArticleCategory) => void
}

export function CategoryShelf({
  categories,
  activeId,
  totalCount,
  onSelect,
  canCurate,
  onAdd,
  onEdit,
}: CategoryShelfProps) {
  return (
    <nav className={cn(softSurface, 'flex flex-col gap-1 p-2')} aria-label="Categories">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <span className="text-muted-foreground text-xs font-medium">Shelves</span>
        {canCurate && (
          <Button
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={onAdd}
            aria-label="Add a category"
          >
            <Plus className="size-3.5" />
          </Button>
        )}
      </div>

      <Row
        icon={Layers}
        label="Everything"
        count={totalCount}
        active={activeId === null}
        onSelect={() => onSelect(null)}
      />

      {categories.map((category) => (
        <Row
          key={category.id}
          icon={categoryIcons[category.icon]}
          label={category.name}
          count={category.articleCount}
          active={activeId === category.id}
          onSelect={() => onSelect(category.id)}
          onEdit={canCurate ? () => onEdit(category) : undefined}
        />
      ))}

      {!categories.length && (
        <p className="text-muted-foreground px-2 py-3 text-xs leading-5">
          No shelves yet.
          {canCurate ? ' Add one to start filing articles.' : ' An admin can add the first one.'}
        </p>
      )}
    </nav>
  )
}

interface RowProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
  active: boolean
  onSelect: () => void
  onEdit?: () => void
}

function Row({ icon: Icon, label, count, active, onSelect, onEdit }: RowProps) {
  return (
    <div className="group/row relative flex items-center">
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left text-sm',
          'focus-visible:ring-ring/40 outline-none focus-visible:ring-2',
          'transition-[background-color,color] duration-[var(--motion-control)] ease-[var(--ease-glass)]',
          active ? 'glass-raised font-medium' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-muted-foreground/70 shrink-0 text-xs tabular-nums">{count}</span>
      </button>

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          className="text-muted-foreground hover:text-foreground absolute right-1 rounded-md p-1 opacity-0 transition-opacity duration-[var(--motion-control)] group-hover/row:opacity-100 group-focus-within/row:opacity-100"
        >
          <Pencil className="size-3" />
        </button>
      )}
    </div>
  )
}
