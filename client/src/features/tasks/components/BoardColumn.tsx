import { useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckCircle2, GripVertical, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { BoardCard } from '@/features/tasks/components/BoardCard'
import { CardComposer } from '@/features/tasks/components/CardComposer'
import { cn } from '@/lib/utils'
import type { Task, TaskList } from '@/types/task'

interface BoardColumnProps {
  list: TaskList
  cards: Task[]
  onAddCard: (list: TaskList, title: string) => Promise<void>
  onRename: (list: TaskList, name: string) => void
  onToggleDone: (list: TaskList, isDone: boolean) => void
  onDelete: (list: TaskList) => void
  onEditCard: (task: Task) => void
  onDeleteCard: (task: Task) => void
}

export function BoardColumn({
  list,
  cards,
  onAddCard,
  onRename,
  onToggleDone,
  onDelete,
  onEditCard,
  onDeleteCard,
}: BoardColumnProps) {
  const [isRenaming, setIsRenaming] = useState(false)
  const [draftName, setDraftName] = useState(list.name)
  const inputRef = useRef<HTMLInputElement>(null)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: 'list' },
  })

  // An empty column still has to accept a card, which the sortable context alone
  // cannot do — so the body is its own droppable.
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `list-body:${list.id}`,
    data: { type: 'list-body', listId: list.id },
  })

  useEffect(() => {
    if (isRenaming) inputRef.current?.select()
  }, [isRenaming])

  const commitRename = () => {
    const trimmed = draftName.trim()
    setIsRenaming(false)
    if (!trimmed || trimmed === list.name) {
      setDraftName(list.name)
      return
    }
    onRename(list, trimmed)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'glass flex h-fit max-h-full w-72 shrink-0 flex-col gap-2 rounded-2xl p-2',
        isDragging && 'opacity-50'
      )}
    >
      <header className="flex items-center gap-1 px-1">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
          aria-label={`Reorder ${list.name}`}
          // The grip is the drag handle, so the sortable's a11y attributes belong
          // here rather than on the column, which holds inputs and buttons of its own.
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>

        {isRenaming ? (
          <Input
            ref={inputRef}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename()
              if (event.key === 'Escape') {
                setDraftName(list.name)
                setIsRenaming(false)
              }
            }}
            maxLength={60}
            className="h-7 px-1.5 text-sm font-semibold"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftName(list.name)
              setIsRenaming(true)
            }}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          >
            {list.isDone && <CheckCircle2 className="text-success size-3.5 shrink-0" aria-hidden />}
            <span className="truncate text-sm font-semibold">{list.name}</span>
          </button>
        )}

        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{cards.length}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0"
              aria-label={`Actions for ${list.name}`}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setDraftName(list.name)
                setIsRenaming(true)
              }}
            >
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem
              checked={list.isDone}
              onCheckedChange={(checked) => onToggleDone(list, checked)}
            >
              Completes cards
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(list)}>
              <Trash2 />
              Delete list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div
        ref={setDroppableRef}
        className={cn(
          'scrollbar-slim flex min-h-[3rem] flex-col gap-2 overflow-y-auto rounded-xl px-1 py-0.5 transition-colors',
          isOver && 'bg-glass-tile/60'
        )}
      >
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <BoardCard key={card.id} task={card} onEdit={onEditCard} onDelete={onDeleteCard} />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          <p className="text-muted-foreground px-2 py-3 text-center text-xs">Drop a card here</p>
        )}
      </div>

      <CardComposer onAdd={(title) => onAddCard(list, title)} />
    </div>
  )
}
