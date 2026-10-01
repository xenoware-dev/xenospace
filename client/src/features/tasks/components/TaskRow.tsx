import { CalendarClock, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { isTaskOverdue, taskDueLabel, taskPriorityMeta } from '@/features/tasks/lib/task-meta'
import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Task, TaskList } from '@/types/task'

interface TaskRowProps {
  task: Task
  lists: TaskList[]
  onToggleDone: (task: Task) => void
  onMoveToList: (task: Task, listId: string) => void
  onEdit: (task: Task) => void
  onDelete: (task: Task) => void
}

export function TaskRow({
  task,
  lists,
  onToggleDone,
  onMoveToList,
  onEdit,
  onDelete,
}: TaskRowProps) {
  const priority = taskPriorityMeta[task.priority]
  const due = taskDueLabel(task.dueDate, task.isDone)
  const overdue = isTaskOverdue(task.dueDate, task.isDone)

  return (
    <div className="group/task hover:bg-glass-tile/60 flex items-start gap-3 rounded-xl px-2 py-3 transition-colors duration-[var(--motion-control)] ease-[var(--ease-glass)]">
      <Checkbox
        checked={task.isDone}
        onCheckedChange={() => onToggleDone(task)}
        className="mt-0.5"
        aria-label={task.isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p
          className={cn(
            'text-sm font-medium transition-colors',
            task.isDone && 'text-muted-foreground line-through'
          )}
        >
          {task.title}
        </p>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          {task.list && (
            <span className="glass-control rounded-full px-1.5 py-0.5 text-[10px]">
              {task.list.name}
            </span>
          )}

          {task.project && (
            <Link
              to={`/projects/${task.project.id}`}
              className="hover:text-foreground font-mono text-[11px] tracking-wider transition-colors"
            >
              {task.reference ?? task.project.key}
            </Link>
          )}

          {due && (
            <span
              className={cn('flex items-center gap-1', overdue && 'text-destructive font-medium')}
            >
              <CalendarClock className="size-3" aria-hidden />
              {due}
            </span>
          )}

          {task.tags.map((tag) => (
            <span key={tag} className="glass-tile rounded-full px-1.5 py-0.5 text-[10px]">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <Badge variant={priority.variant} className="hidden text-[11px] sm:inline-flex">
          {priority.label}
        </Badge>

        {task.assignee ? (
          <Avatar className="size-7" title={`Assigned to ${task.assignee.name}`}>
            <AvatarImage src={task.assignee.avatarUrl ?? undefined} alt={task.assignee.name} />
            <AvatarFallback className="text-[10px]">
              {getInitials(task.assignee.name)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="glass-control text-muted-foreground flex size-7 items-center justify-center rounded-full text-[10px]">
            —
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 opacity-0 group-hover/task:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label={`Actions for ${task.title}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={task.listId}
              onValueChange={(value) => onMoveToList(task, value)}
            >
              {lists.map((list) => (
                <DropdownMenuRadioItem key={list.id} value={list.id}>
                  {list.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(task)}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
