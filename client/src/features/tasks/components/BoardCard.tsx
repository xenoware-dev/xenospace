import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarClock, CheckCircle2, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isTaskOverdue, taskDueLabel, taskPriorityMeta } from '@/features/tasks/lib/task-meta'
import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Task } from '@/types/task'

interface BoardCardProps {
  task: Task
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

/** The card as it looks while sitting in a column, and inside the drag overlay. */
export function CardFace({
  task,
  onEdit,
  onDelete,
  isDragging,
}: BoardCardProps & { isDragging?: boolean }) {
  const priority = taskPriorityMeta[task.priority]
  const due = taskDueLabel(task.dueDate, task.isDone)
  const overdue = isTaskOverdue(task.dueDate, task.isDone)

  return (
    <div
      className={cn(
        'glass-tile group/card flex cursor-grab flex-col gap-2 rounded-xl p-2.5 active:cursor-grabbing',
        'transition-shadow duration-[var(--motion-control)] ease-[var(--ease-glass)] hover:shadow-[var(--glass-shadow-sm)]',
        isDragging && 'shadow-[var(--glass-shadow)]'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            'text-sm leading-snug font-medium',
            task.isDone && 'text-muted-foreground line-through'
          )}
        >
          {task.isDone && (
            <CheckCircle2 className="text-success mr-1 -mt-0.5 inline size-3.5" aria-hidden />
          )}
          {task.title}
        </p>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              // Stops the drag sensor claiming the press meant for the menu.
              onPointerDown={(event) => event.stopPropagation()}
              className="-mt-1 -mr-1 size-6 shrink-0 opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label={`Actions for ${task.title}`}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <Pencil />
              Open card
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(task)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="glass-control text-muted-foreground rounded-full px-1.5 py-0.5 text-[10px]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.priority !== 'MEDIUM' && (
            <Badge variant={priority.variant} className="text-[10px]">
              {priority.label}
            </Badge>
          )}
          {task.reference && (
            <span className="text-muted-foreground truncate font-mono text-[10px] tracking-wider">
              {task.reference}
            </span>
          )}
          {due && (
            <span
              className={cn(
                'text-muted-foreground flex shrink-0 items-center gap-1 text-[11px]',
                overdue && 'text-destructive font-medium'
              )}
            >
              <CalendarClock className="size-3" aria-hidden />
              {due}
            </span>
          )}
        </div>

        {task.assignee && (
          <Avatar className="size-6 shrink-0" title={`Assigned to ${task.assignee.name}`}>
            <AvatarImage src={task.assignee.avatarUrl ?? undefined} alt={task.assignee.name} />
            <AvatarFallback className="text-[9px]">
              {getInitials(task.assignee.name)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  )
}

export function BoardCard({ task, onEdit, onDelete }: BoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'card', listId: task.listId },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // `touch-none` is what lets a touch drag beat the column's own scrolling.
      // The card keeps its slot as a hole while its copy rides in the overlay.
      className={cn('touch-none', isDragging && 'opacity-40')}
      onDoubleClick={() => onEdit(task)}
      {...attributes}
      {...listeners}
    >
      <CardFace task={task} onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}
