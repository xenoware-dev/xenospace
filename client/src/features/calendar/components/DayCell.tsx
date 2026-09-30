import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { format } from 'date-fns'

import { EventChip } from '@/features/calendar/components/EventChip'
import {
  dayKey,
  isToday,
  isWeekend,
  sortEvents,
} from '@/features/calendar/lib/calendar-meta'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/types/calendar'

interface DayCellProps {
  day: Date
  events: CalendarEvent[]
  /** Days either side of the month being drawn are dimmed, not hidden. */
  isOutside?: boolean
  isSelected?: boolean
  /** How many chips fit before the cell folds the rest into a counter. */
  maxChips?: number
  onSelect: (day: Date) => void
  onAdd: (day: Date) => void
  onOpenEvent: (event: CalendarEvent) => void
  className?: string
}

export function DayCell({
  day,
  events,
  isOutside,
  isSelected,
  maxChips = 3,
  onSelect,
  onAdd,
  onOpenEvent,
  className,
}: DayCellProps) {
  const key = dayKey(day)
  const { setNodeRef, isOver } = useDroppable({ id: `day:${key}`, data: { type: 'day', key } })

  const ordered = sortEvents(events)
  const shown = ordered.slice(0, maxChips)
  const hidden = ordered.length - shown.length
  const today = isToday(day)

  return (
    <div
      ref={setNodeRef}
      onClick={() => onSelect(day)}
      className={cn(
        'group/day relative flex min-h-24 flex-col gap-1 rounded-xl p-1.5 text-left',
        'transition-[background-color,box-shadow] duration-[var(--motion-control)] ease-[var(--ease-glass)]',
        isWeekend(day) ? 'bg-glass-control/40' : 'bg-glass-tile/25',
        isOutside && 'opacity-45',
        isSelected && 'glass-raised',
        // The drop target lifts to meet the chip rather than just changing tint.
        isOver && 'ring-data/60 bg-data/10 ring-2',
        className
      )}
    >
      <header className="flex items-center justify-between gap-1">
        <span
          className={cn(
            'flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
            today
              ? 'bg-data text-white'
              : isOutside
                ? 'text-muted-foreground'
                : 'text-foreground'
          )}
        >
          {format(day, 'd')}
        </span>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onAdd(day)
          }}
          aria-label={`Add a task due ${format(day, 'd MMMM yyyy')}`}
          className={cn(
            'hover:bg-glass-tile text-muted-foreground hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded-md',
            'opacity-0 transition-opacity duration-[var(--motion-control)] group-hover/day:opacity-100 focus-visible:opacity-100'
          )}
        >
          <Plus className="size-3" />
        </button>
      </header>

      <div className="flex min-h-0 flex-col gap-1">
        {shown.map((event) => (
          <EventChip key={event.id} event={event} compact onOpen={onOpenEvent} />
        ))}

        {hidden > 0 && (
          <button
            type="button"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation()
              onSelect(day)
            }}
            className="text-muted-foreground hover:text-foreground self-start px-1 text-[10px] font-medium transition-colors"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  )
}
