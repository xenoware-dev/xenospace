import { ArrowRight, MailWarning, ShieldCheck, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/common/PageHeader'
import { Sparkline } from '@/components/common/Sparkline'
import { Delta, StatTile } from '@/components/common/StatTile'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { softSurface } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BreakdownList, type BreakdownRow } from '@/features/admin/components/BreakdownList'
import { formatBytes, relativeDate } from '@/features/files/lib/file-meta'
import { statusMeta } from '@/features/projects/lib/project-meta'
import { formatRole, getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { adminApi } from '@/services/admin.service'
import type { AdminOverview } from '@/types/admin'

function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn(softSurface, 'flex flex-col gap-4 p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** One of the three health figures beside the member count. */
function HealthRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ShieldCheck
  label: string
  value: number
  tone: 'good' | 'warn' | 'bad'
}) {
  const toneClass =
    tone === 'good' ? 'text-success' : tone === 'warn' ? 'text-warning' : 'text-destructive'

  return (
    <div className="flex items-center gap-3">
      <span className="glass-tile flex size-9 shrink-0 items-center justify-center rounded-xl">
        <Icon className={cn('size-4', value === 0 ? 'text-muted-foreground' : toneClass)} />
      </span>
      <span className="flex-1 text-sm">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}

function AdminSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Skeleton className="h-56 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  )
}

export default function AdminDashboardPage() {
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = () => {
    setStatus('loading')
    adminApi
      .overview()
      .then(({ data }) => {
        setOverview(data)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }

  useEffect(load, [])

  const header = (
    <PageHeader
      title="Admin Console"
      description="Xenoware at a glance — membership, structure and workload across the whole organisation."
      action={
        <Button variant="outline" className="rounded-full" asChild>
          <Link to="/admin/users">
            Manage users <ArrowRight />
          </Link>
        </Button>
      }
    />
  )

  if (!overview) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        {status === 'error' ? (
          <section
            className={cn(softSurface, 'flex flex-col items-center gap-3 p-10 text-center')}
          >
            <p className="text-sm font-medium">Couldn't load the organisation overview</p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </section>
        ) : (
          <AdminSkeleton />
        )}
      </div>
    )
  }

  const { members, roles, departments, projects, tasks, storage, newestMembers } = overview

  const hasSignupHistory = members.signupsTrend.some((count) => count > 0)

  // Roles nobody holds are named once underneath rather than drawn as empty
  // bars, which would otherwise be most of the list in a small organisation.
  const filledRoles = roles.filter((row) => row.count > 0)
  const emptyRoles = roles.filter((row) => row.count === 0)

  const roleRows: BreakdownRow[] = filledRoles.map((row) => ({
    key: row.role,
    label: formatRole(row.role),
    count: row.count,
  }))

  const departmentRows: BreakdownRow[] = [
    ...departments.rows.map((row) => ({
      key: row.id,
      label: row.name,
      count: row.memberCount,
    })),
    ...(departments.unassignedMembers > 0
      ? [
          {
            key: 'unassigned',
            label: 'No department',
            count: departments.unassignedMembers,
            note: (
              <Badge variant="outline" className="rounded-full text-[11px]">
                Unassigned
              </Badge>
            ),
          },
        ]
      : []),
  ].sort((a, b) => b.count - a.count)

  const projectRows: BreakdownRow[] = projects.byStatus
    .filter((row) => row.count > 0)
    .map((row) => ({
      key: row.status,
      label: statusMeta[row.status].label,
      count: row.count,
      note: (
        <Badge variant={statusMeta[row.status].variant} className="rounded-full text-[11px]">
          {Math.round((row.count / projects.total) * 100)}%
        </Badge>
      ),
    }))

  return (
    <div className="flex flex-col gap-8">
      {header}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Hero: headcount is the number this console leads with. */}
        <section
          className={cn(softSurface, 'flex flex-col justify-between gap-6 p-6 lg:col-span-2')}
        >
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Members</h2>
            <p className="text-muted-foreground text-xs">Signups over the rolling 12 weeks</p>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-3">
              <p className="text-6xl leading-none font-semibold tracking-tight md:text-7xl">
                {members.total}
              </p>
              {members.deltaPercent !== null ? (
                <Delta value={members.deltaPercent} period="last week" />
              ) : (
                <span className="text-muted-foreground text-xs font-medium">
                  {members.newThisWeek > 0
                    ? `${members.newThisWeek} joined this week`
                    : 'Nobody joined this week'}
                </span>
              )}
            </div>

            {hasSignupHistory && (
              <Sparkline
                data={members.signupsTrend}
                label="Signups, last 12 weeks"
                width={260}
                height={72}
                className="shrink-0"
              />
            )}
          </div>

          <Button variant="ghost" size="sm" className="w-fit rounded-full px-3" asChild>
            <Link to="/team">
              View the team directory <ArrowRight />
            </Link>
          </Button>
        </section>

        <SectionCard title="Account health" description="What needs an administrator's attention">
          <div className="flex flex-1 flex-col justify-between gap-4">
            <HealthRow icon={ShieldCheck} label="Active accounts" value={members.active} tone="good" />
            <HealthRow
              icon={MailWarning}
              label="Awaiting verification"
              value={members.pendingVerification}
              tone="warn"
            />
            <HealthRow icon={UserX} label="Deactivated" value={members.deactivated} tone="bad" />
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="New this week"
          value={members.newThisWeek}
          trend={hasSignupHistory ? members.signupsTrend : undefined}
        />
        <StatTile label="Departments" value={departments.total} />
        <StatTile label="Active projects" value={projects.active} />
        <StatTile label="Overdue tasks" value={tasks.overdue} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Members by role"
          description="In privilege order, highest first"
          action={
            <Button variant="ghost" size="sm" className="rounded-full px-3" asChild>
              <Link to="/admin/roles">
                Roles <ArrowRight />
              </Link>
            </Button>
          }
        >
          <BreakdownList rows={roleRows} total={members.total} emptyLabel="No members yet." />
          {emptyRoles.length > 0 && (
            <p className="text-muted-foreground text-xs">
              Unfilled: {emptyRoles.map((row) => formatRole(row.role)).join(', ')}
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Members by department"
          description="Largest first"
          action={
            <Button variant="ghost" size="sm" className="rounded-full px-3" asChild>
              <Link to="/admin/organization">
                Organisation <ArrowRight />
              </Link>
            </Button>
          }
        >
          <BreakdownList
            rows={departmentRows}
            total={members.total}
            emptyLabel="No departments yet — create one from Organisation settings."
          />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard
          title="Projects by status"
          description={`${projects.total} ${projects.total === 1 ? 'project' : 'projects'}, archived included`}
        >
          <BreakdownList
            rows={projectRows}
            total={projects.total}
            emptyLabel="No projects yet."
          />
        </SectionCard>

        <SectionCard title="Workload and storage" description="Across every project">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Open', value: tasks.open },
                { label: 'Done', value: tasks.done },
                { label: 'Overdue', value: tasks.overdue },
              ].map((cell) => (
                <div key={cell.label} className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-xs">{cell.label}</span>
                  <span className="text-2xl leading-none font-semibold tabular-nums">
                    {cell.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Done against the whole board, so progress reads without a legend. */}
            <div
              className="bg-data-track h-2.5 overflow-hidden rounded-full"
              role="meter"
              aria-valuenow={tasks.total > 0 ? Math.round((tasks.done / tasks.total) * 100) : 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Tasks completed across the organisation"
            >
              <div
                className="bg-data h-full rounded-full transition-[width] duration-[var(--motion-view-in)] ease-[var(--ease-glass)]"
                style={{
                  width: `${tasks.total > 0 ? (tasks.done / tasks.total) * 100 : 0}%`,
                }}
              />
            </div>

            <div className="flex items-baseline justify-between gap-3 pt-1">
              <span className="text-muted-foreground text-sm">
                File library · {storage.files} {storage.files === 1 ? 'file' : 'files'}
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {formatBytes(storage.totalSize)}
              </span>
            </div>
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Newest members"
        description="The five most recent accounts"
        action={
          <Button variant="ghost" size="sm" className="rounded-full px-3" asChild>
            <Link to="/admin/users">
              User management <ArrowRight />
            </Link>
          </Button>
        }
      >
        {newestMembers.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">No accounts yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {newestMembers.map((member) => (
              <li key={member.id}>
                <Link
                  to={`/team/${member.id}`}
                  className="hover:bg-glass-tile flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-[var(--motion-control)] ease-[var(--ease-glass)]"
                >
                  <Avatar className="size-9">
                    <AvatarImage src={member.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {member.name}
                      {member.isNewThisWeek && (
                        <span className="text-data ml-2 text-[11px] font-semibold">New</span>
                      )}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      @{member.username} · joined {relativeDate(member.joinedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!member.isEmailVerified && (
                      <Badge variant="warning" className="rounded-full text-[11px]">
                        Unverified
                      </Badge>
                    )}
                    <Badge variant="secondary" className="rounded-full text-[11px]">
                      {formatRole(member.role)}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  )
}
