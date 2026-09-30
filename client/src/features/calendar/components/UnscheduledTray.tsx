import { useDroppable } from '@dnd-kit/core'
import { Inbox } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EventChip } from '@/features/calendar/components/EventChip'
import { taskAsEvent } from '@/features/calendar/lib/calendar-meta'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/types/calendar'
import type { Task } from '@/types/task'

interface UnscheduledTrayProps {
  tasks: Task[]
  isLoading: boolean
  onOpenEvent: (event: CalendarEvent) => void
}

/**
 * Open cards nobody has dated yet. Drag one onto a day to schedule it, or drag a
 * dated chip back in here to clear its due date — the tray is a droppable too.
 */
export function UnscheduledTray({ tasks, isLoading, onOpenEvent }: UnscheduledTrayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled', data: { type: 'unscheduled' } })

  return (
    <Card
      ref={setNodeRef}
      className={cn(
        'gap-3 transition-[box-shadow,background-color] duration-[var(--motion-control)] ease-[var(--ease-glass)]',
        isOver && 'ring-data/60 bg-data/10 ring-2'
      )}
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Inbox className="text-muted-foreground size-4" />
          Unscheduled
          {tasks.length > 0 && (
            <span className="glass-control text-muted-foreground ml-auto rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
              {tasks.length}
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-6 rounded-lg" />
          ))
        ) : tasks.length === 0 ? (
          <p className="text-muted-foreground text-xs">
            Every open card has a date on it. Drop a chip here to take its date off.
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              Drag one onto a day to schedule it.
            </p>
            <div className="scrollbar-slim flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {tasks.map((task) => (
                <EventChip key={task.id} event={taskAsEvent(task)} onOpen={onOpenEvent} />
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
