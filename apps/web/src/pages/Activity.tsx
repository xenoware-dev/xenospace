import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { ActivityEntry, CursorPage } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { keys } from '@/lib/queryClient.js';
import { dateTime, relativeTime, shortDate } from '@/lib/format.js';
import { useFilters } from '@/hooks/useFilters.js';
import { useProjectOptions } from '@/hooks/useProjectOptions.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { ClearFilters, FilterSelect } from '@/components/ui/Toolbar.jsx';
import { Activity as ActivityIcon } from '@/components/icons.jsx';

/**
 * Activity feed.
 *
 * Cursor-paginated rather than offset-paginated: the feed grows constantly, and
 * an offset would show duplicates or skip entries as new rows arrive during
 * paging.
 */
export function ActivityPage() {
  const { data: projects } = useProjectOptions();
  const { filters, setFilter, clear, activeCount } = useFilters({
    projectId: '', actorId: '', entityType: '',
  });

  const query = {
    projectId: filters.projectId || undefined,
    actorId: filters.actorId || undefined,
    entityType: filters.entityType || undefined,
    limit: '40',
  };

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: keys.activity(query),
      queryFn: ({ pageParam }) =>
        api.get<CursorPage<ActivityEntry>>('/activity', {
          ...query,
          cursor: pageParam as string | undefined,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  const entries = data?.pages.flatMap((page) => page.items) ?? [];

  // Grouped by day so a long feed stays navigable.
  const grouped: Array<{ day: string; items: ActivityEntry[] }> = [];
  for (const entry of entries) {
    const day = entry.createdAt.slice(0, 10);
    const group = grouped.find((g) => g.day === day);
    if (group) group.items.push(entry);
    else grouped.push({ day, items: [entry] });
  }

  return (
    <Page
      title="Activity"
      description="What has been happening across your projects."
      toolbar={
        <>
          <FilterSelect
            label="Project"
            value={filters.projectId}
            onChange={(value) => setFilter('projectId', value)}
            options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
          />
          <FilterSelect
            label="Type"
            value={filters.entityType}
            onChange={(value) => setFilter('entityType', value)}
            options={[
              { value: 'task', label: 'Tasks' },
              { value: 'issue', label: 'Issues' },
              { value: 'review', label: 'Reviews' },
              { value: 'deployment', label: 'Deployments' },
              { value: 'sprint', label: 'Sprints' },
              { value: 'project', label: 'Projects' },
              { value: 'kb_note', label: 'Knowledge base' },
              { value: 'file', label: 'Files' },
            ]}
          />
          <FilterSelect
            label="Actor"
            value={filters.actorId}
            onChange={(value) => setFilter('actorId', value)}
            options={[{ value: 'me', label: 'Me' }]}
          />
          <ClearFilters count={activeCount} onClear={clear} />
        </>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : error ? (
        <ErrorState message="The activity feed could not be loaded." onRetry={() => void refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon size={20} />}
          title={activeCount > 0 ? 'No activity matches those filters' : 'No activity yet'}
          message={activeCount > 0 ? 'Try clearing a filter.' : 'Activity appears here as the team works.'}
          action={activeCount > 0 ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : undefined}
        />
      ) : (
        <div className="flex flex-col gap-5">
          {grouped.map((group) => (
            <div key={group.day}>
              <h2 className="mb-2 text-xs font-medium text-[var(--ink-muted)]">
                {group.day === new Date().toISOString().slice(0, 10) ? 'Today' : shortDate(group.day)}
              </h2>
              <Card padded={false} className="overflow-hidden">
                <ul className="divide-y divide-[var(--line-subtle)]">
                  {group.items.map((entry) => (
                    <li key={entry.id} className="flex items-start gap-3 px-4 py-3">
                      {entry.actor ? (
                        <Avatar user={entry.actor} size="md" showPresence />
                      ) : (
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--ink-muted)]">
                          <ActivityIcon size={13} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-relaxed">
                          <span className="font-semibold text-[var(--ink-primary)]">
                            {entry.actor?.name ?? 'System'}
                          </span>{' '}
                          <span className="text-[var(--ink-muted)]">{describeAction(entry.action)}</span>{' '}
                          {entry.entityLabel && (
                            <EntityLink entry={entry} />
                          )}
                        </p>
                        <p className="mt-0.5 flex items-center gap-2 text-2xs text-[var(--ink-faint)]">
                          <span title={dateTime(entry.createdAt)}>{relativeTime(entry.createdAt)}</span>
                          <Badge tone="neutral" size="sm">{entry.entityType.replace(/_/g, ' ')}</Badge>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          ))}

          {hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </Page>
  );
}

/** Links the entity label to its page where a route exists for that type. */
function EntityLink({ entry }: { entry: ActivityEntry }) {
  const routes: Record<string, string> = {
    task: '/tasks', issue: '/issues', review: '/code-review',
    project: '/projects', kb_note: '/knowledge', sprint: '/sprints',
  };
  const base = routes[entry.entityType];

  if (!base || !entry.entityId) {
    return <span className="font-medium text-[var(--ink-secondary)]">{entry.entityLabel}</span>;
  }
  return (
    <Link
      to={`${base}/${entry.entityId}`}
      className="font-medium text-[var(--ink-secondary)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
    >
      {entry.entityLabel}
    </Link>
  );
}

/** Turns `task.moved` into readable prose. */
function describeAction(action: string): string {
  const map: Record<string, string> = {
    'task.created': 'created',
    'task.updated': 'updated',
    'task.moved': 'moved',
    'task.deleted': 'deleted',
    'task.assigned': 'assigned',
    'task.unassigned': 'unassigned',
    'task.commented': 'commented on',
    'task.time_logged': 'logged time on',
    'issue.created': 'reported',
    'issue.updated': 'updated',
    'issue.resolved': 'resolved',
    'issue.deleted': 'deleted',
    'review.opened': 'opened a review for',
    'review.approved': 'approved',
    'review.changes_requested': 'requested changes on',
    'review.merged': 'merged',
    'review.closed': 'closed',
    'sprint.created': 'created',
    'sprint.started': 'started',
    'sprint.completed': 'completed',
    'sprint.deleted': 'deleted',
    'project.created': 'created',
    'project.updated': 'updated',
    'project.deleted': 'deleted',
    'project.member_added': 'added someone to',
    'project.member_removed': 'removed someone from',
    'deployment.queued': 'queued a deployment of',
    'deployment.succeeded': 'deployed',
    'deployment.failed': 'failed to deploy',
    'deployment.rolled_back': 'rolled back',
    'kb.created': 'wrote',
    'kb.deleted': 'deleted',
    'file.uploaded': 'uploaded',
    'file.deleted': 'deleted',
    'repo.connected': 'connected',
    'repo.disconnected': 'disconnected',
    'member.role_changed': 'changed the role of',
  };
  return map[action] ?? action.split('.').pop()?.replace(/_/g, ' ') ?? action;
}
