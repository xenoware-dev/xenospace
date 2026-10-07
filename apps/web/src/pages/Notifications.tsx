import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { NOTIFICATION_KINDS, type CursorPage, type Notification } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { keys } from '@/lib/queryClient.js';
import { cn } from '@/lib/cn.js';
import { dateTime, relativeTime, shortDate, titleCase } from '@/lib/format.js';
import { useFilters } from '@/hooks/useFilters.js';
import { useMutate } from '@/hooks/useMutate.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button, IconButton } from '@/components/ui/Button.jsx';
import { Avatar } from '@/components/ui/Avatar.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { FilterSelect } from '@/components/ui/Toolbar.jsx';
import { SegmentedControl } from '@/components/ui/Tabs.jsx';
import { Bell, Check, Trash } from '@/components/icons.jsx';

/** Notification inbox, grouped by day with unread entries marked. */
export function NotificationsPage() {
  const navigate = useNavigate();
  const { filters, setFilter } = useFilters({ unread: '', kind: '' });

  const query = {
    unreadOnly: filters.unread || undefined,
    kind: filters.kind || undefined,
    limit: '40',
  };

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: keys.notifications(query),
      queryFn: ({ pageParam }) =>
        api.get<CursorPage<Notification>>('/notifications', {
          ...query,
          cursor: pageParam as string | undefined,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  const { data: unreadCount } = useQuery({
    queryKey: keys.unreadCount,
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'),
  });

  const markAll = useMutate(() => api.post<{ updated: number }>('/notifications/read', { all: true }), {
    invalidates: [['notifications']],
    successMessage: 'All marked read',
  });

  const markOne = useMutate((id: string) => api.post('/notifications/read', { ids: [id], all: false }), {
    invalidates: [['notifications']],
  });

  const remove = useMutate((id: string) => api.delete(`/notifications/${id}`), {
    invalidates: [['notifications']],
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  const grouped: Array<{ day: string; items: Notification[] }> = [];
  for (const item of items) {
    const day = item.createdAt.slice(0, 10);
    const group = grouped.find((g) => g.day === day);
    if (group) group.items.push(item);
    else grouped.push({ day, items: [item] });
  }

  return (
    <Page
      title="Notifications"
      description={
        unreadCount?.unread
          ? `${unreadCount.unread} unread`
          : 'Mentions, assignments and status changes.'
      }
      actions={
        (unreadCount?.unread ?? 0) > 0 && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Check size={14} />}
            loading={markAll.isPending}
            onClick={() => markAll.mutate(undefined as never)}
          >
            Mark all read
          </Button>
        )
      }
      toolbar={
        <>
          <SegmentedControl
            value={filters.unread ? 'unread' : 'all'}
            onChange={(value) => setFilter('unread', value === 'unread' ? 'true' : '')}
            size="sm"
            options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: 'Unread' },
            ]}
          />
          <FilterSelect
            label="Type"
            value={filters.kind}
            onChange={(value) => setFilter('kind', value)}
            options={NOTIFICATION_KINDS.map((kind) => ({ value: kind, label: titleCase(kind) }))}
          />
        </>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : error ? (
        <ErrorState message="Notifications could not be loaded." onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={20} />}
          title={filters.unread ? 'Nothing unread' : 'No notifications'}
          message={
            filters.unread
              ? 'You are completely caught up.'
              : 'Assignments, mentions and review requests will appear here.'
          }
          action={
            filters.unread ? (
              <Button variant="secondary" onClick={() => setFilter('unread', '')}>See all</Button>
            ) : undefined
          }
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
                  {group.items.map((notification) => (
                    <li
                      key={notification.id}
                      className={cn(
                        'group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--wash-hover)]',
                        !notification.readAt && 'bg-[var(--accent-wash)]/30',
                      )}
                    >
                      {!notification.readAt && (
                        <span aria-label="Unread" className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                      )}
                      {notification.readAt && <span aria-hidden="true" className="mt-2 size-1.5 shrink-0" />}

                      {notification.actor ? (
                        <Avatar user={notification.actor} size="md" showPresence />
                      ) : (
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[var(--ink-muted)]">
                          <Bell size={13} />
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          if (!notification.readAt) markOne.mutate(notification.id);
                          if (notification.link) navigate(notification.link);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block text-xs font-medium text-[var(--ink-primary)]">
                          {notification.title}
                        </span>
                        {notification.body && (
                          <span className="mt-0.5 block line-clamp-2 text-2xs leading-relaxed text-[var(--ink-muted)]">
                            {notification.body}
                          </span>
                        )}
                        <span className="mt-1 flex items-center gap-2">
                          <Badge tone="neutral" size="sm">{titleCase(notification.kind)}</Badge>
                          <span className="text-2xs text-[var(--ink-faint)]" title={dateTime(notification.createdAt)}>
                            {relativeTime(notification.createdAt)}
                          </span>
                        </span>
                      </button>

                      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        {!notification.readAt && (
                          <IconButton label="Mark read" size="xs" onClick={() => markOne.mutate(notification.id)}>
                            <Check size={12} />
                          </IconButton>
                        )}
                        <IconButton label="Delete notification" size="xs" onClick={() => remove.mutate(notification.id)}>
                          <Trash size={12} />
                        </IconButton>
                      </span>
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
