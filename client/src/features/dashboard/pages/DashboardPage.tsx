import { useMemo, useState } from 'react'
import { ArrowRight, Calendar, MessageSquare, Search } from 'lucide-react'

import { Sparkline } from '@/components/common/Sparkline'
import { PageHeader } from '@/components/common/PageHeader'
import { Delta, StatTile } from '@/components/common/StatTile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { softSurface } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

const completedTrend = [96, 104, 88, 112, 121, 109, 118, 127, 124, 133, 141, 148]

const stats = [
  {
    label: 'Active projects',
    value: 8,
    delta: { value: 14, period: 'last month' },
    trend: [4, 5, 5, 6, 6, 5, 7, 7, 7, 8, 8, 8],
  },
  {
    label: 'Open tasks',
    value: 42,
    delta: { value: -9, period: 'last week', upIsGood: false },
    trend: [58, 55, 51, 54, 49, 47, 48, 45, 46, 44, 43, 42],
  },
  {
    label: 'Overdue tasks',
    value: 3,
    delta: { value: 50, period: 'last week', upIsGood: false },
    trend: [1, 2, 2, 1, 1, 2, 2, 2, 1, 2, 2, 3],
  },
]

const projects = [
  { name: 'Placement App', lead: 'Anitha R.', progress: 80, tasks: 24 },
  { name: 'Student Portal', lead: 'Karthik S.', progress: 62, tasks: 18 },
  { name: 'Xenobots', lead: 'Divya M.', progress: 41, tasks: 31 },
  { name: 'Design System', lead: 'Rahul V.', progress: 27, tasks: 12 },
]

const discussions = [
  { title: 'API architecture for placements', category: 'Development', replies: 12, ago: '2h ago' },
  { title: 'New project proposal: Xenolearn', category: 'Ideas', replies: 5, ago: '5h ago' },
  { title: 'Staging deployment failing', category: 'Questions', replies: 8, ago: 'Yesterday' },
  { title: 'Q4 hiring plan review', category: 'Operations', replies: 3, ago: '2d ago' },
]

const upcoming = [
  { title: 'Client meeting — Placement App', date: 'Today, 3:00 PM', type: 'Meeting' },
  { title: 'Sprint review', date: 'Tomorrow, 11:00 AM', type: 'Review' },
  { title: 'Xenobots milestone', date: 'Fri, Oct 3', type: 'Deadline' },
  { title: 'Design system handoff', date: 'Mon, Oct 6', type: 'Deadline' },
]

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

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const firstName = user?.name?.split(' ')[0] ?? 'there'
  const [query, setQuery] = useState('')

  const normalized = query.trim().toLowerCase()
  const filteredProjects = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(normalized)),
    [normalized]
  )
  const filteredDiscussions = useMemo(
    () => discussions.filter((d) => d.title.toLowerCase().includes(normalized)),
    [normalized]
  )
  const filteredUpcoming = useMemo(
    () => upcoming.filter((u) => u.title.toLowerCase().includes(normalized)),
    [normalized]
  )

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Dashboard"
        description={`${getGreeting()}, ${firstName} — here's what's moving across Xenoware today.`}
      />

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
              <p className="text-6xl leading-none font-semibold tracking-tight md:text-7xl">148</p>
              <Delta value={20.4} period="last week" />
            </div>
            <Sparkline
              data={completedTrend}
              label="Tasks completed, last 12 weeks"
              width={260}
              height={72}
              className="shrink-0"
            />
          </div>

          <Button variant="ghost" size="sm" className="w-fit rounded-full px-3">
            See report <ArrowRight />
          </Button>
        </section>

        <SectionCard title="This week">
          <div className="flex flex-1 flex-col justify-between gap-5">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground text-sm">Your tasks</span>
                <span className="text-sm font-semibold">8 / 12</span>
              </div>
              <div
                className="bg-data-track h-2.5 overflow-hidden rounded-full"
                role="meter"
                aria-valuenow={67}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Your tasks complete this week"
              >
                <div className="bg-data h-full rounded-full" style={{ width: '67%' }} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground text-sm">Team capacity</span>
                <span className="text-sm font-semibold">84%</span>
              </div>
              <div
                className="bg-data-track h-2.5 overflow-hidden rounded-full"
                role="meter"
                aria-valuenow={84}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Team capacity used this week"
              >
                <div className="bg-data h-full rounded-full" style={{ width: '84%' }} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-muted-foreground text-sm">Review queue</span>
                <span className="text-sm font-semibold">5 / 9</span>
              </div>
              <div
                className="bg-data-track h-2.5 overflow-hidden rounded-full"
                role="meter"
                aria-valuenow={56}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Review queue cleared this week"
              >
                <div className="bg-data h-full rounded-full" style={{ width: '56%' }} />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <StatTile key={stat.label} {...stat} />
        ))}
      </div>

      <Tabs defaultValue="projects" className="gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Activity</h2>
            <TabsList className="h-10 rounded-full p-1">
              <TabsTrigger value="projects" className="rounded-full px-4">
                Projects
              </TabsTrigger>
              <TabsTrigger value="discussions" className="rounded-full px-4">
                Discussions
              </TabsTrigger>
              <TabsTrigger value="upcoming" className="rounded-full px-4">
                Upcoming
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
            <div key={project.name} className={cn(softSurface, 'flex flex-col gap-3 p-4')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{project.name}</p>
                  <p className="text-muted-foreground text-xs">
                    Led by {project.lead} · {project.tasks} tasks
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{project.progress}%</span>
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
            </div>
          ))}
          {filteredProjects.length === 0 && <EmptyRow />}
        </TabsContent>

        <TabsContent value="discussions" className="flex flex-col gap-2">
          {filteredDiscussions.map((discussion) => (
            <div
              key={discussion.title}
              className="hover:bg-glass-tile flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors"
            >
              <span className="glass-tile flex size-9 shrink-0 items-center justify-center rounded-xl">
                <MessageSquare className="text-muted-foreground size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{discussion.title}</p>
                <p className="text-muted-foreground text-xs">
                  {discussion.category} · {discussion.ago}
                </p>
              </div>
              <Badge variant="secondary" className="rounded-full">
                {discussion.replies} replies
              </Badge>
            </div>
          ))}
          {filteredDiscussions.length === 0 && <EmptyRow />}
        </TabsContent>

        <TabsContent value="upcoming" className="flex flex-col gap-2">
          {filteredUpcoming.map((item) => (
            <div
              key={item.title}
              className="hover:bg-glass-tile flex items-center gap-3 rounded-2xl px-4 py-3 transition-colors"
            >
              <span className="glass-tile flex size-9 shrink-0 items-center justify-center rounded-xl">
                <Calendar className="text-muted-foreground size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="text-muted-foreground text-xs">{item.date}</p>
              </div>
              <Badge variant="outline" className="rounded-full">
                {item.type}
              </Badge>
            </div>
          ))}
          {filteredUpcoming.length === 0 && <EmptyRow />}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EmptyRow() {
  return (
    <p className="text-muted-foreground rounded-2xl px-4 py-6 text-sm">
      Nothing matches that filter.
    </p>
  )
}
