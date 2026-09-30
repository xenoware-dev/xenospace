import { useDraggable } from '@dnd-kit/core'
import { CheckCircle2 } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { eventKindMeta, priorityAccent } from '@/features/calendar/lib/calendar-meta'
import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CalendarEvent } from '@/types/calendar'

interface ChipProps {
  event: CalendarEvent
  /** Month cells are short on room, so they drop the owner and the reference. */
  compact?: boolean
  onOpen?: (event: CalendarEvent) => void
}

/** The chip as it looks in place, and as it looks riding the drag overlay. */
export function ChipFace({
  event,
  compact,
  isDragging,
  onOpen,
}: ChipProps & { isDragging?: boolean }) {
  const meta = eventKindMeta[event.kind]
  const Icon = meta.icon

  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(event) : undefined}
      onKeyDown={
        onOpen
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onOpen(event)
              }
            }
          : undefined
      }
      className={cn(
        'group/chip relative flex w-full items-center gap-1.5 overflow-hidden rounded-lg py-1 pr-1.5 pl-2.5 text-left',
        'transition-shadow duration-[var(--motion-control)] ease-[var(--ease-glass)]',
        'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
        meta.chip,
        onOpen && 'cursor-grab active:cursor-grabbing',
        isDragging ? 'shadow-[var(--glass-shadow)]' : 'hover:shadow-[var(--glass-shadow-sm)]',
        event.isDone && 'opacity-55'
      )}
      title={`${meta.label}: ${event.title}`}
    >
      {/* The leading rule is how a layer is told apart at a glance. */}
      <span
        className={cn('absolute inset-y-1 left-0.5 w-1 rounded-full', meta.rail)}
        aria-hidden
      />

      {event.isDone ? (
        <CheckCircle2 className="text-success size-3 shrink-0" aria-hidden />
      ) : (
        <Icon
          className={cn('size-3 shrink-0', priorityAccent[event.priority] ?? 'text-muted-foreground')}
          aria-hidden
        />
      )}

      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[11px] leading-tight font-medium',
          event.isDone && 'line-through'
        )}
      >
        {event.title}
      </span>

      {!compact && event.reference && (
        <span className="text-muted-foreground shrink-0 font-mono text-[10px] tracking-wider">
          {event.reference}
        </span>
      )}

      {!compact && event.owner && (
        <Avatar className="size-4 shrink-0" title={event.owner.name}>
          <AvatarImage src={event.owner.avatarUrl ?? undefined} alt={event.owner.name} />
          <AvatarFallback className="text-[7px]">{getInitials(event.owner.name)}</AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}

/**
 * Chips are dragged onto another day to reschedule. Completed work is left
 * fixed — moving a date that has already been met is never what was meant.
 */
export function EventChip({ event, compact, onOpen }: ChipProps) {
  const draggable = !event.isDone
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: event.id,
    data: { type: 'event', event },
    disabled: !draggable,
  })

  return (
    <div
      ref={setNodeRef}
      // `touch-none` lets a touch drag beat the cell's own scrolling.
      className={cn('touch-none', isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
    >
      <ChipFace event={event} compact={compact} onOpen={onOpen} />
    </div>
  )
}
