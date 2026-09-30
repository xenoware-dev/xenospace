import { format } from 'date-fns'
import { CalendarPlus, Sun } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EventChip } from '@/features/calendar/components/EventChip'
import { eventKindMeta, isToday, sortEvents } from '@/features/calendar/lib/calendar-meta'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/types/calendar'

interface DayPeekProps {
  day: Date | null
  events: CalendarEvent[]
  onAdd: (day: Date) => void
  onOpenEvent: (event: CalendarEvent) => void
}

/** Everything on one day, in full — the grid cell only has room for a few. */
export function DayPeek({ day, events, onAdd, onOpenEvent }: DayPeekProps) {
  if (!day) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
          <span className="glass-tile flex size-10 items-center justify-center rounded-full">
            <Sun className="size-4" />
          </span>
          Pick a day to see everything on it.
        </CardContent>
      </Card>
    )
  }

  const ordered = sortEvents(events)
  const counts = ordered.reduce<Record<string, number>>((tally, event) => {
    tally[event.kind] = (tally[event.kind] ?? 0) + 1
    return tally
  }, {})

  return (
    // Keyed on the day so switching days replays the shared tab motion.
    <Card key={format(day, 'yyyy-MM-dd')} className="animate-tab-enter gap-4">
      <CardHeader>
        <CardTitle className="flex items-baseline justify-between gap-2">
          <span className={cn('text-base', isToday(day) && 'text-data')}>
            {isToday(day) ? 'Today' : format(day, 'EEEE')}
          </span>
          <span className="text-muted-foreground text-xs font-normal tabular-nums">
            {format(day, 'd MMM yyyy')}
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {ordered.length > 0 && (
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            {Object.entries(counts).map(([kind, count]) => {
              const meta = eventKindMeta[kind as CalendarEvent['kind']]
              return (
                <span key={kind} className="flex items-center gap-1.5">
                  <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden />
                  {count} {count === 1 ? meta.noun : meta.nounPlural}
                </span>
              )
            })}
          </div>
        )}

        {ordered.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing due on this day.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {ordered.map((event) => (
              <div key={event.id} className="flex flex-col gap-0.5">
                <EventChip event={event} onOpen={onOpenEvent} />
                {event.kind !== 'TASK' && (
                  <Link
                    to={`/projects/${event.sourceId}`}
                    className="text-muted-foreground hover:text-foreground pl-2.5 text-[10px] transition-colors"
                  >
                    Open project →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}

        <Button variant="outline" size="sm" className="justify-start" onClick={() => onAdd(day)}>
          <CalendarPlus />
          Add a task on this day
        </Button>
      </CardContent>
    </Card>
  )
}
