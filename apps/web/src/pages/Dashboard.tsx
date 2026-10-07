import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, SEVERITY_LABEL,
  type AdminDashboard, type DeveloperDashboard,
} from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import { duration, percent, pluralise, relativeTime, shortDate, timeOfDay } from '@/lib/format.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Stat, StatGrid } from '@/components/ui/Stat.jsx';
import { Avatar, UserChip } from '@/components/ui/Avatar.jsx';
import { Badge, PriorityBadge, Reference, SeverityBadge, TaskStatusBadge } from '@/components/ui/Badge.jsx';
import { Progress, ProgressRing } from '@/components/ui/Progress.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { LinkButton } from '@/components/ui/Button.jsx';
import {
  ContributionHeatmap, DistributionBars, DonutChart, STATUS_SERIES, ThroughputChart, VelocityChart,
} from '@/components/charts/index.jsx';
import {
  Activity as ActivityIcon, Bug, Calendar, Check, Clock, Fire, Kanban, Review, Sprint, Target, Tasks,
} from '@/components/icons.jsx';

/**
 * Dashboard.
 *
 * Two genuinely different pages behind one route, because the two roles have
 * different questions. A team lead asks "where is the team and what is at
 * risk"; a developer asks "what should I do next". Serving one of them a
 * filtered version of the other's page would answer neither well.
 */
export function DashboardPage() {
  const { isAdmin } = useAuth();
  return isAdmin ? <TeamLeadDashboard /> : <DeveloperDashboardView />;
}

/* ------------------------------------------------------------- team lead */

function TeamLeadDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.dashboardAdmin,
    queryFn: () => api.get<AdminDashboard>('/dashboard/admin'),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error || !data) {
    return (
      <Page title="Dashboard">
        <ErrorState message="The dashboard could not be loaded." onRetry={() => void refetch()} />
      </Page>
    );
  }

  const { kpis, deploymentHealth } = data;

  // Board order, with each status on its own fixed colour.
  const statusSlices = TASK_STATUSES
    .map((status) => ({ status, count: data.tasksByStatus.find((s) => s.status === status)?.count ?? 0 }))
    .filter((s) => s.count > 0)
    .map((s) => ({ label: TASK_STATUS_LABEL[s.status], value: s.count, color: STATUS_SERIES[s.status] }));

  const severitySlices = data.issuesBySeverity
    .filter((s) => s.count > 0)
    .map((slice) => ({
      label: SEVERITY_LABEL[slice.severity],
      value: slice.count,
      // Severity is a status, not an identity, so it uses the status palette.
      color: {
        S1: 'var(--status-critical)',
        S2: 'var(--status-serious)',
        S3: 'var(--status-warning)',
        S4: 'var(--status-neutral)',
      }[slice.severity],
    }));

  return (
    <Page
      title={`${greeting()}, ${user?.name.split(' ')[0]}`}
      description="Where the team is, and what needs your attention today."
      actions={
        <>
          <LinkButton to="/sprints" variant="secondary" size="sm" icon={<Sprint size={14} />}>
            Sprints
          </LinkButton>
          <LinkButton to="/tasks?new=1" variant="primary" size="sm" icon={<Tasks size={14} />}>
            New task
          </LinkButton>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {/* --------------------------------------------------------- KPIs */}
        <StatGrid>
          <Stat label="Active projects" value={kpis.activeProjects} icon={<Target size={14} />} to="/projects" />
          <Stat
            label="Open tasks"
            value={kpis.openTasks}
            hint={kpis.overdueTasks > 0 ? `${kpis.overdueTasks} overdue` : 'None overdue'}
            tone={kpis.overdueTasks > 0 ? 'warning' : 'default'}
            icon={<Tasks size={14} />}
            to="/tasks"
          />
          <Stat
            label="Open issues"
            value={kpis.openIssues}
            hint={kpis.criticalIssues > 0 ? `${kpis.criticalIssues} critical` : 'None critical'}
            tone={kpis.criticalIssues > 0 ? 'critical' : 'default'}
            icon={<Bug size={14} />}
            to="/issues"
          />
          <Stat label="Pending reviews" value={kpis.pendingReviews} icon={<Review size={14} />} to="/code-review" />
        </StatGrid>

        {/* ---------------------------------------------- throughput + flow */}
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <ThroughputChart
              data={data.throughput}
              title="Delivery throughput"
              subtitle="Tasks created and completed over the last 30 days"
              height={240}
            />
          </Card>

          <Card>
            <DistributionBars
              slices={statusSlices}
              title="Work in flight"
              subtitle="Every task by board column"
              total={data.tasksByStatus.reduce((sum, s) => sum + s.count, 0)}
            />
          </Card>
        </div>

        {/* --------------------------------------- velocity + deploy health */}
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
          <Card>
            {data.velocity.some((v) => v.committed > 0 || v.completed > 0) ? (
              <VelocityChart data={data.velocity} title="Sprint velocity" height={200} />
            ) : (
              <>
                <CardHeader title="Sprint velocity" />
                <EmptyState
                  compact
                  icon={<Sprint size={16} />}
                  title="No completed sprints yet"
                  message="Velocity appears once a completed sprint has estimated work."
                />
              </>
            )}
          </Card>

          <Card>
            <DonutChart
              title="Deployment health"
              slices={[
                { label: 'Succeeded', value: deploymentHealth.succeeded, color: 'var(--status-good)' },
                { label: 'Failed', value: deploymentHealth.failed, color: 'var(--status-critical)' },
                { label: 'Rolled back', value: deploymentHealth.rolledBack, color: 'var(--status-serious)' },
              ]}
              centerValue={percent(deploymentHealth.successRate)}
              centerLabel="success rate"
              height={176}
            />
          </Card>

          <Card>
            <DistributionBars
              slices={severitySlices}
              title="Open issues by severity"
              subtitle="Unresolved only"
            />
            {severitySlices.length === 0 && (
              <EmptyState compact icon={<Check size={16} />} title="No open issues" message="Nothing outstanding." />
            )}
          </Card>
        </div>

        {/* ------------------------------------------------------- workload */}
        <Card>
          <CardHeader
            title="Team workload"
            subtitle="Open tasks and committed points per person"
            action={
              <Link to="/team" className="text-2xs font-medium text-[var(--accent)] hover:underline">
                Team members
              </Link>
            }
          />
          <div className="mt-4 flex flex-col gap-3">
            {data.workloadByMember.length === 0 ? (
              <EmptyState compact title="No one assigned yet" />
            ) : (
              data.workloadByMember.map((row) => {
                // Load against a rough points capacity; over 100% is flagged.
                const load = row.capacity > 0 ? Math.round((row.points / row.capacity) * 100) : 0;
                return (
                  <div key={row.user.id} className="flex items-center gap-3">
                    <Link to={`/team/${row.user.id}`} className="w-40 shrink-0">
                      <UserChip user={row.user} subtitle={row.user.jobTitle ?? undefined} showPresence />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Progress
                        value={Math.min(100, load)}
                        tone={load > 100 ? 'critical' : load > 80 ? 'warning' : 'accent'}
                        size="sm"
                        label={`${row.user.name}: ${load}% of capacity`}
                      />
                    </div>
                    <span className="w-28 shrink-0 text-right text-2xs text-[var(--ink-muted)] tabular-nums">
                      {pluralise(row.openTasks, 'task')} · {row.points} pts
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* ------------------------------------- projects + activity + diary */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader title="Project progress" action={<Link to="/projects" className="text-2xs font-medium text-[var(--accent)] hover:underline">All</Link>} />
            <ul className="mt-3 flex flex-col gap-3">
              {data.projectProgress.length === 0 && <EmptyState compact title="No active projects" />}
              {data.projectProgress.map((row) => (
                <li key={row.project.id}>
                  <Link to={`/projects/${row.project.id}`} className="flex items-center gap-3 rounded-[var(--radius-sm)] p-1 -m-1 transition-colors hover:bg-[var(--wash-hover)]">
                    <ProgressRing value={row.progress} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span aria-hidden="true" className="size-2 shrink-0 rounded-[2px]" style={{ background: row.project.color }} />
                        <span className="truncate-line text-xs font-medium">{row.project.name}</span>
                      </span>
                      <span className="mt-0.5 block text-2xs text-[var(--ink-muted)]">
                        {row.dueInDays === null
                          ? 'No target date'
                          : row.dueInDays < 0
                            ? `${Math.abs(row.dueInDays)} days overdue`
                            : `${row.dueInDays} days left`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader title="Recent activity" action={<Link to="/activity" className="text-2xs font-medium text-[var(--accent)] hover:underline">All</Link>} />
            <ul className="mt-3 flex flex-col gap-2.5">
              {data.recentActivity.length === 0 && <EmptyState compact title="No activity yet" />}
              {data.recentActivity.slice(0, 7).map((entry) => (
                <li key={entry.id} className="flex items-start gap-2.5">
                  {entry.actor ? (
                    <Avatar user={entry.actor} size="sm" />
                  ) : (
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--ink-muted)]">
                      <ActivityIcon size={11} />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 text-2xs leading-relaxed">
                    <span className="font-medium text-[var(--ink-primary)]">{entry.actor?.name ?? 'System'}</span>
                    <span className="text-[var(--ink-muted)]"> {humaniseAction(entry.action)} </span>
                    {entry.entityLabel && (
                      <span className="text-[var(--ink-secondary)]">{entry.entityLabel}</span>
                    )}
                    <span className="mt-0.5 block text-[var(--ink-faint)]">{relativeTime(entry.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader title="Coming up" action={<Link to="/calendar" className="text-2xs font-medium text-[var(--accent)] hover:underline">Calendar</Link>} />
            <ul className="mt-3 flex flex-col gap-2.5">
              {data.upcomingEvents.length === 0 && (
                <EmptyState compact icon={<Calendar size={16} />} title="Nothing scheduled" />
              )}
              {data.upcomingEvents.map((event) => (
                <li key={event.id} className="flex items-start gap-3">
                  <span className="w-11 shrink-0 rounded-[var(--radius-sm)] bg-[var(--surface-inset)] px-1 py-1 text-center">
                    <span className="block text-2xs font-semibold tabular-nums">{timeOfDay(event.startsAt)}</span>
                    <span className="block text-[9px] text-[var(--ink-faint)]">{shortDate(event.startsAt)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate-line text-xs font-medium">{event.title}</span>
                    <span className="mt-0.5 flex items-center gap-1.5">
                      <Badge size="sm" tone="neutral">{event.kind.toLowerCase()}</Badge>
                      {event.attendees.length > 0 && (
                        <span className="text-2xs text-[var(--ink-faint)]">
                          {pluralise(event.attendees.length, 'attendee')}
                        </span>
                      )}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------- developer */

function DeveloperDashboardView() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.dashboardMe,
    queryFn: () => api.get<DeveloperDashboard>('/dashboard/me'),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (error || !data) {
    return (
      <Page title="Dashboard">
        <ErrorState message="Your dashboard could not be loaded." onRetry={() => void refetch()} />
      </Page>
    );
  }

  const { kpis, profile } = data;
  const prioritySlices = data.tasksByPriority
    .filter((p) => p.count > 0)
    .map((slice) => ({
      label: PRIORITY_LABEL[slice.priority],
      value: slice.count,
      color: {
        URGENT: 'var(--status-critical)',
        HIGH: 'var(--status-serious)',
        MEDIUM: 'var(--status-info)',
        LOW: 'var(--status-neutral)',
      }[slice.priority],
    }));

  return (
    <Page
      title={`${greeting()}, ${profile.name.split(' ')[0]}`}
      description="Your work, your reviews, and what is due next."
      actions={
        <LinkButton to="/board" variant="primary" size="sm" icon={<Kanban size={14} />}>
          Open my board
        </LinkButton>
      }
    >
      <div className="flex flex-col gap-5">
        <StatGrid>
          <Stat
            label="Assigned to me"
            value={kpis.assignedTasks}
            hint={`${kpis.inProgress} in progress`}
            icon={<Tasks size={14} />}
            to="/tasks"
          />
          <Stat
            label="Due today"
            value={kpis.dueToday}
            hint={kpis.overdue > 0 ? `${kpis.overdue} overdue` : 'Nothing overdue'}
            tone={kpis.overdue > 0 ? 'critical' : kpis.dueToday > 0 ? 'warning' : 'default'}
            icon={<Clock size={14} />}
            to="/tasks?overdue=true"
          />
          <Stat
            label="Completed this week"
            value={kpis.completedThisWeek}
            hint={duration(kpis.loggedMinutesThisWeek) + ' logged'}
            tone="good"
            icon={<Check size={14} />}
            spark={data.personalThroughput.slice(-14).map((d) => d.completed)}
          />
          <Stat
            label="Reviews waiting"
            value={kpis.reviewsRequested}
            hint={kpis.openIssues > 0 ? `${kpis.openIssues} open issues` : undefined}
            tone={kpis.reviewsRequested > 0 ? 'warning' : 'default'}
            icon={<Review size={14} />}
            to="/code-review?reviewerId=me"
          />
        </StatGrid>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {/* ----------------------------------------------- focus list */}
          <Card>
            <CardHeader
              title="Focus next"
              subtitle="Ordered by what is overdue, then by priority"
              action={<Link to="/tasks" className="text-2xs font-medium text-[var(--accent)] hover:underline">All my tasks</Link>}
            />
            {data.focusTasks.length === 0 ? (
              <EmptyState
                icon={<Check size={18} />}
                title="Nothing assigned to you"
                message="When your team lead assigns you work, it will appear here."
                compact
              />
            ) : (
              <ul className="mt-3 flex flex-col gap-1 xs-stagger">
                {data.focusTasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      to={`/tasks/${task.id}`}
                      className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--wash-hover)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <Reference>{task.reference}</Reference>
                          {task.project && (
                            <span className="flex items-center gap-1">
                              <span aria-hidden="true" className="size-1.5 rounded-[2px]" style={{ background: task.project.color }} />
                              <span className="text-2xs text-[var(--ink-faint)]">{task.project.key}</span>
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate-line text-xs font-medium text-[var(--ink-primary)]">
                          {task.title}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <PriorityBadge priority={task.priority} />
                        {/* Status is the less urgent signal, so it gives way first. */}
                        <span className="hidden sm:inline-flex"><TaskStatusBadge status={task.status} /></span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ------------------------------------------- sprint + priority */}
          <div className="flex flex-col gap-4">
            {data.activeSprint ? (
              <Card>
                <CardHeader
                  title={data.activeSprint.name}
                  subtitle={data.activeSprint.goal ?? 'No goal set'}
                  action={<ProgressRing value={data.activeSprint.committedPoints > 0 ? (data.activeSprint.completedPoints / data.activeSprint.committedPoints) * 100 : 0} size={34} />}
                />
                <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
                  {[
                    { label: 'Committed', value: `${data.activeSprint.committedPoints} pts` },
                    { label: 'Completed', value: `${data.activeSprint.completedPoints} pts` },
                    { label: 'Tasks', value: `${data.activeSprint.doneTaskCount}/${data.activeSprint.taskCount}` },
                  ].map((item) => (
                    <div key={item.label} className="rounded-[var(--radius-sm)] bg-[var(--surface-inset)] px-2 py-2">
                      <dt className="text-2xs text-[var(--ink-faint)]">{item.label}</dt>
                      <dd className="mt-0.5 text-xs font-semibold tabular-nums">{item.value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-2xs text-[var(--ink-muted)]">
                  Ends {shortDate(data.activeSprint.endDate)}
                </p>
              </Card>
            ) : (
              <Card>
                <EmptyState compact icon={<Sprint size={16} />} title="No active sprint" message="Your projects have no sprint running." />
              </Card>
            )}

            <Card>
              <DistributionBars slices={prioritySlices} title="My open work by priority" />
              {prioritySlices.length === 0 && <EmptyState compact title="Nothing open" />}
            </Card>

            <Card>
              <div className="flex items-center gap-3">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)]"
                  style={{ background: 'var(--status-serious-wash)', color: 'var(--status-serious-ink)' }}
                >
                  <Fire size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-2xl leading-none font-semibold tracking-tight">{data.streakDays}</p>
                  <p className="mt-0.5 text-2xs text-[var(--ink-muted)]">
                    day{data.streakDays === 1 ? '' : 's'} with completed work
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* ------------------------------------------- reviews + my issues */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Waiting on your review" action={<Link to="/code-review" className="text-2xs font-medium text-[var(--accent)] hover:underline">All</Link>} />
            {data.reviewQueue.length === 0 ? (
              <EmptyState compact icon={<Review size={16} />} title="Your review queue is clear" />
            ) : (
              <ul className="mt-3 flex flex-col gap-1">
                {data.reviewQueue.map((review) => (
                  <li key={review.id}>
                    <Link to={`/code-review/${review.id}`} className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--wash-hover)]">
                      <Avatar user={review.author} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate-line text-xs font-medium">{review.title}</span>
                        <span className="mt-0.5 flex items-center gap-2 text-2xs text-[var(--ink-faint)]">
                          <Reference>{review.reference}</Reference>
                          <span className="font-mono">
                            <span className="text-[var(--status-good-ink)]">+{review.additions}</span>{' '}
                            <span className="text-[var(--status-critical-ink)]">−{review.deletions}</span>
                          </span>
                        </span>
                      </span>
                      <span className="shrink-0 text-2xs text-[var(--ink-faint)]">{relativeTime(review.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Issues assigned to you" action={<Link to="/issues?assigneeId=me" className="text-2xs font-medium text-[var(--accent)] hover:underline">All</Link>} />
            {data.myIssues.length === 0 ? (
              <EmptyState compact icon={<Bug size={16} />} title="No issues assigned" />
            ) : (
              <ul className="mt-3 flex flex-col gap-1">
                {data.myIssues.map((issue) => (
                  <li key={issue.id}>
                    <Link to={`/issues/${issue.id}`} className="flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2 transition-colors hover:bg-[var(--wash-hover)]">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate-line text-xs font-medium">{issue.title}</span>
                        <Reference className="mt-0.5 block">{issue.reference}</Reference>
                      </span>
                      <SeverityBadge severity={issue.severity} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card>
          <ContributionHeatmap data={data.contributionHeatmap} title="Your completed work" />
        </Card>

        {data.upcomingEvents.length > 0 && (
          <Card>
            <CardHeader title="Your schedule" action={<Link to="/calendar" className="text-2xs font-medium text-[var(--accent)] hover:underline">Calendar</Link>} />
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.upcomingEvents.map((event) => (
                <li key={event.id} className="flex items-start gap-2.5 rounded-[var(--radius-sm)] bg-[var(--surface-inset)] p-2.5">
                  <Calendar size={14} className="mt-0.5 shrink-0 text-[var(--ink-faint)]" />
                  <span className="min-w-0">
                    <span className="block truncate-line text-xs font-medium">{event.title}</span>
                    <span className="mt-0.5 block text-2xs text-[var(--ink-muted)]">
                      {shortDate(event.startsAt)} · {timeOfDay(event.startsAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------- helpers */

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Turns `task.created` into "created a task" for the activity feed. */
function humaniseAction(action: string): string {
  const [entity, verb] = action.split('.');
  if (!verb) return action.replace(/[._]/g, ' ');
  const readable = verb.replace(/_/g, ' ');
  const article = /^[aeiou]/i.test(entity ?? '') ? 'an' : 'a';
  if (readable.endsWith('ed')) return `${readable} ${article} ${entity?.replace(/_/g, ' ')}`;
  return `${readable} ${article} ${entity?.replace(/_/g, ' ')}`;
}

function DashboardSkeleton() {
  return (
    <Page title="Dashboard">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-48" />
      </div>
    </Page>
  );
}
