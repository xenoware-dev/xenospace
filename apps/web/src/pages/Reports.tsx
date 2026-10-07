import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TASK_STATUS_LABEL, type ReportBundle, type Sprint } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { duration, number, shortDate, titleCase } from '@/lib/format.js';
import { useFilters } from '@/hooks/useFilters.js';
import { useProjectOptions } from '@/hooks/useProjectOptions.js';
import { useToast } from '@/components/ui/Toast.jsx';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { UserChip } from '@/components/ui/Avatar.jsx';
import { Stat, StatGrid } from '@/components/ui/Stat.jsx';
import { Progress } from '@/components/ui/Progress.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { FilterSelect } from '@/components/ui/Toolbar.jsx';
import { Table } from '@/components/ui/Table.jsx';
import { BurndownChart, ChartFrame, ChartTable, DistributionBars, Legend, seriesColor } from '@/components/charts/index.jsx';
import { Download, Reports as ReportsIcon } from '@/components/icons.jsx';

/**
 * Reports.
 *
 * Team-lead only, and the one place the data is meant to leave the product —
 * hence the CSV export. Every figure states its window, because a throughput
 * number without a period is meaningless.
 */
export function ReportsPage() {
  const toast = useToast();
  const { data: projects } = useProjectOptions();
  const [range, setRange] = useState<'7' | '30' | '90'>('30');

  const { filters, setFilter } = useFilters({ projectId: '', sprintId: '' });

  const { data: sprints } = useQuery({
    queryKey: keys.sprints(filters.projectId || undefined),
    queryFn: () => api.get<Sprint[]>('/sprints', { projectId: filters.projectId || undefined }),
    enabled: Boolean(filters.projectId),
  });

  const query = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - Number(range) * 86_400_000);
    return {
      projectId: filters.projectId || undefined,
      sprintId: filters.sprintId || undefined,
      from: from.toISOString(),
      to: to.toISOString(),
      granularity: 'week' as const,
    };
  }, [filters.projectId, filters.sprintId, range]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: keys.reports(query),
    queryFn: () => api.get<ReportBundle>('/dashboard/reports', query),
  });

  /**
   * Builds and downloads a CSV client-side. No server round trip is needed —
   * the data is already here, and a blob download keeps it out of server logs.
   */
  const exportCsv = () => {
    if (!data) return;
    const rows: string[][] = [
      ['XenoSpace report'],
      ['Generated', data.generatedAt],
      ['From', data.range.from],
      ['To', data.range.to],
      [],
      ['Summary'],
      ['Tasks completed', String(data.summary.tasksCompleted)],
      ['Tasks created', String(data.summary.tasksCreated)],
      ['Issues resolved', String(data.summary.issuesResolved)],
      ['Reviews merged', String(data.summary.reviewsMerged)],
      ['Deployments', String(data.summary.deployments)],
      ['Avg cycle time (hours)', data.summary.avgCycleTimeHours?.toFixed(1) ?? '—'],
      ['Avg review time (hours)', data.summary.avgReviewTimeHours?.toFixed(1) ?? '—'],
      [],
      ['Member', 'Completed', 'Points', 'Logged minutes'],
      ...data.memberBreakdown.map((row) => [
        row.user.name, String(row.completed), String(row.points), String(row.loggedMinutes),
      ]),
    ];

    // Each field is quoted and inner quotes doubled, so a name containing a
    // comma cannot break the file.
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `xenospace-report-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  };

  const topCompleted = Math.max(1, ...(data?.memberBreakdown ?? []).map((row) => row.completed));

  return (
    <Page
      title="Reports & Docs"
      description="Delivery metrics over a chosen window, exportable as CSV."
      actions={
        <Button variant="secondary" size="sm" icon={<Download size={14} />} disabled={!data} onClick={exportCsv}>
          Export CSV
        </Button>
      }
      toolbar={
        <>
          <FilterSelect
            label="Project"
            value={filters.projectId}
            onChange={(value) => {
              setFilter('projectId', value);
              setFilter('sprintId', '');
            }}
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
          {filters.projectId && sprints && sprints.length > 0 && (
            <FilterSelect
              label="Sprint"
              value={filters.sprintId}
              onChange={(value) => setFilter('sprintId', value)}
              options={sprints.map((s) => ({ value: s.id, label: s.name }))}
            />
          )}
          <div className="inline-flex items-center gap-0.5 rounded-[var(--radius-md)] bg-[var(--surface-inset)] p-0.5 ring-1 ring-inset ring-[var(--line-subtle)]">
            {(['7', '30', '90'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setRange(option)}
                aria-pressed={range === option}
                className={cn(
                  'h-7 rounded-[var(--radius-sm)] px-2.5 text-xs font-medium transition-colors',
                  range === option
                    ? 'bg-[var(--surface-1)] text-[var(--ink-primary)] shadow-[var(--shadow-sm)]'
                    : 'text-[var(--ink-muted)] hover:text-[var(--ink-secondary)]',
                )}
              >
                {option} days
              </button>
            ))}
          </div>
        </>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : error ? (
        <ErrorState message="The report could not be generated." onRetry={() => void refetch()} />
      ) : !data ? (
        <EmptyState icon={<ReportsIcon size={20} />} title="No data" />
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-2xs text-[var(--ink-faint)]">
            {shortDate(data.range.from)} – {shortDate(data.range.to)} · generated{' '}
            {new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </p>

          <StatGrid>
            <Stat label="Tasks completed" value={data.summary.tasksCompleted} tone="good" />
            <Stat
              label="Tasks created"
              value={data.summary.tasksCreated}
              hint={
                data.summary.tasksCreated > data.summary.tasksCompleted
                  ? 'Backlog growing'
                  : 'Keeping pace'
              }
              tone={data.summary.tasksCreated > data.summary.tasksCompleted ? 'warning' : 'default'}
            />
            <Stat label="Issues resolved" value={data.summary.issuesResolved} />
            <Stat label="Deployments" value={data.summary.deployments} />
          </StatGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Cycle time" subtitle="From creation to completion" />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 py-3">
                  <p className="text-2xs text-[var(--ink-faint)]">Task cycle time</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                    {data.summary.avgCycleTimeHours !== null
                      ? `${data.summary.avgCycleTimeHours.toFixed(1)}h`
                      : '—'}
                  </p>
                </div>
                <div className="rounded-[var(--radius-md)] bg-[var(--surface-inset)] px-3 py-3">
                  <p className="text-2xs text-[var(--ink-faint)]">Review turnaround</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                    {data.summary.avgReviewTimeHours !== null
                      ? `${data.summary.avgReviewTimeHours.toFixed(1)}h`
                      : '—'}
                  </p>
                </div>
              </div>

              {data.cycleTimeByType.length > 0 && (
                <div className="mt-4 border-t border-[var(--line-subtle)] pt-4">
                  <DistributionBars
                    title="By task type"
                    slices={data.cycleTimeByType.map((row, index) => ({
                      label: `${titleCase(row.type)} — ${row.hours.toFixed(1)}h`,
                      value: Math.round(row.hours),
                      color: seriesColor(index % 8),
                    }))}
                  />
                </div>
              )}
            </Card>

            <Card>
              {data.burndown.length > 0 ? (
                <BurndownChart data={data.burndown} title="Sprint burndown" height={240} />
              ) : (
                <>
                  <CardHeader title="Sprint burndown" />
                  <EmptyState
                    compact
                    title="Select a sprint"
                    message="Choose a project and sprint above to see its burndown."
                  />
                </>
              )}
            </Card>
          </div>

          {/* ------------------------------------------- cumulative flow */}
          {data.cumulativeFlow.length > 0 && (
            <Card>
              <ChartFrame
                title="Cumulative flow"
                subtitle="Tasks by column over the window"
                legend={
                  <Legend
                    entries={(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const).map((status, index) => ({
                      label: TASK_STATUS_LABEL[status],
                      color: seriesColor(index),
                    }))}
                  />
                }
                height={0}
              >
                <span />
              </ChartFrame>

              {/* A stacked area here would obscure the smaller bands, so the
                  flow is shown as stacked proportion bars per sampled day. */}
              <ul className="mt-1 flex flex-col gap-1.5">
                {sampleFlow(data.cumulativeFlow).map((point) => {
                  const total =
                    (point.TODO ?? 0) + (point.IN_PROGRESS ?? 0) + (point.IN_REVIEW ?? 0) + (point.DONE ?? 0);
                  return (
                    <li key={point.date} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-2xs text-[var(--ink-faint)] tabular-nums">
                        {shortDate(point.date)}
                      </span>
                      <span className="flex h-3 min-w-0 flex-1 gap-0.5 overflow-hidden rounded-[var(--radius-xs)]">
                        {(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const).map((status, index) => {
                          const value = point[status] ?? 0;
                          if (value === 0 || total === 0) return null;
                          return (
                            <span
                              key={status}
                              title={`${TASK_STATUS_LABEL[status]}: ${value}`}
                              style={{ width: `${(value / total) * 100}%`, background: seriesColor(index) }}
                            />
                          );
                        })}
                      </span>
                      <span className="w-8 shrink-0 text-right text-2xs text-[var(--ink-muted)] tabular-nums">
                        {total}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <ChartTable
                caption="Tasks by column over the reporting window"
                columns={['Date', 'To Do', 'In Progress', 'In Review', 'Done']}
                rows={sampleFlow(data.cumulativeFlow).map((point) => [
                  shortDate(point.date),
                  point.TODO ?? 0,
                  point.IN_PROGRESS ?? 0,
                  point.IN_REVIEW ?? 0,
                  point.DONE ?? 0,
                ])}
              />
            </Card>
          )}

          {/* ----------------------------------------- member breakdown */}
          <Card padded={false}>
            <div className="px-4 pt-4">
              <CardHeader
                title="Delivery by person"
                subtitle="Completed tasks, story points and logged time in the window"
              />
            </div>
            <div className="mt-3">
              <Table
                rowKey={(row) => row.user.id}
                rows={data.memberBreakdown}
                empty={<EmptyState compact title="No completed work in this window" />}
                columns={[
                  {
                    key: 'user',
                    header: 'Member',
                    render: (row) => <UserChip user={row.user} subtitle={row.user.jobTitle ?? undefined} showPresence />,
                  },
                  {
                    key: 'completed',
                    header: 'Completed',
                    align: 'right',
                    width: '7rem',
                    render: (row) => <span className="font-medium tabular-nums">{number(row.completed)}</span>,
                  },
                  {
                    key: 'bar',
                    header: 'Share',
                    width: '10rem',
                    hideBelow: 'md',
                    render: (row) => (
                      <Progress
                        value={(row.completed / topCompleted) * 100}
                        size="xs"
                        label={`${row.user.name} completed ${row.completed}`}
                      />
                    ),
                  },
                  {
                    key: 'points',
                    header: 'Points',
                    align: 'right',
                    width: '6rem',
                    hideBelow: 'sm',
                    render: (row) => <span className="tabular-nums">{number(row.points)}</span>,
                  },
                  {
                    key: 'logged',
                    header: 'Logged',
                    align: 'right',
                    width: '7rem',
                    hideBelow: 'sm',
                    render: (row) => <span className="tabular-nums">{duration(row.loggedMinutes)}</span>,
                  },
                ]}
              />
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}

/**
 * Thins the flow series to at most twelve rows, so the list stays readable over
 * a 90-day window without dropping its endpoints.
 */
function sampleFlow<T extends { date: string }>(points: T[]): T[] {
  if (points.length <= 12) return points;
  const step = Math.ceil(points.length / 12);
  const sampled = points.filter((_, index) => index % step === 0);
  const last = points[points.length - 1]!;
  if (sampled[sampled.length - 1]?.date !== last.date) sampled.push(last);
  return sampled;
}
