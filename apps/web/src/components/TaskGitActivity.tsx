import { useQuery } from '@tanstack/react-query';
import type { TaskGitLink } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { relativeTime, shortSha } from '@/lib/format.js';
import { Card, CardHeader } from '@/components/ui/Card.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Branch, Commit, External, PullRequest } from '@/components/icons.jsx';

const KIND = {
  PULL_REQUEST: { icon: PullRequest, label: 'Pull request' },
  COMMIT: { icon: Commit, label: 'Commit' },
  BRANCH: { icon: Branch, label: 'Branch' },
} as const;

const PR_TONE: Record<string, 'good' | 'info' | 'neutral'> = { MERGED: 'good', OPEN: 'info', CLOSED: 'neutral' };

/**
 * Commits, branches and pull requests on GitHub that mention this task by
 * reference. Renders nothing until something does, so tasks without code stay
 * uncluttered.
 */
export function TaskGitActivity({ taskId, reference }: { taskId: string; reference: string }) {
  const { data: links } = useQuery({
    // Under the `tasks` prefix, so a sync's task invalidation refreshes it.
    queryKey: ['tasks', taskId, 'git'],
    queryFn: () => api.get<TaskGitLink[]>(`/tasks/${taskId}/git`),
  });

  if (!links || links.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title={`GitHub activity (${links.length})`}
        subtitle={`Commits, branches and pull requests that mention ${reference}`}
      />
      <ul className="mt-3 flex flex-col gap-1">
        {links.map((link) => {
          const { icon: Icon, label } = KIND[link.kind];
          return (
            <li key={link.id}>
              <a
                href={link.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2 transition-colors hover:bg-[var(--glass-tile)]"
              >
                <Icon size={14} aria-label={label} className="shrink-0 text-[var(--ink-muted)]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate-line text-xs font-medium">
                    {link.kind === 'PULL_REQUEST' && <span className="text-[var(--ink-muted)]">#{link.ref} </span>}
                    {link.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-2xs text-[var(--ink-faint)]">
                    <span className="font-mono">{link.repository.fullName}</span>
                    {link.kind === 'COMMIT' && <span className="font-mono">· {shortSha(link.ref)}</span>}
                    {link.author && <span>· {link.author}</span>}
                    {link.occurredAt && <span>· {relativeTime(link.occurredAt)}</span>}
                  </span>
                </span>
                {link.state && (
                  <Badge tone={PR_TONE[link.state] ?? 'neutral'} size="sm">
                    {link.state.charAt(0) + link.state.slice(1).toLowerCase()}
                  </Badge>
                )}
                <External size={12} aria-hidden="true" className="shrink-0 text-[var(--ink-faint)] opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
