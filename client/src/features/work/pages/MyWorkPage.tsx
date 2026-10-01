import { AxiosError } from 'axios'
import { CheckCircle2, ListTodo } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Card, CardContent, softSurface } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { WorkTaskRow } from '@/features/work/components/WorkTaskRow'
import { cn } from '@/lib/utils'
import { taskApi } from '@/services/task.service'
import { workApi } from '@/services/work.service'
import { useAuthStore } from '@/store/auth.store'
import type { Task } from '@/types/task'
import type { MyWork } from '@/types/work'

/** The buckets, in the order a day is actually worked through. */
const SECTIONS = [
  { key: 'overdue', title: 'Overdue', note: 'Past their date and still open' },
  { key: 'today', title: 'Due today', note: null },
  { key: 'thisWeek', title: 'This week', note: null },
  { key: 'later', title: 'Later', note: null },
  { key: 'undated', title: 'No date', note: 'Assigned to you but never scheduled' },
] as const

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * One person's work across every project.
 *
 * A board answers "what is in this project". This answers "what do I do
 * next", which is the question people open the app with — and the reason a
 * task tool is a productivity tool rather than a tracker.
 */
export default function MyWorkPage() {
  const currentUser = useAuthStore((s) => s.user)
  const [work, setWork] = useState<MyWork | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(() => {
    setIsLoading(true)
    workApi
      .mine()
      .then(({ data }) => setWork(data))
      .catch((error: unknown) => {
        const fallback = 'Unable to load your work'
        toast.error(
          error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
        )
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(load, [load])

  /** Ticking a card off moves it into the board's done column, server side. */
  const onToggle = (task: Task) => {
    taskApi
      .setDone(task.id, !task.isDone)
      .then(() => load())
      .catch((error: unknown) => {
        const fallback = 'Unable to update that task'
        toast.error(
          error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
        )
      })
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-72" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (!work) return null

  const hasAnything = SECTIONS.some((section) => work[section.key].length > 0)
  const firstName = currentUser?.name.split(' ')[0] ?? 'there'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={
          work.counts.open === 0
            ? 'Nothing open. Enjoy it.'
            : `${work.counts.open} open ${work.counts.open === 1 ? 'task' : 'tasks'}${
                work.counts.overdue ? ` · ${work.counts.overdue} overdue` : ''
              }`
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Open" value={work.counts.open} />
        <StatTile label="Overdue" value={work.counts.overdue} />
        <StatTile label="Due today" value={work.counts.dueToday} />
        <StatTile label="Done this week" value={work.counts.completedThisWeek} />
      </div>

      {hasAnything ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-6">
            {SECTIONS.map((section) => {
              const tasks = work[section.key]
              if (!tasks.length) return null

              return (
                <section key={section.key} className="flex flex-col gap-2">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-sm font-semibold">{section.title}</h2>
                    <span className="text-muted-foreground/70 text-xs tabular-nums">
                      {tasks.length}
                    </span>
                    {section.note && (
                      <span className="text-muted-foreground/70 ml-auto text-xs">
                        {section.note}
                      </span>
                    )}
                  </div>

                  {tasks.map((task) => (
                    <WorkTaskRow
                      key={task.id}
                      task={task}
                      onToggle={onToggle}
                      isOverdue={section.key === 'overdue'}
                    />
                  ))}
                </section>
              )
            })}
          </div>

          <aside className="flex flex-col gap-2">
            <h2 className="flex items-center gap-1.5 px-1 text-sm font-semibold">
              <CheckCircle2 className="size-4" aria-hidden />
              Finished this week
            </h2>

            {work.recentlyCompleted.length ? (
              work.recentlyCompleted.map((task) => (
                <div key={task.id} className={cn(softSurface, 'px-3 py-2')}>
                  <p className="text-muted-foreground truncate text-xs line-through">
                    {task.title}
                  </p>
                  {task.project && (
                    <p className="text-muted-foreground/70 text-[11px]">
                      {task.reference ?? task.project.key}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground/70 px-1 text-xs leading-5">
                Nothing closed out in the last seven days.
              </p>
            )}
          </aside>
        </div>
      ) : (
        <Card variant="elevated">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ListTodo className="text-muted-foreground size-8" aria-hidden />
            <p className="font-medium">Nothing assigned to you</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              When someone puts a task in your name it turns up here, sorted by when it is due.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
