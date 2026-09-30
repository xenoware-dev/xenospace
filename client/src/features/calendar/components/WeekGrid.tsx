import { format } from 'date-fns'

import { DayCell } from '@/features/calendar/components/DayCell'
import { dayKey, weekGrid } from '@/features/calendar/lib/calendar-meta'
import type { CalendarEvent } from '@/types/calendar'

interface WeekGridProps {
  anchor: Date
  eventsByDay: Record<string, CalendarEvent[]>
  selectedDay: Date | null
  onSelectDay: (day: Date) => void
  onAddOnDay: (day: Date) => void
  onOpenEvent: (event: CalendarEvent) => void
}

/**
 * Seven tall columns rather than seven small cells: a week has the room to show
 * every chip in full, so nothing folds into a "+n more".
 */
export function WeekGrid({
  anchor,
  eventsByDay,
  selectedDay,
  onSelectDay,
  onAddOnDay,
  onOpenEvent,
}: WeekGridProps) {
  const days = weekGrid(anchor)
  const selectedKey = selectedDay ? dayKey(selectedDay) : null

  return (
    <div className="grid gap-1.5 sm:grid-cols-7">
      {days.map((day) => {
        const key = dayKey(day)
        return (
          <div key={key} className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-baseline gap-1.5 px-1">
              <span className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                {format(day, 'EEE')}
              </span>
              <span className="text-muted-foreground/70 text-[11px] tabular-nums">
                {format(day, 'd MMM')}
              </span>
            </div>
            <DayCell
              day={day}
              events={eventsByDay[key] ?? []}
              isSelected={key === selectedKey}
              maxChips={Number.POSITIVE_INFINITY}
              className="min-h-56 sm:min-h-64"
              onSelect={onSelectDay}
              onAdd={onAddOnDay}
              onOpenEvent={onOpenEvent}
            />
          </div>
        )
      })}
    </div>
  )
}
