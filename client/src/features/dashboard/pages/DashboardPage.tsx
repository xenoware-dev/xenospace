import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarClock, CheckCircle2, FolderKanban, Search } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/common/PageHeader'
import { Sparkline } from '@/components/common/Sparkline'
import { Delta, StatTile } from '@/components/common/StatTile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { softSurface } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { statusMeta } from '@/features/projects/lib/project-meta'
import { taskDueLabel } from '@/features/tasks/lib/task-meta'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type {
  CompletedTask,
  DashboardProject,
  Ratio,
  UpcomingTask,
} from '@/types/dashboard'

// Stable fallbacks, so the filter memos below do not see a fresh array each render.
const NO_PROJECTS: DashboardProject[] = []
const NO_UPCOMING: UpcomingTask[] = []
const NO_COMPLETED: CompletedTask[] = []

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className={cn(softSurface, 'flex flex-col gap-4 p-5')}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A labelled progress meter. Nothing to measure reads as a dash, not as 0%. */
function Meter({ label, ratio, hint }: { label: string; ratio: Ratio; hint: string }) {
  const percent = ratio.total > 0 ? Math.round((ratio.done / ratio.total) * 100) : 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="text-sm font-semibold tabular-nums">
          {ratio.total > 0 ? `${ratio.done} / ${ratio.total}` : '—'}
        </span>
      </div>
      <div
        className="bg-data-track h-2.5 overflow-hidden rounded-full"
        role="meter"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={hint}
      >
        <div
          className="bg-data h-full rounded-full transition-[width] duration-[var(--motion-view-in)] ease-[var(--ease-glass)]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground rounded-2xl px-4 py-6 text-sm">{children}</p>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  )
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const firstName = user?.name?.split(' ')[0] ?? 'there'

  const overview = useWorkspaceStore((s) => s.overview)
  const status = useWorkspaceStore((s) => s.status)
  const load = useWorkspaceStore((s) => s.load)

  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()

  // Landing here is the moment the numbers most need to be current.
  useEffect(() => {
    void load()
  }, [load])

  const projects = overview?.projects ?? NO_PROJECTS
  const upcoming = overview?.upcoming ?? NO_UPCOMING
  const completed = overview?.recentlyCompleted ?? NO_COMPLETED

  const filteredProjects = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(normalized)),
    [projects, normalized]
  )
  const filteredUpcoming = useMemo(
    () => upcoming.filter((t) => t.title.toLowerCase().includes(normalized)),
    [upcoming, normalized]
  )
  const filteredCompleted = useMemo(
    () => completed.filter((t) => t.title.toLowerCase().includes(normalized)),
    [completed, normalized]
  )

  const header = (
    <PageHeader
      title="Dashboard"
      description={`${getGreeting()}, ${firstName} — here's what's moving across Xenoware today.`}
    />
  )

  if (!overview) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        {status === 'error' ? (
          <section className={cn(softSurface, 'flex flex-col items-center gap-3 p-10 text-center')}>
            <p className="text-sm font-medium">Couldn't load your dashboard</p>
            <Button variant="outline" onClick={() => void load()}>
              Try again
            </Button>
          </section>
        ) : (
          <DashboardSkeleton />
        )}
      </div>
    )
  }

  const { completion, thisWeek, stats } = overview
  const hasHistory = completion.weekly.some((count) => count > 0)

  return (
    <div className="flex flex-col gap-8">
      {header}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Hero: the one number the view leads with. */}
        <section
          className={cn(softSurface, 'flex flex-col justify-between gap-6 p-6 lg:col-span-2')}
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Tasks completed</h2>
            <p className="text-muted-foreground text-xs">Rolling 12 weeks</p>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-3">
              <p className="text-6xl leading-none font-semibold tracking-tight md:text-7xl">
                {completion.total}
              </p>
              {completion.deltaPercent !== null ? (
                <Delta value={completion.deltaPercent} period="last week" />
              ) : (
                <span className="text-muted-foreground text-xs font-medium">
                  {completion.total > 0
                    ? 'No completions last week to compare'
                    : 'Nothing completed yet'}
                </span>
              )}
            </div>

            {hasHistory && (
              <Sparkline
                data={completion.weekly}
                label="Tasks completed, last 12 weeks"
                width={260}
                height={72}
                className="shrink-0"
              />
            )}
          </div>

          <Button variant="ghost" size="sm" className="w-fit rounded-full px-3" asChild>
            <Link to="/tasks">
              Go to board <ArrowRight />
            </Link>
          </Button>
        </section>

        <SectionCard title="This week">
          <div className="flex flex-1 flex-col justify-between gap-5">
            <Meter
              label="Your tasks"
              ratio={thisWeek.yours}
              hint="Your tasks completed this week"
            />
            <Meter label="Due this week" ratio={thisWeek.due} hint="Tasks due this week, done" />
            <Meter label="Board overall" ratio={thisWeek.board} hint="All cards, done" />
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Active projects" value={stats.activeProjects} />
        <StatTile
          label="Open tasks"
          value={stats.openTasks}
          // The only series that can be rebuilt honestly: created minus completed.
          trend={hasHistory ? stats.openTasksTrend : undefined}
        />
        <StatTile label="Overdue tasks" value={stats.overdueTasks} />
      </div>

      <Tabs defaultValue="projects" className="gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Activity</h2>
            <TabsList className="h-10 rounded-full p-1">
              <TabsTrigger value="projects" className="rounded-full px-4">
                Projects
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="rounded-full px-4">
                Upcoming
              </TabsTrigger>
              <TabsTrigger value="completed" className="rounded-full px-4">
                Completed
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="relative w-full sm:max-w-xs sm:self-end">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter activity"
              aria-label="Filter activity"
              className="glass-control placeholder:text-muted-foreground focus-visible:ring-ring/40 h-10 w-full rounded-full pr-4 pl-10 text-sm outline-none focus-visible:ring-2"
            />
          </div>
        </div>

        <TabsContent value="projects" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredProjects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className={cn(
                softSurface,
                'flex flex-col gap-3 p-4 transition-all duration-[var(--motion-control)] ease-[var(--ease-glass)] hover:-translate-y-0.5'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{project.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {project.leadName ? `Led by ${project.leadName}` : 'No lead'} ·{' '}
                    {project.taskCount} {project.taskCount === 1 ? 'task' : 'tasks'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={statusMeta[project.status].variant} className="text-[11px]">
                    {statusMeta[project.status].label}
                  </Badge>
                  <span className="text-sm font-semibold tabular-nums">{project.progress}%</span>
                </div>
              </div>
              <div
                className="bg-data-track h-2 overflow-hidden rounded-full"
                role="meter"
                aria-valuenow={project.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${project.name} progress`}
              >
                <div
                  className="bg-data h-full rounded-full"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </Link>
          ))}

          {filteredProjects.length === 0 && (
            <EmptyRow>
              {projects.length === 0 ? (
                <span className="flex flex-wrap items-center gap-2">
                  <FolderKanban className="size-4" />
                  No projects yet.
                  <Link to="/projects" className="text-foreground underline underline-offset-4">
                    Create the first one
                  </Link>
                </span>
              ) : (
                'Nothing matches that filter.'
              )}
            </EmptyRow>
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="flex flex-col gap-2">
          {filteredUpcoming.map((task) => (
            <Link
              key={task.id}
              to="/tasks"
              className="hover:bg-glass-tile flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors"
            >
              <span className="glass-tile flex size-9 shrink-0 items-center justify-center rounded-xl">
                <CalendarClock className="text-muted-foreground size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{task.title}</p>
                <p className="text-muted-foreground text-xs">
                  {task.reference ?? task.projectName ?? 'No project'}
                </p>
              </div>
              <Badge variant="outline" className="rounded-full">
                {taskDueLabel(task.dueDate, false)}
              </Badge>
            </Link>
          ))}

          {filteredUpcoming.length === 0 && (
            <EmptyRow>
              {upcoming.length === 0
                ? 'Nothing with a due date coming up.'
                : 'Nothing matches that filter.'}
            </EmptyRow>
          )}
        </TabsContent>

        <TabsContent value="completed" className="flex flex-col gap-2">
          {filteredCompleted.map((task) => (
            <Link
              key={task.id}
              to="/tasks"
              className="hover:bg-glass-tile flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors"
            >
              <span className="glass-tile flex size-9 shrink-0 items-center justify-center rounded-xl">
                <CheckCircle2 className="text-success size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{task.title}</p>
                <p className="text-muted-foreground text-xs">
                  {task.reference ?? task.projectName ?? 'No project'}
                </p>
              </div>
              <Badge variant="secondary" className="rounded-full">
                {taskDueLabel(task.completedAt, true)}
              </Badge>
            </Link>
          ))}

          {filteredCompleted.length === 0 && (
            <EmptyRow>
              {completed.length === 0
                ? 'Nothing completed yet — tick a card off on the board.'
                : 'Nothing matches that filter.'}
            </EmptyRow>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
