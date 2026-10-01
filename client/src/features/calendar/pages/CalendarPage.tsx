import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { AxiosError } from 'axios'
import { eachDayOfInterval, isSameDay, parseISO } from 'date-fns'
import { CalendarDays, ChevronLeft, ChevronRight, Columns3, Rows3 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AgendaList } from '@/features/calendar/components/AgendaList'
import { DayPeek } from '@/features/calendar/components/DayPeek'
import { ChipFace } from '@/features/calendar/components/EventChip'
import { MonthGrid } from '@/features/calendar/components/MonthGrid'
import { UnscheduledTray } from '@/features/calendar/components/UnscheduledTray'
import { WeekGrid } from '@/features/calendar/components/WeekGrid'
import {
  dayFromKey,
  dayKey,
  dayToIso,
  eventKindMeta,
  groupByDay,
  projectAsEvents,
  rangeLabel,
  shiftCursor,
  taskAsEvent,
  visibleRange,
} from '@/features/calendar/lib/calendar-meta'
import { TaskFormDialog } from '@/features/tasks/components/TaskFormDialog'
import { cn } from '@/lib/utils'
import { calendarApi } from '@/services/calendar.service'
import { projectApi } from '@/services/project.service'
import { taskApi, taskListApi } from '@/services/task.service'
import { userApi } from '@/services/user.service'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { User } from '@/types/auth'
import {
  CALENDAR_EVENT_KINDS,
  type CalendarEvent,
  type CalendarEventKind,
  type CalendarSummary,
  type CalendarView,
} from '@/types/calendar'
import type { Project } from '@/types/project'
import type { Task, TaskList } from '@/types/task'

const ALL = '__all__'
const NO_PROJECT = 'none'
/** The tray is a staging area, not a backlog — a screenful is enough. */
const TRAY_LIMIT = 50

export default function CalendarPage() {
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)

  const [view, setView] = useState<CalendarView>('month')
  const [cursor, setCursor] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => new Date())
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const [project, setProject] = useState<string>(ALL)
  const [layers, setLayers] = useState<CalendarEventKind[]>([...CALENDAR_EVENT_KINDS])
  const [showCompleted, setShowCompleted] = useState(false)

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [summary, setSummary] = useState<CalendarSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [unscheduled, setUnscheduled] = useState<Task[]>([])
  const [isTrayLoading, setIsTrayLoading] = useState(true)

  const [lists, setLists] = useState<TaskList[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])

  const [editing, setEditing] = useState<Task | undefined>(undefined)
  const [draftDueDate, setDraftDueDate] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)

  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null)

  const failed = (error: unknown, fallback: string) =>
    toast.error(
      error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
    )

  const range = useMemo(() => visibleRange(view, cursor), [view, cursor])

  const params = useMemo(
    () => ({
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      mine: scope === 'mine' || undefined,
      project: project === ALL ? undefined : project,
      includeDone: showCompleted || undefined,
      kinds: layers.join(','),
    }),
    [range, scope, project, showCompleted, layers]
  )

  const loadEvents = useCallback(() => {
    setIsLoading(true)
    calendarApi
      .events(params)
      .then(({ data }) => setEvents(data.events))
      .catch((error: unknown) => failed(error, 'Unable to load the calendar'))
      .finally(() => setIsLoading(false))
  }, [params])

  useEffect(loadEvents, [loadEvents])

  const loadSummary = useCallback(() => {
    calendarApi
      .summary()
      .then(({ data }) => setSummary(data.summary))
      .catch(() => setSummary(null))
  }, [])

  useEffect(loadSummary, [loadSummary])

  const loadTray = useCallback(() => {
    setIsTrayLoading(true)
    taskApi
      .list({
        due: 'none',
        limit: TRAY_LIMIT,
        sort: 'priority',
        mine: scope === 'mine' || undefined,
        project: project === ALL ? undefined : project,
      })
      .then(({ data }) => setUnscheduled(data.tasks))
      .catch(() => setUnscheduled([]))
      .finally(() => setIsTrayLoading(false))
  }, [scope, project])

  useEffect(loadTray, [loadTray])

  useEffect(() => {
    taskListApi
      .list()
      .then(({ data }) => setLists(data.lists))
      .catch(() => setLists([]))
    projectApi
      .list({ limit: 100, sort: 'name' })
      .then(({ data }) => setProjects(data.projects))
      .catch(() => setProjects([]))
    userApi
      .list({ limit: 100, status: 'active' })
      .then(({ data }) => setUsers(data.users))
      .catch(() => setUsers([]))
  }, [])

  // Rescheduling moves the sidebar badges and the dashboard totals too.
  const refreshWorkspace = useWorkspaceStore((s) => s.load)
  const syncCounts = useCallback(() => {
    loadSummary()
    void refreshWorkspace()
  }, [loadSummary, refreshWorkspace])

  const eventsByDay = useMemo(() => groupByDay(events), [events])

  const selectedEvents = useMemo(
    () => (selectedDay ? (eventsByDay[dayKey(selectedDay)] ?? []) : []),
    [eventsByDay, selectedDay]
  )

  const agendaDays = useMemo(
    () => eachDayOfInterval({ start: range.from, end: new Date(range.to.getTime() - 1) }),
    [range]
  )

  /**
   * A task's chip and its tray entry are two views of one record, so every write
   * lands here: whether it has a date decides which of the two it belongs in.
   */
  const applyTask = useCallback((task: Task) => {
    const event = taskAsEvent(task)
    setEvents((previous) => {
      const rest = previous.filter((item) => item.id !== event.id)
      return task.dueDate ? [...rest, event] : rest
    })
    setUnscheduled((previous) => {
      const rest = previous.filter((item) => item.id !== task.id)
      return task.dueDate ? rest : [task, ...rest]
    })
  }, [])

  const applyProject = useCallback(
    (updated: Project) => {
      setEvents((previous) => [
        // Both of a project's milestones are rebuilt from the row that came back.
        ...previous.filter((item) => item.kind === 'TASK' || item.sourceId !== updated.id),
        ...projectAsEvents(updated).filter((item) => layers.includes(item.kind)),
      ])
    },
    [layers]
  )

  const reschedule = async (event: CalendarEvent, iso: string | null) => {
    try {
      if (event.kind === 'TASK') {
        const { data } = await taskApi.update(event.sourceId, { dueDate: iso })
        applyTask(data.task)
      } else {
        const { data } = await projectApi.update(
          event.sourceId,
          event.kind === 'PROJECT_START' ? { startDate: iso } : { dueDate: iso }
        )
        applyProject(data.project)
      }
      syncCounts()
    } catch (error) {
      failed(error, 'Unable to reschedule that')
      // The server refused the move, so take its arrangement back.
      loadEvents()
    }
  }

  const sensors = useSensors(
    // A small threshold keeps a click on a chip from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor)
  )

  /**
   * Day cells are a grid of equal rectangles, so the pointer is a far better
   * guide than rect overlap; the intersection fallback is what keyboard dragging
   * falls back on, having no pointer at all.
   */
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const underPointer = pointerWithin(args)
    return underPointer.length > 0 ? underPointer : rectIntersection(args)
  }, [])

  const handleDragStart = (dragEvent: DragStartEvent) =>
    setActiveEvent((dragEvent.active.data.current?.event as CalendarEvent | undefined) ?? null)

  const handleDragEnd = (dragEvent: DragEndEvent) => {
    const event = activeEvent ?? (dragEvent.active.data.current?.event as CalendarEvent | undefined)
    setActiveEvent(null)

    const target = dragEvent.over?.data.current
    if (!event || !target) return

    if (target.type === 'day') {
      const day = dayFromKey(String(target.key))
      // A chip dropped back on its own day is not a move.
      if (event.date && isSameDay(parseISO(event.date), day)) return
      void reschedule(event, dayToIso(day))
      return
    }

    if (target.type === 'unscheduled') {
      if (event.kind !== 'TASK') {
        toast.error('Only tasks can be unscheduled — a project keeps its dates')
        return
      }
      if (!event.date) return
      void reschedule(event, null)
    }
  }

  const openEvent = async (event: CalendarEvent) => {
    if (event.kind !== 'TASK') {
      navigate(`/projects/${event.sourceId}`)
      return
    }
    try {
      // The chip only carries what it needs to draw, so the card is fetched whole.
      const { data } = await taskApi.get(event.sourceId)
      setEditing(data.task)
      setDraftDueDate('')
      setIsFormOpen(true)
    } catch (error) {
      failed(error, 'Unable to open that task')
    }
  }

  const addOnDay = (day: Date) => {
    setEditing(undefined)
    setDraftDueDate(dayKey(day))
    setIsFormOpen(true)
  }

  const toggleLayer = (kind: CalendarEventKind) =>
    setLayers((previous) =>
      previous.includes(kind)
        ? // Turning the last layer off would empty the calendar with no way back.
          previous.length === 1
          ? previous
          : previous.filter((item) => item !== kind)
        : [...previous, kind]
    )

  const goToday = () => {
    const today = new Date()
    setCursor(today)
    setSelectedDay(today)
  }

  const label = rangeLabel(view, cursor)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Calendar"
        description="Everything with a date on it — drag a card to another day to move it"
        action={
          <Tabs value={view} onValueChange={(value) => setView(value as CalendarView)}>
            <TabsList>
              <TabsTrigger value="month">
                <CalendarDays />
                Month
              </TabsTrigger>
              <TabsTrigger value="week">
                <Columns3 />
                Week
              </TabsTrigger>
              <TabsTrigger value="agenda">
                <Rows3 />
                Agenda
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatTile label="Overdue" value={summary.overdue} />
          <StatTile label="Due today" value={summary.dueToday} />
          <StatTile label="Due this week" value={summary.dueThisWeek} />
          <StatTile label="Unscheduled" value={summary.unscheduled} />
          <StatTile label="Projects due" value={summary.projectsDueThisWeek} />
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveEvent(null)}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor((current) => shiftCursor(view, current, -1))}
              aria-label="Previous"
            >
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCursor((current) => shiftCursor(view, current, 1))}
              aria-label="Next"
            >
              <ChevronRight />
            </Button>
            {/* Keyed on the label so the heading cross-fades with the grid. */}
            <p key={label} className="animate-tab-enter ml-1 text-sm font-semibold">
              {label}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:ml-auto">
            <div className="glass-control flex items-center gap-1 rounded-full p-[3px]">
              {CALENDAR_EVENT_KINDS.map((kind) => {
                const meta = eventKindMeta[kind]
                const on = layers.includes(kind)
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => toggleLayer(kind)}
                    aria-pressed={on}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
                      'transition-[background-color,box-shadow,color,opacity] duration-[var(--motion-control)] ease-[var(--ease-glass)]',
                      on ? 'glass-raised text-foreground' : 'text-muted-foreground opacity-70'
                    )}
                  >
                    <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden />
                    {meta.label}
                  </button>
                )
              })}
            </div>

            <Tabs value={scope} onValueChange={(value) => setScope(value as 'all' | 'mine')}>
              <TabsList>
                <TabsTrigger value="all">Everyone</TabsTrigger>
                <TabsTrigger value="mine">Mine</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All projects</SelectItem>
                <SelectItem value={NO_PROJECT}>No project</SelectItem>
                {projects.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <Switch
                id="calendar-show-completed"
                checked={showCompleted}
                onCheckedChange={setShowCompleted}
              />
              <Label htmlFor="calendar-show-completed" className="text-muted-foreground text-sm">
                Show completed
              </Label>
            </div>
          </div>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <Card className="py-4">
            <CardContent className="px-3">
              {isLoading ? (
                // The placeholder takes the shape of the view being waited on.
                <div
                  className={cn(
                    'grid gap-1.5',
                    view === 'agenda' ? 'grid-cols-1' : 'grid-cols-7'
                  )}
                >
                  {Array.from({ length: view === 'month' ? 42 : view === 'week' ? 7 : 6 }).map(
                    (_, index) => (
                      <Skeleton
                        key={index}
                        className={cn(
                          'rounded-xl',
                          view === 'month' ? 'h-24' : view === 'week' ? 'h-64' : 'h-12'
                        )}
                      />
                    )
                  )}
                </div>
              ) : (
                // Keyed on view and window, so every change replays the shared motion.
                <div key={`${view}-${label}`} className="animate-tab-enter">
                  {view === 'month' && (
                    <MonthGrid
                      month={cursor}
                      eventsByDay={eventsByDay}
                      selectedDay={selectedDay}
                      onSelectDay={setSelectedDay}
                      onAddOnDay={addOnDay}
                      onOpenEvent={openEvent}
                    />
                  )}
                  {view === 'week' && (
                    <WeekGrid
                      anchor={cursor}
                      eventsByDay={eventsByDay}
                      selectedDay={selectedDay}
                      onSelectDay={setSelectedDay}
                      onAddOnDay={addOnDay}
                      onOpenEvent={openEvent}
                    />
                  )}
                  {view === 'agenda' && (
                    <AgendaList
                      days={agendaDays}
                      eventsByDay={eventsByDay}
                      onOpenEvent={openEvent}
                    />
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-4">
            <DayPeek
              day={selectedDay}
              events={selectedEvents}
              onAdd={addOnDay}
              onOpenEvent={openEvent}
            />
            <UnscheduledTray
              tasks={unscheduled}
              isLoading={isTrayLoading}
              onOpenEvent={openEvent}
            />
          </div>
        </div>

        {/*
          The overlay is `position: fixed`, and this page sits inside the layout's
          `.glass` panel — whose `backdrop-filter` makes it the containing block
          for fixed descendants, anchoring the chip to the panel instead of the
          viewport. A portal to <body> puts it back on the viewport.
        */}
        {createPortal(
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
            {activeEvent && (
              <div className="pointer-events-none w-48 rotate-2">
                <ChipFace event={activeEvent} isDragging />
              </div>
            )}
          </DragOverlay>,
          document.body
        )}
      </DndContext>

      <TaskFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        task={editing}
        defaultListId={lists[0]?.id}
        defaultDueDate={draftDueDate}
        defaultProjectId={project === ALL || project === NO_PROJECT ? undefined : project}
        defaultAssigneeId={scope === 'mine' ? currentUser?.id : undefined}
        lists={lists}
        projects={projects}
        users={users}
        onSaved={(task) => {
          applyTask(task)
          syncCounts()
          loadTray()
        }}
      />
    </div>
  )
}
