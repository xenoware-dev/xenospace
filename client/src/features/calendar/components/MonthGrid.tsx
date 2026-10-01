import { DayCell } from '@/features/calendar/components/DayCell'
import {
  dayKey,
  isSameMonth,
  monthGrid,
  weekdayLabels,
} from '@/features/calendar/lib/calendar-meta'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/types/calendar'

interface MonthGridProps {
  month: Date
  eventsByDay: Record<string, CalendarEvent[]>
  selectedDay: Date | null
  onSelectDay: (day: Date) => void
  onAddOnDay: (day: Date) => void
  onOpenEvent: (event: CalendarEvent) => void
}

export function MonthGrid({
  month,
  eventsByDay,
  selectedDay,
  onSelectDay,
  onAddOnDay,
  onOpenEvent,
}: MonthGridProps) {
  const days = monthGrid(month)
  const selectedKey = selectedDay ? dayKey(selectedDay) : null

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1.5">
        {weekdayLabels.map((label) => (
          <span
            key={label}
            className="text-muted-foreground px-1 text-[11px] font-semibold tracking-wide uppercase"
          >
            {label}
          </span>
        ))}
      </div>

      <div className={cn('grid grid-cols-7 gap-1.5')}>
        {days.map((day) => {
          const key = dayKey(day)
          return (
            <DayCell
              key={key}
              day={day}
              events={eventsByDay[key] ?? []}
              isOutside={!isSameMonth(day, month)}
              isSelected={key === selectedKey}
              onSelect={onSelectDay}
              onAdd={onAddOnDay}
              onOpenEvent={onOpenEvent}
            />
          )
        })}
      </div>
    </div>
  )
}
