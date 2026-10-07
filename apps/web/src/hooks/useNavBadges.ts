import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { keys } from '@/lib/queryClient.js';
import type { NavBadge } from '@/components/shell/navigation.js';
import { useProjectOptions } from './useProjectOptions.js';

/**
 * Live counts for the navigation. Every count is backed by a real query; a
 * section with nothing behind it stays bare rather than showing an invented
 * number. Polling backs up the socket push, so a missed event cannot leave a
 * badge permanently stale.
 */
export function useNavBadges(): Record<NavBadge, number | undefined> {
  const { allows } = useAuth();
  const { data: projects } = useProjectOptions();

  const { data: myTasks } = useQuery({
    queryKey: keys.tasks({ nav: 'mine-open' }),
    queryFn: () =>
      api.get<{ total: number }>('/tasks', {
        assigneeId: 'me',
        status: 'BACKLOG,TODO,IN_PROGRESS,IN_REVIEW,BLOCKED',
        pageSize: 1,
      }),
    refetchInterval: 120_000,
    enabled: allows('task:read'),
  });

  const { data: unread } = useQuery({
    queryKey: keys.unreadCount,
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
    enabled: allows('notification:read'),
  });

  const { data: reviews } = useQuery({
    queryKey: keys.reviews({ nav: 'waiting' }),
    queryFn: () => api.get<{ total: number }>('/reviews', { reviewerId: 'me', status: 'OPEN,CHANGES_REQUESTED', pageSize: 1 }),
    refetchInterval: 120_000,
    enabled: allows('review:read'),
  });

  const { data: channels } = useQuery({
    queryKey: keys.channels,
    queryFn: () => api.get<Array<{ unreadCount: number }>>('/chat/channels'),
    refetchInterval: 60_000,
    enabled: allows('chat:read'),
  });

  return {
    projects: projects?.length,
    tasks: myTasks?.total,
    notifications: unread?.unread,
    reviews: reviews?.total,
    chat: channels ? channels.reduce((sum, c) => sum + c.unreadCount, 0) : undefined,
  };
}
