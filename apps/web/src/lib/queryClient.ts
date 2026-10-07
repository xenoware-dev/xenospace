import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api.js';

/**
 * Query cache configuration.
 *
 * Defaults are tuned for a tool people keep open: data is fresh enough to trust
 * without refetching on every tab focus, and a failed request is not retried
 * when retrying cannot help.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // Realtime events invalidate what actually changed, so blanket refetching
      // on focus would mostly produce redundant load.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry(failureCount, error) {
        // 4xx means the request was wrong, not unlucky — except 429, which the
        // backoff below genuinely helps with.
        if (error instanceof ApiError) {
          if (error.status === 429) return failureCount < 2;
          if (error.status >= 400 && error.status < 500) return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      // A mutation that failed has usually already been surfaced to the user;
      // silently replaying it risks a duplicate write.
      retry: false,
    },
  },
});

/** Query key factory. Centralised so an invalidation cannot miss a cache. */
export const keys = {
  me: ['me'] as const,
  sessions: ['sessions'] as const,

  dashboardAdmin: ['dashboard', 'admin'] as const,
  dashboardMe: ['dashboard', 'me'] as const,
  reports: (filters: unknown) => ['reports', filters] as const,

  projects: (filters?: unknown) => ['projects', filters ?? {}] as const,
  projectOptions: ['projects', 'options'] as const,
  project: (id: string) => ['projects', id] as const,
  projectMembers: (id: string) => ['projects', id, 'members'] as const,

  tasks: (filters?: unknown) => ['tasks', filters ?? {}] as const,
  board: (filters?: unknown) => ['tasks', 'board', filters ?? {}] as const,
  task: (id: string) => ['tasks', id] as const,
  taskComments: (id: string) => ['tasks', id, 'comments'] as const,

  sprints: (projectId?: string) => ['sprints', projectId ?? 'all'] as const,
  sprint: (id: string) => ['sprints', id] as const,
  velocity: (projectId: string) => ['sprints', 'velocity', projectId] as const,

  issues: (filters?: unknown) => ['issues', filters ?? {}] as const,
  issue: (id: string) => ['issues', id] as const,
  issueComments: (id: string) => ['issues', id, 'comments'] as const,

  reviews: (filters?: unknown) => ['reviews', filters ?? {}] as const,
  review: (id: string) => ['reviews', id] as const,
  reviewComments: (id: string) => ['reviews', id, 'comments'] as const,

  repos: (projectId?: string) => ['repos', projectId ?? 'all'] as const,
  repo: (id: string) => ['repos', id] as const,
  repoActivity: (filters?: unknown) => ['repos', 'activity', filters ?? {}] as const,

  deployments: (filters?: unknown) => ['deployments', filters ?? {}] as const,
  environments: (projectId?: string) => ['deployments', 'environments', projectId ?? 'all'] as const,

  events: (range: unknown) => ['calendar', range] as const,
  upcoming: ['calendar', 'upcoming'] as const,

  notes: (filters?: unknown) => ['kb', filters ?? {}] as const,
  note: (id: string) => ['kb', id] as const,
  graph: (projectId?: string) => ['kb', 'graph', projectId ?? 'all'] as const,
  kbFacets: ['kb', 'facets'] as const,

  channels: ['chat', 'channels'] as const,
  messages: (channelId: string) => ['chat', channelId, 'messages'] as const,
  thread: (channelId: string, messageId: string) => ['chat', channelId, 'thread', messageId] as const,

  files: (filters?: unknown) => ['files', filters ?? {}] as const,
  fileFolders: (projectId?: string) => ['files', 'folders', projectId ?? 'all'] as const,

  members: (filters?: unknown) => ['members', filters ?? {}] as const,
  member: (id: string) => ['members', id] as const,
  mentionable: (q?: string) => ['members', 'mentionable', q ?? ''] as const,
  invitations: ['members', 'invitations'] as const,

  notifications: (filters?: unknown) => ['notifications', filters ?? {}] as const,
  unreadCount: ['notifications', 'unread'] as const,

  activity: (filters?: unknown) => ['activity', filters ?? {}] as const,
  audit: (filters?: unknown) => ['activity', 'audit', filters ?? {}] as const,
};
