import { AxiosError } from 'axios'
import { AlertTriangle, Inbox, Users } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, softSurface } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRole, getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { workApi } from '@/services/work.service'
import type { Workload, WorkloadRow } from '@/types/work'

/**
 * What everyone is carrying.
 *
 * The bar is weighted by priority rather than counting cards, because four
 * urgent tasks and four low ones are not the same week — and assigning on a
 * flat count is how people end up quietly overloaded.
 */
export default function WorkloadPage() {
  const [workload, setWorkload] = useState<Workload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(() => {
    setIsLoading(true)
    workApi
      .workload()
      .then(({ data }) => setWorkload(data))
      .catch((error: unknown) => {
        if (error instanceof AxiosError && error.response?.status === 403) {
          setForbidden(true)
          return
        }
        toast.error('Unable to load the team workload')
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(load, [load])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (forbidden) {
    return (
      <Card variant="elevated">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <Users className="text-muted-foreground size-8" aria-hidden />
          <p className="font-medium">This view is for leads</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Team workload is visible to team leads, managers and admins. Your own work is on{' '}
            <Link to="/my-work" className="underline underline-offset-4">
              My Work
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!workload) return null

  // One scale across every row, so the bars compare against each other rather
  // than each filling its own track.
  const peak = Math.max(...workload.rows.map((row) => row.load), 1)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Team workload"
        description="Who is carrying what, so work is assigned on evidence rather than on who answered last"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="People" value={workload.totals.people} />
        <StatTile label="Open tasks" value={workload.totals.open} />
        <StatTile label="Overdue" value={workload.totals.overdue} />
        <StatTile label="Unassigned" value={workload.totals.unassigned} />
      </div>

      {workload.totals.unassigned > 0 && (
        <div className={cn(softSurface, 'flex items-center gap-3 p-4')}>
          <Inbox className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <p className="text-sm">
            <span className="font-medium">
              {workload.totals.unassigned} task
              {workload.totals.unassigned === 1 ? '' : 's'}
            </span>{' '}
            <span className="text-muted-foreground">
              nobody owns. Work with no name on it is work nobody is doing.
            </span>
          </p>
          <Link
            to="/tasks?assignee=none"
            className="ml-auto shrink-0 text-xs underline underline-offset-4"
          >
            Assign them
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {workload.rows.map((row) => (
          <Row key={row.user.id} row={row} peak={peak} />
        ))}
      </div>
    </div>
  )
}

function Row({ row, peak }: { row: WorkloadRow; peak: number }) {
  const percent = Math.round((row.load / peak) * 100)

  return (
    <div className={cn(softSurface, 'flex items-center gap-4 p-3.5')}>
      <Link to={`/team/${row.user.id}`} className="flex min-w-0 items-center gap-3">
        <Avatar className="size-9 shrink-0">
          <AvatarImage src={row.user.avatarUrl ?? undefined} alt={row.user.name} />
          <AvatarFallback className="text-xs">{getInitials(row.user.name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{row.user.name}</span>
          <span className="text-muted-foreground/70 truncate text-[11px]">
            {formatRole(row.user.role)}
          </span>
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="bg-data-track h-2 overflow-hidden rounded-full" title={`Load ${row.load}`}>
          <div
            className="bg-data h-full rounded-full transition-[width] duration-[var(--motion-view-in)] ease-[var(--ease-glass)]"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-muted-foreground/70 text-[11px]">
          {row.open === 0 ? 'Nothing open' : `${row.open} open`}
          {row.dueSoon > 0 && ` · ${row.dueSoon} due soon`}
          {row.completedThisWeek > 0 && ` · ${row.completedThisWeek} done this week`}
        </p>
      </div>

      {/* Overdue is the one number worth interrupting for, so it is the only
          thing on the row that is allowed to shout. */}
      {row.overdue > 0 && (
        <span className="bg-destructive/12 text-destructive flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold">
          <AlertTriangle className="size-3" aria-hidden />
          {row.overdue} overdue
        </span>
      )}
    </div>
  )
}
