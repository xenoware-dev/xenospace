import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { taskDueLabel, taskPriorityMeta } from '@/features/tasks/lib/task-meta'
import { cn } from '@/lib/utils'
import type { Task } from '@/types/task'

interface WorkTaskRowProps {
  task: Task
  /** Ticking the box moves the card into its board's done column. */
  onToggle: (task: Task) => void
  /** Overdue rows carry a warning edge; the rest stay quiet. */
  isOverdue?: boolean
}

export function WorkTaskRow({ task, onToggle, isOverdue = false }: WorkTaskRowProps) {
  const priority = taskPriorityMeta[task.priority]

  return (
    <div
      className={cn(
        'glass-tile group/work relative flex items-start gap-3 rounded-xl p-3',
        'transition-[filter] duration-[var(--motion-control)] ease-[var(--ease-glass)] hover:brightness-105'
      )}
    >
      {isOverdue && (
        <span
          className="bg-destructive absolute top-1/2 left-0 h-8 w-[3px] -translate-y-1/2 rounded-r-full"
          aria-hidden
        />
      )}

      <Checkbox
        checked={task.isDone}
        onCheckedChange={() => onToggle(task)}
        aria-label={task.isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
        className="mt-0.5"
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className={cn('text-sm leading-5', task.isDone && 'text-muted-foreground line-through')}>
          {task.title}
        </p>

        <div className="text-muted-foreground/70 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px]">
          {task.project && (
            <Link
              to={`/projects/${task.project.id}`}
              className="hover:text-foreground transition-colors duration-[var(--motion-control)]"
            >
              {task.reference ?? task.project.key}
            </Link>
          )}
          {task.list && <span>{task.list.name}</span>}
          <span className={cn(isOverdue && 'text-destructive font-medium')}>
            {taskDueLabel(task.dueDate, task.isDone)}
          </span>
        </div>
      </div>

      {task.priority !== 'MEDIUM' && (
        <Badge variant={priority.variant} className="shrink-0 text-[10px]">
          {priority.label}
        </Badge>
      )}
    </div>
  )
}
