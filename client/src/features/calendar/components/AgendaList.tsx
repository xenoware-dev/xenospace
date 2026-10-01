import { format, isTomorrow, parseISO } from 'date-fns'
import { CalendarRange } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { EventChip } from '@/features/calendar/components/EventChip'
import { dayKey, isToday, sortEvents } from '@/features/calendar/lib/calendar-meta'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/types/calendar'

interface AgendaListProps {
  days: Date[]
  eventsByDay: Record<string, CalendarEvent[]>
  onOpenEvent: (event: CalendarEvent) => void
}

function dayHeading(day: Date) {
  if (isToday(day)) return 'Today'
  if (isTomorrow(day)) return 'Tomorrow'
  return format(day, 'EEEE')
}

/**
 * A straight run of what is coming up. Empty days are skipped — a schedule reads
 * better as a list of what is happening than as a list of what is not.
 */
export function AgendaList({ days, eventsByDay, onOpenEvent }: AgendaListProps) {
  const filled = days
    .map((day) => ({ day, events: sortEvents(eventsByDay[dayKey(day)] ?? []) }))
    .filter((entry) => entry.events.length > 0)

  if (filled.length === 0) {
    return (
      <Card variant="elevated">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="glass-tile flex size-12 items-center justify-center rounded-full">
            <CalendarRange className="text-muted-foreground size-6" />
          </span>
          <div>
            <p className="text-sm font-medium">Nothing scheduled in this stretch</p>
            <p className="text-muted-foreground text-sm">
              Give a task a due date and it will show up here.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {filled.map(({ day, events }) => (
        <div
          key={dayKey(day)}
          className="grid gap-2 py-2 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4"
        >
          <div className="flex items-baseline gap-2 sm:flex-col sm:gap-0.5">
            <span
              className={cn(
                'text-sm font-semibold',
                isToday(day) ? 'text-data' : 'text-foreground'
              )}
            >
              {dayHeading(day)}
            </span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {format(day, 'd MMM')}
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            {events.map((event) => (
              <div key={event.id} className="flex items-center gap-2">
                <EventChip
                  event={event}
                  draggableId={`agenda:${dayKey(day)}:${event.id}`}
                  onOpen={onOpenEvent}
                />
                {event.project && event.kind === 'TASK' && (
                  <span className="text-muted-foreground hidden shrink-0 text-[11px] md:inline">
                    {event.project.name}
                  </span>
                )}
                <span className="text-muted-foreground/70 hidden shrink-0 text-[11px] tabular-nums lg:inline">
                  {format(parseISO(event.date), 'HH:mm') === '00:00'
                    ? 'All day'
                    : format(parseISO(event.date), 'HH:mm')}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
