import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin, rectIntersection,
  useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  EVENT_KINDS, createEventSchema, type CalendarEvent, type Paginated, type Task,
} from '@xenospace/shared';
import { api, errorMessage } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { longDate, pluralise, shortDate, timeOfDay, titleCase, toDateTimeInput } from '@/lib/format.js';
import { useFilters, useQueryFlag } from '@/hooks/useFilters.js';
import { useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Stat } from '@/components/ui/Stat.jsx';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { UserChip } from '@/components/ui/Avatar.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { useToast } from '@/components/ui/Toast.jsx';
import { Drawer, Modal } from '@/components/ui/Modal.jsx';
import { Checkbox, Select, TextArea, TextInput } from '@/components/ui/Field.jsx';
import { SegmentedControl } from '@/components/ui/Tabs.jsx';
import { FilterSelect } from '@/components/ui/Toolbar.jsx';
import { MemberPicker } from '@/components/MemberPicker.jsx';
import { Markdown } from '@/components/Markdown.jsx';
import { TaskComposer } from '@/components/TaskComposer.jsx';
import {
  Calendar as CalendarIcon, Check, ChevronLeft, ChevronRight, External, Inbox, Plus, Trash,
} from '@/components/icons.jsx';

const KIND_COLOR: Record<string, string> = {
  MEETING: 'var(--series-1)',
  STANDUP: 'var(--series-3)',
  REVIEW: 'var(--series-7)',
  RETRO: 'var(--series-5)',
  RELEASE: 'var(--status-good)',
  DEADLINE: 'var(--status-critical)',
  LEAVE: 'var(--series-4)',
  OTHER: 'var(--ink-faint)',
};

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  URGENT: 'var(--status-critical)',
  HIGH: 'var(--status-warning)',
  MEDIUM: 'var(--ink-muted)',
  LOW: 'var(--ink-faint)',
};

/**
 * The day under the pointer wins. Overlap-based detection picks whichever cell
 * the chip covers most, which on 7-column cells is often the neighbour. The
 * keyboard sensor has no pointer, so it falls back to overlap.
 */
const dropUnderPointer: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const OPEN_STATUSES = 'BACKLOG,TODO,IN_PROGRESS,IN_REVIEW,BLOCKED';
const MAX_CHIPS = 3;

/* ------------------------------------------------------------- date helpers */

/**
 * Local YYYY-MM-DD. `toISOString()` is UTC, which files a task due on the 7th
 * under the 6th for anyone west of Greenwich.
 */
function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Monday on or before `date`; the week starts on Monday. */
function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return addDays(start, -((start.getDay() + 6) % 7));
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/* ----------------------------------------------------------------- the page */

type Item =
  | { kind: 'event'; event: CalendarEvent }
  | { kind: 'task'; task: Task };

/**
 * Calendar.
 *
 * Tasks by due date alongside events, on a Monday-first month grid. Dragging a
 * task onto a day sets its due date, and dragging it into the Unscheduled tray
 * clears it; the server still decides whether the viewer may edit that task.
 * Narrow screens get the agenda instead, where seven 40px columns are unreadable.
 */
export function CalendarPage() {
  const { allows, user } = useAuth();
  const { data: projects } = useProjectOptions();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useQueryFlag('new');
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => dayKey(new Date()));
  const [view, setView] = useState<'month' | 'agenda'>('month');
  const [taskDraftDue, setTaskDraftDue] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Task | null>(null);

  const { filters, setFilter } = useFilters({ projectId: '', scope: 'all' });
  const mine = filters.scope === 'mine';
  const todayKey = dayKey(new Date());

  // The grid runs Monday-to-Sunday around the month, so the leading and
  // trailing days carry their items too.
  const range = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const start = startOfWeek(first);
    const end = addDays(startOfWeek(last), 6);
    return { start, end, from: dayKey(start), to: dayKey(end) };
  }, [cursor]);

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let day = range.start; day <= range.end; day = addDays(day, 1)) out.push(day);
    return out;
  }, [range]);

  const scope = {
    projectId: filters.projectId || undefined,
    assigneeId: mine ? 'me' : undefined,
  };

  const eventsQuery = useQuery({
    queryKey: keys.events({ from: range.from, to: range.to, projectId: filters.projectId }),
    queryFn: () =>
      api.get<CalendarEvent[]>('/calendar', {
        from: range.start.toISOString(),
        // Exclusive upper bound: midnight after the last visible day.
        to: addDays(range.end, 1).toISOString(),
        projectId: filters.projectId || undefined,
      }),
  });

  const dueQuery = { ...scope, dueAfter: range.from, dueBefore: range.to, sort: 'dueDate', order: 'asc', pageSize: '100' };
  const tasksQuery = useQuery({
    queryKey: keys.tasks(dueQuery),
    queryFn: () => api.get<Paginated<Task>>('/tasks', dueQuery),
  });

  const trayQuery = { ...scope, unscheduled: 'true', status: OPEN_STATUSES, sort: 'priority', order: 'desc', pageSize: '50' };
  const unscheduled = useQuery({
    queryKey: keys.tasks(trayQuery),
    queryFn: () => api.get<Paginated<Task>>('/tasks', trayQuery),
  });

  const overdueQuery = { ...scope, overdue: 'true', pageSize: '1' };
  const overdue = useQuery({
    queryKey: keys.tasks(overdueQuery),
    queryFn: () => api.get<Paginated<Task>>('/tasks', overdueQuery),
  });

  // Today through Sunday: "this week" means what is left of it.
  const weekEnd = dayKey(addDays(startOfWeek(new Date()), 6));
  const weekQuery = { ...scope, dueAfter: todayKey, dueBefore: weekEnd, status: OPEN_STATUSES, pageSize: '100' };
  const week = useQuery({
    queryKey: keys.tasks(weekQuery),
    queryFn: () => api.get<Paginated<Task>>('/tasks', weekQuery),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, Item[]>();
    const push = (key: string, item: Item) => map.set(key, [...(map.get(key) ?? []), item]);
    for (const event of eventsQuery.data ?? []) {
      // A multi-day event appears on each day it touches. The end is
      // exclusive, so an event ending at midnight does not spill into the next day.
      const start = new Date(event.startsAt);
      const end = new Date(event.endsAt);
      let day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      do {
        push(dayKey(day), { kind: 'event', event });
        day = addDays(day, 1);
      } while (day < end);
    }
    for (const task of tasksQuery.data?.items ?? []) {
      if (task.dueDate) push(task.dueDate.slice(0, 10), { kind: 'task', task });
    }
    return map;
  }, [eventsQuery.data, tasksQuery.data]);

  const canMove = (task: Task) =>
    task.status !== 'DONE' &&
    (allows('task:update') ||
      (allows('task:update_own') && (task.assignee?.id === user?.id || task.reporter.id === user?.id)));

  /* ---------------------------------------------------------- drag to date */

  const sensors = useSensors(
    // A press that does not travel stays a click, so chips open and drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const reschedule = async (task: Task, dueDate: string | null) => {
    if ((task.dueDate?.slice(0, 10) ?? null) === dueDate) return;
    try {
      await api.patch<Task>(`/tasks/${task.id}`, { dueDate });
      toast.success(
        dueDate ? `${task.reference} due ${shortDate(parseDay(dueDate).toISOString())}` : `${task.reference} unscheduled`,
      );
    } catch (err) {
      toast.error('Could not reschedule', errorMessage(err));
    } finally {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    setDragging((event.active.data.current?.task as Task | undefined) ?? null);
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const task = event.active.data.current?.task as Task | undefined;
    const target = event.over?.id ? String(event.over.id) : null;
    if (!task || !target) return;
    if (target === 'unscheduled') void reschedule(task, null);
    else if (target.startsWith('day:')) void reschedule(task, target.slice(4));
  };

  /* ---------------------------------------------------------------- render */

  const monthLabel = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const loading = eventsQuery.isLoading || tasksQuery.isLoading;
  const failed = eventsQuery.error ?? tasksQuery.error;
  const weekItems = week.data?.items ?? [];
  const dueToday = weekItems.filter((task) => task.dueDate?.slice(0, 10) === todayKey).length;
  const selectedItems = byDay.get(selectedDay) ?? [];

  const openTask = (task: Task) => navigate(`/tasks/${task.id}`);
  const openItem = (item: Item) => (item.kind === 'task' ? openTask(item.task) : setSelected(item.event));

  const goToday = () => {
    setCursor(new Date());
    setSelectedDay(todayKey);
  };

  return (
    <Page
      title="Calendar"
      description="Due dates and events in one place. Drag a task onto a day to reschedule it."
      actions={
        <>
          {allows('task:create') && (
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setTaskDraftDue(selectedDay)}>
              Task
            </Button>
          )}
          {allows('calendar:create') && (
            <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreateOpen(true)}>
              New event
            </Button>
          )}
        </>
      }
      toolbar={
        <>
          <div className="flex items-center gap-1">
            <IconButton
              label="Previous month"
              size="sm"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            >
              <ChevronLeft size={15} />
            </IconButton>
            <Button variant="subtle" size="sm" className="rounded-full px-3" onClick={goToday}>Today</Button>
            <IconButton
              label="Next month"
              size="sm"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            >
              <ChevronRight size={15} />
            </IconButton>
            <h2 className="ml-2 min-w-36 text-sm font-semibold" aria-live="polite">{monthLabel}</h2>
          </div>
          <SegmentedControl
            size="sm"
            value={mine ? 'mine' : 'all'}
            onChange={(value) => setFilter('scope', value)}
            options={[
              { value: 'all', label: 'Everyone' },
              { value: 'mine', label: 'Mine' },
            ]}
          />
          <FilterSelect
            label="Project"
            value={filters.projectId}
            onChange={(value) => setFilter('projectId', value)}
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
          <span className="flex-1" />
          {/* Phones only get the agenda, so the switch would do nothing there. */}
          <div className="hidden sm:block">
            <SegmentedControl
              value={view}
              onChange={setView}
              size="sm"
              options={[
                { value: 'month', label: 'Month' },
                { value: 'agenda', label: 'Agenda' },
              ]}
            />
          </div>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Overdue"
          value={overdue.data?.total ?? '–'}
          tone={(overdue.data?.total ?? 0) > 0 ? 'critical' : 'default'}
          to={`/tasks?overdue=true${mine ? '&assigneeId=me' : ''}`}
        />
        <Stat label="Due today" value={week.data ? dueToday : '–'} tone={dueToday > 0 ? 'warning' : 'default'} />
        <Stat label="Due this week" value={week.data ? weekItems.length : '–'} hint="Through Sunday" />
        <Stat label="Unscheduled" value={unscheduled.data?.total ?? '–'} hint="Open, no due date" />
        <Stat label="Events" value={eventsQuery.data ? eventsQuery.data.length : '–'} hint="In view" />
      </div>

      {loading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <Skeleton className="h-[34rem] rounded-[var(--radius-xl)]" />
          <Skeleton className="h-[34rem] rounded-[var(--radius-xl)]" />
        </div>
      ) : failed ? (
        <ErrorState
          message="The calendar could not be loaded."
          onRetry={() => {
            void eventsQuery.refetch();
            void tasksQuery.refetch();
          }}
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={dropUnderPointer}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setDragging(null)}
        >
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
            {view === 'month' && (
              <Card padded={false} className="hidden p-2 sm:block">
                <div className="grid grid-cols-7 gap-1 pb-1">
                  {WEEKDAYS.map((label) => (
                    <div key={label} className="px-2 py-1.5 text-xs font-medium text-[var(--ink-muted)]">
                      {label}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {days.map((day) => {
                    const key = dayKey(day);
                    return (
                      <DayCell
                        key={key}
                        day={day}
                        dayKeyValue={key}
                        items={byDay.get(key) ?? []}
                        outside={day.getMonth() !== cursor.getMonth()}
                        today={key === todayKey}
                        selected={key === selectedDay}
                        onSelect={() => setSelectedDay(key)}
                        onAdd={allows('task:create') ? () => setTaskDraftDue(key) : undefined}
                        onOpen={openItem}
                        canMove={canMove}
                      />
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Agenda: the only form on small screens, and on request above. */}
            <Agenda
              className={cn(view === 'month' && 'sm:hidden')}
              byDay={byDay}
              fromKey={todayKey < range.from ? range.from : todayKey}
              toKey={range.to}
              onOpen={openItem}
            />

            <div className="flex flex-col gap-4">
              <DayPanel
                dayKeyValue={selectedDay}
                isToday={selectedDay === todayKey}
                items={selectedItems}
                onOpen={openItem}
                onAdd={allows('task:create') ? () => setTaskDraftDue(selectedDay) : undefined}
                canMove={canMove}
              />
              <UnscheduledTray
                tasks={unscheduled.data?.items ?? []}
                total={unscheduled.data?.total ?? 0}
                loading={unscheduled.isLoading}
                onOpen={openTask}
                canMove={canMove}
              />
            </div>
          </div>

          {/* Portalled: the glass panel's backdrop-filter makes it the containing
              block for fixed children, which would offset the overlay from the
              pointer and skew which day it is dropped on. */}
          {createPortal(
            <DragOverlay dropAnimation={null}>
              {dragging && (
                <div className="w-44 rotate-1 cursor-grabbing">
                  <ChipFace item={{ kind: 'task', task: dragging }} lifted />
                </div>
              )}
            </DragOverlay>,
            document.body,
          )}
        </DndContext>
      )}

      <CreateEventModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <TaskComposer
        open={taskDraftDue !== null}
        onClose={() => setTaskDraftDue(null)}
        defaultProjectId={filters.projectId || undefined}
        defaultDueDate={taskDraftDue ?? undefined}
      />

      {selected && <EventDrawer event={selected} onClose={() => setSelected(null)} />}
    </Page>
  );
}

/* -------------------------------------------------------------------- chips */

function itemKey(item: Item): string {
  return item.kind === 'task' ? `t:${item.task.id}` : `e:${item.event.id}`;
}

/** Events first by time, then tasks by priority; done work sinks. */
function sortItems(items: Item[]): Item[] {
  const rank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'event' ? -1 : 1;
    if (a.kind === 'event' && b.kind === 'event') return a.event.startsAt.localeCompare(b.event.startsAt);
    const ta = (a as { task: Task }).task;
    const tb = (b as { task: Task }).task;
    if ((ta.status === 'DONE') !== (tb.status === 'DONE')) return ta.status === 'DONE' ? 1 : -1;
    return rank[ta.priority] - rank[tb.priority];
  });
}

/** The chip's looks only; behaviour comes from whichever wrapper renders it. */
function ChipFace({ item, compact, lifted }: { item: Item; compact?: boolean; lifted?: boolean }) {
  const isTask = item.kind === 'task';
  const done = isTask && item.task.status === 'DONE';
  const rail = isTask ? (item.task.project?.color ?? 'var(--data)') : KIND_COLOR[item.event.kind];
  const title = isTask ? item.task.title : item.event.title;

  return (
    <span
      className={cn(
        'relative flex w-full items-center gap-1.5 overflow-hidden rounded-[var(--radius-sm)] py-1 pr-1.5 pl-2.5 text-left',
        isTask ? 'glass-raised' : 'bg-[var(--glass-tile)]',
        lifted && 'shadow-[var(--shadow-lg)] ring-1 ring-[var(--data)]/50',
        done && 'opacity-55',
      )}
    >
      <span aria-hidden="true" className="absolute inset-y-1 left-0.5 w-[3px] rounded-full" style={{ background: rail }} />
      {isTask ? (
        done ? (
          <Check size={10} aria-hidden="true" className="shrink-0 text-[var(--status-good)]" />
        ) : (
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: PRIORITY_COLOR[item.task.priority] }}
          />
        )
      ) : (
        !item.event.allDay && (
          <span className="shrink-0 text-[10px] text-[var(--ink-muted)] tabular-nums">{timeOfDay(item.event.startsAt)}</span>
        )
      )}
      <span className={cn('min-w-0 flex-1 truncate text-[11px] leading-tight font-medium', done && 'line-through')}>
        {title}
      </span>
      {!compact && isTask && (
        <span className="shrink-0 font-mono text-[10px] text-[var(--ink-faint)]">{item.task.reference}</span>
      )}
    </span>
  );
}

/**
 * A chip that opens on click and, for a task the viewer may edit, drags. The
 * same task can be on screen twice (cell and day panel), so the drag id carries
 * where it came from.
 */
function Chip({
  item,
  source,
  compact,
  onOpen,
  movable,
}: {
  item: Item;
  source: string;
  compact?: boolean;
  onOpen: (item: Item) => void;
  movable: boolean;
}) {
  const task = item.kind === 'task' ? item.task : null;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${source}:${itemKey(item)}`,
    data: { task },
    disabled: !task || !movable,
  });
  const label = task
    ? `${task.reference} ${task.title}${movable ? '. Drag to reschedule.' : ''}`
    : `${item.kind === 'event' ? item.event.title : ''}`;

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-label={label}
      title={task ? `${task.reference} · ${task.title}` : item.kind === 'event' ? item.event.title : undefined}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(item);
      }}
      className={cn(
        'block w-full rounded-[var(--radius-sm)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        movable && 'cursor-grab touch-none',
        isDragging && 'opacity-30',
      )}
    >
      <ChipFace item={item} compact={compact} />
    </button>
  );
}

/* ---------------------------------------------------------------- day cell */

function DayCell({
  day,
  dayKeyValue,
  items,
  outside,
  today,
  selected,
  onSelect,
  onAdd,
  onOpen,
  canMove,
}: {
  day: Date;
  dayKeyValue: string;
  items: Item[];
  outside: boolean;
  today: boolean;
  selected: boolean;
  onSelect: () => void;
  onAdd?: () => void;
  onOpen: (item: Item) => void;
  canMove: (task: Task) => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayKeyValue}` });
  const ordered = sortItems(items);
  const shown = ordered.slice(0, MAX_CHIPS);
  const hidden = ordered.length - shown.length;
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  const label = day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      className={cn(
        'group/day flex min-h-28 min-w-0 flex-col gap-1 rounded-[var(--radius-md)] p-1.5',
        'transition-[background-color,box-shadow] duration-[var(--duration-fast)]',
        weekend ? 'bg-[var(--glass-control)]' : 'bg-[var(--glass-tile)]',
        outside && 'opacity-45',
        selected && 'glass-raised',
        isOver && 'bg-[color-mix(in_oklch,var(--data)_14%,transparent)] ring-2 ring-[var(--data)]/60',
      )}
    >
      <header className="flex items-center justify-between gap-1">
        {/* The cell's click is a mouse nicety; this button is the keyboard path. */}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
          aria-label={`Show ${label}${items.length ? `, ${pluralise(items.length, 'item')}` : ''}`}
          aria-pressed={selected}
          aria-current={today ? 'date' : undefined}
          className={cn(
            'grid size-6 place-items-center rounded-full text-[11px] font-semibold tabular-nums',
            'focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
            today
              ? 'bg-[var(--data)] text-white'
              : outside
                ? 'text-[var(--ink-muted)] hover:text-[var(--ink-primary)]'
                : 'text-[var(--ink-primary)]',
          )}
        >
          {day.getDate()}
        </button>
        {onAdd && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onAdd();
            }}
            aria-label={`Add a task due ${label}`}
            className={cn(
              'grid size-5 place-items-center rounded-[var(--radius-xs)] text-[var(--ink-muted)]',
              'opacity-0 transition-opacity group-hover/day:opacity-100 hover:bg-[var(--glass-tile)] hover:text-[var(--ink-primary)]',
              'focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
            )}
          >
            <Plus size={12} />
          </button>
        )}
      </header>

      <div className="flex min-w-0 flex-col gap-1">
        {shown.map((item) => (
          <Chip
            key={itemKey(item)}
            item={item}
            source={`cell-${dayKeyValue}`}
            compact
            onOpen={onOpen}
            movable={item.kind === 'task' && canMove(item.task)}
          />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            className="self-start px-1 text-[10px] font-medium text-[var(--ink-muted)] hover:text-[var(--ink-primary)]"
          >
            +{hidden} more
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- side panel */

function PanelCard({ title, aside, children, className, dropRef }: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  dropRef?: (node: HTMLElement | null) => void;
}) {
  return (
    <section ref={dropRef} className={cn('glass-tile rounded-[var(--radius-xl)] p-4 transition-[background-color,box-shadow]', className)}>
      <header className="mb-3 flex items-center gap-2">
        <h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

function DayPanel({
  dayKeyValue,
  isToday,
  items,
  onOpen,
  onAdd,
  canMove,
}: {
  dayKeyValue: string;
  isToday: boolean;
  items: Item[];
  onOpen: (item: Item) => void;
  onAdd?: () => void;
  canMove: (task: Task) => boolean;
}) {
  const date = parseDay(dayKeyValue);
  const ordered = sortItems(items);

  return (
    <PanelCard
      title={
        <>
          {isToday ? 'Today' : date.toLocaleDateString('en-GB', { weekday: 'long' })}
          <span className="truncate text-xs font-normal text-[var(--ink-muted)]">
            {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
          </span>
        </>
      }
      aside={
        onAdd && (
          <IconButton label="Add a task due this day" size="xs" onClick={onAdd}>
            <Plus size={13} />
          </IconButton>
        )
      }
    >
      {ordered.length === 0 ? (
        <p className="text-xs text-[var(--ink-muted)]">
          Nothing due{isToday ? ' today' : ''}. Drag a task here from the tray, or onto any day.
        </p>
      ) : (
        <ul className="flex max-h-80 flex-col gap-1.5 overflow-y-auto scrollbar-none">
          {ordered.map((item) => (
            <li key={itemKey(item)}>
              <Chip
                item={item}
                source="panel"
                onOpen={onOpen}
                movable={item.kind === 'task' && canMove(item.task)}
              />
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}

/**
 * Open tasks nobody has dated. Drag one onto a day to schedule it; the tray is a
 * drop target too, so dragging a dated chip back here clears its date.
 */
function UnscheduledTray({
  tasks,
  total,
  loading,
  onOpen,
  canMove,
}: {
  tasks: Task[];
  total: number;
  loading: boolean;
  onOpen: (task: Task) => void;
  canMove: (task: Task) => boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' });

  return (
    <PanelCard
      dropRef={setNodeRef}
      className={cn(isOver && 'bg-[color-mix(in_oklch,var(--data)_14%,transparent)] ring-2 ring-[var(--data)]/60')}
      title={
        <>
          <Inbox size={15} aria-hidden="true" className="text-[var(--ink-muted)]" />
          Unscheduled
        </>
      }
      aside={
        total > 0 && (
          <span className="glass-control rounded-full px-2 py-0.5 text-[10px] text-[var(--ink-muted)] tabular-nums">{total}</span>
        )
      }
    >
      {loading ? (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-6" />)}
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-xs text-[var(--ink-muted)]">
          Every open task has a date. Drop a chip here to take its date off.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs text-[var(--ink-muted)]">Drag one onto a day to schedule it.</p>
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto scrollbar-none">
            {tasks.map((task) => (
              <li key={task.id}>
                <Chip
                  item={{ kind: 'task', task }}
                  source="tray"
                  onOpen={(item) => item.kind === 'task' && onOpen(item.task)}
                  movable={canMove(task)}
                />
              </li>
            ))}
          </ul>
          {total > tasks.length && (
            <p className="mt-2 text-2xs text-[var(--ink-faint)]">Showing the {tasks.length} highest priority.</p>
          )}
        </>
      )}
    </PanelCard>
  );
}

/* -------------------------------------------------------------------- agenda */

function Agenda({
  byDay,
  fromKey,
  toKey,
  onOpen,
  className,
}: {
  byDay: Map<string, Item[]>;
  fromKey: string;
  toKey: string;
  onOpen: (item: Item) => void;
  className?: string;
}) {
  const groups = [...byDay.entries()]
    .filter(([key]) => key >= fromKey && key <= toKey)
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <Card className={className} padded={false}>
      <div className="px-4 pt-4">
        <CardHeader title="Agenda" subtitle="Upcoming in this view" />
      </div>
      {groups.length === 0 ? (
        <EmptyState icon={<CalendarIcon size={18} />} title="Nothing scheduled" compact />
      ) : (
        <ol className="mt-2 flex flex-col gap-4 px-4 pb-4">
          {groups.map(([key, items]) => (
            <li key={key}>
              <h3 className="mb-1.5 text-xs font-medium text-[var(--ink-muted)]">
                {parseDay(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <ul className="flex flex-col gap-1">
                {sortItems(items).map((item) => (
                  <li key={itemKey(item)}>
                    <button
                      type="button"
                      onClick={() => onOpen(item)}
                      className="block w-full rounded-[var(--radius-sm)] focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none"
                    >
                      <ChipFace item={item} />
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function EventDrawer({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const { allows, user } = useAuth();
  const isOrganizer = event.organizer.id === user?.id;
  const myResponse = event.attendees.find((a) => a.user.id === user?.id)?.response;

  const rsvp = useMutate(
    (response: string) => api.post<CalendarEvent>(`/calendar/${event.id}/rsvp`, { response }),
    { invalidates: [['calendar'], ['dashboard']], successMessage: 'Response sent' },
  );

  const remove = useMutate(() => api.delete(`/calendar/${event.id}`), {
    invalidates: [['calendar'], ['dashboard']],
    successMessage: 'Event cancelled',
    onSuccess: onClose,
  });

  return (
    <Drawer
      open
      onClose={onClose}
      title={event.title}
      description={
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 rounded-full" style={{ background: KIND_COLOR[event.kind] }} />
          {titleCase(event.kind)}
        </span>
      }
      footer={
        <>
          {event.meetingUrl && (
            <Button
              variant="secondary"
              icon={<External size={14} />}
              onClick={() => window.open(event.meetingUrl!, '_blank', 'noopener,noreferrer')}
            >
              Join
            </Button>
          )}
          {(isOrganizer || allows('calendar:delete')) && (
            <Button variant="danger" icon={<Trash size={14} />} loading={remove.isPending} onClick={() => remove.mutate(undefined as never)}>
              Cancel event
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="text-sm font-medium">{longDate(event.startsAt)}</p>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            {event.allDay ? 'All day' : `${timeOfDay(event.startsAt)} – ${timeOfDay(event.endsAt)}`}
          </p>
          {event.recurrenceRule && (
            <Badge tone="neutral" size="sm" className="mt-2">Repeats</Badge>
          )}
        </div>

        {event.description && (
          <div>
            <h3 className="mb-1.5 text-xs font-medium text-[var(--ink-muted)]">Details</h3>
            <Markdown content={event.description} />
          </div>
        )}

        {event.location && (
          <div>
            <h3 className="mb-1 text-xs font-medium text-[var(--ink-muted)]">Location</h3>
            <p className="text-xs">{event.location}</p>
          </div>
        )}

        {myResponse && (
          <div>
            <h3 className="mb-2 text-xs font-medium text-[var(--ink-muted)]">
              Your response
            </h3>
            <div className="flex gap-1.5">
              {(['ACCEPTED', 'TENTATIVE', 'DECLINED'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  disabled={rsvp.isPending}
                  onClick={() => rsvp.mutate(option)}
                  className={cn(
                    'rounded-[var(--radius-sm)] px-2.5 py-1.5 text-2xs font-medium transition-colors',
                    myResponse === option
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                      : 'bg-[var(--surface-3)] text-[var(--ink-secondary)] hover:bg-[var(--wash-active)]',
                  )}
                >
                  {option === 'ACCEPTED' ? 'Going' : option === 'TENTATIVE' ? 'Maybe' : 'Not going'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="mb-2 text-xs font-medium text-[var(--ink-muted)]">
            Attendees ({event.attendees.length})
          </h3>
          <ul className="flex flex-col gap-2">
            {event.attendees.map((attendee) => (
              <li key={attendee.user.id} className="flex items-center justify-between gap-2">
                <UserChip user={attendee.user} showPresence />
                <Badge
                  tone={
                    attendee.response === 'ACCEPTED'
                      ? 'good'
                      : attendee.response === 'DECLINED'
                        ? 'critical'
                        : attendee.response === 'TENTATIVE'
                          ? 'warning'
                          : 'neutral'
                  }
                  size="sm"
                  dot
                >
                  {attendee.response === 'PENDING' ? 'No reply' : titleCase(attendee.response)}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-[var(--line-subtle)] pt-4">
          <h3 className="mb-2 text-xs font-medium text-[var(--ink-muted)]">Organiser</h3>
          <UserChip user={event.organizer} size="md" showPresence />
        </div>
      </div>
    </Drawer>
  );
}

function CreateEventModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: projects } = useProjectOptions();
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<CalendarEvent['kind']>('MEETING');
  // Defaults to the next whole hour, one hour long.
  const [startsAt, setStartsAt] = useState(() => {
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return toDateTimeInput(next.toISOString());
  });
  const [endsAt, setEndsAt] = useState(() => {
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 2);
    return toDateTimeInput(next.toISOString());
  });
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutate((input: unknown) => api.post<CalendarEvent>('/calendar', input), {
    invalidates: [['calendar'], ['dashboard']],
    successMessage: 'Event created',
    errorMessage: 'Could not create the event',
    onSuccess: () => {
      setTitle(''); setDescription(''); setLocation(''); setMeetingUrl('');
      setAttendeeIds([]); setErrors({});
      onClose();
    },
  });

  const submit = () => {
    const parsed = createEventSchema.safeParse({
      projectId: projectId || undefined,
      title,
      description: description || undefined,
      kind,
      // datetime-local has no zone, so it is read as local and sent as UTC.
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      allDay,
      location: location || undefined,
      meetingUrl: meetingUrl || undefined,
      attendeeIds,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New event"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={create.isPending}>Create event</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextInput
          label="Title"
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          placeholder="Sprint planning"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Type" value={kind} onChange={(e) => setKind(e.target.value as CalendarEvent['kind'])}>
            {EVENT_KINDS.map((option) => (
              <option key={option} value={option}>{titleCase(option)}</option>
            ))}
          </Select>
          <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Personal — no project</option>
            {(projects ?? []).map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="Starts"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            error={errors.startsAt}
          />
          <TextInput
            label="Ends"
            type="datetime-local"
            required
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            error={errors.endsAt}
          />
        </div>

        <Checkbox label="All day" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote" />
          <TextInput
            label="Meeting link"
            type="url"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            error={errors.meetingUrl}
            placeholder="https://meet.example.com/abc"
          />
        </div>

        <TextArea
          label="Details"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          hint="Markdown is supported."
        />

        <MemberPicker
          label="Attendees"
          hint="You are added as the organiser automatically."
          selected={attendeeIds}
          onChange={setAttendeeIds}
          projectId={projectId || undefined}
        />
      </div>
    </Modal>
  );
}
