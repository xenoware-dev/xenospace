import { useInfiniteQuery } from '@tanstack/react-query';
import type { PublicUser } from '@xenospace/shared';
import { api } from '@/lib/api.js';
import { keys } from '@/lib/queryClient.js';
import { dateTime, relativeTime } from '@/lib/format.js';
import { useFilters } from '@/hooks/useFilters.js';
import { Page } from '@/components/shell/AppShell.jsx';
import { Card } from '@/components/ui/Card.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { UserChip } from '@/components/ui/Avatar.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { EmptyState, ErrorState } from '@/components/ui/Empty.jsx';
import { Skeleton } from '@/components/ui/Spinner.jsx';
import { ClearFilters, FilterSelect } from '@/components/ui/Toolbar.jsx';
import { Shield } from '@/components/icons.jsx';

interface AuditRow {
  id: string;
  actor: PublicUser | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  outcome: 'SUCCESS' | 'FAILURE' | 'DENIED';
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * Security audit trail.
 *
 * Team-lead only. Distinct from the activity feed: this records authentication,
 * authorization denials, role changes and privileged writes — including the
 * attempts that were refused, which is exactly what the activity feed omits.
 */
export function AuditPage() {
  const { filters, setFilter, clear, activeCount } = useFilters({
    action: '', outcome: '',
  });

  const query = {
    action: filters.action || undefined,
    outcome: filters.outcome || undefined,
    limit: '50',
  };

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: keys.audit(query),
      queryFn: ({ pageParam }) =>
        api.get<{ items: AuditRow[]; nextCursor: string | null }>('/activity/audit', {
          ...query,
          cursor: pageParam as string | undefined,
        }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  const rows = data?.pages.flatMap((page) => page.items) ?? [];
  const denied = rows.filter((row) => row.outcome !== 'SUCCESS').length;

  return (
    <Page
      title="Security Audit"
      description="Authentication, access denials and privileged actions. Append-only."
      toolbar={
        <>
          <FilterSelect
            label="Outcome"
            value={filters.outcome}
            onChange={(value) => setFilter('outcome', value)}
            options={[
              { value: 'SUCCESS', label: 'Success' },
              { value: 'FAILURE', label: 'Failure' },
              { value: 'DENIED', label: 'Denied' },
            ]}
          />
          <FilterSelect
            label="Action"
            value={filters.action}
            onChange={(value) => setFilter('action', value)}
            options={[
              { value: 'auth.login', label: 'Sign in' },
              { value: 'auth.register', label: 'Registration' },
              { value: 'auth.logout', label: 'Sign out' },
              { value: 'auth.password_change', label: 'Password change' },
              { value: 'auth.password_reset', label: 'Password reset' },
              { value: 'auth.session_revoked', label: 'Session revoked' },
              { value: 'member.role_changed', label: 'Role change' },
              { value: 'member.status_changed', label: 'Status change' },
              { value: 'member.invited', label: 'Invitation' },
              { value: 'deployment.create', label: 'Deployment' },
              { value: 'deployment.rollback', label: 'Rollback' },
              { value: 'repo.connect', label: 'Repository connected' },
            ]}
          />
          <ClearFilters count={activeCount} onClear={clear} />
        </>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : error ? (
        <ErrorState message="The audit log could not be loaded." onRetry={() => void refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          {denied > 0 && (
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--status-warning-wash)] px-3.5 py-2.5"
            >
              <Shield size={14} className="mt-0.5 shrink-0 text-[var(--status-warning-ink)]" />
              <p className="text-xs leading-relaxed text-[var(--ink-secondary)]">
                <strong className="text-[var(--status-warning-ink)]">{denied}</strong> failed or denied
                {denied === 1 ? ' attempt' : ' attempts'} in the entries loaded. Repeated failures from one
                address or against one account are worth investigating.
              </p>
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState
              icon={<Shield size={20} />}
              title="No audit entries"
              message={activeCount > 0 ? 'Try clearing a filter.' : 'Security events appear here as they happen.'}
            />
          ) : (
            <Card padded={false} className="overflow-hidden">
              <ul className="divide-y divide-[var(--line-subtle)]">
                {rows.map((row) => (
                  <li key={row.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start gap-3">
                      <span
                        aria-hidden="true"
                        className="mt-1 h-7 w-0.5 shrink-0 rounded-full"
                        style={{
                          background:
                            row.outcome === 'SUCCESS'
                              ? 'var(--status-good)'
                              : row.outcome === 'DENIED'
                                ? 'var(--status-serious)'
                                : 'var(--status-critical)',
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="font-mono text-xs font-medium text-[var(--ink-primary)]">
                            {row.action}
                          </code>
                          <Badge
                            tone={
                              row.outcome === 'SUCCESS' ? 'good' : row.outcome === 'DENIED' ? 'serious' : 'critical'
                            }
                            size="sm"
                            dot
                          >
                            {row.outcome.toLowerCase()}
                          </Badge>
                          {row.resource && (
                            <span className="text-2xs text-[var(--ink-faint)]">{row.resource}</span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-3 text-2xs text-[var(--ink-muted)]">
                          {row.actor ? <UserChip user={row.actor} /> : <span className="italic">no actor</span>}
                          {row.ipAddress && (
                            <span className="font-mono">{row.ipAddress}</span>
                          )}
                          <span title={dateTime(row.createdAt)}>{relativeTime(row.createdAt)}</span>
                        </div>

                        {Object.keys(row.metadata).length > 0 && (
                          <details className="group mt-1.5">
                            <summary className="cursor-pointer list-none text-2xs text-[var(--ink-faint)] hover:text-[var(--ink-secondary)]">
                              <span aria-hidden="true" className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
                              Details
                            </summary>
                            <pre className="mt-1.5 overflow-x-auto rounded-[var(--radius-sm)] bg-[var(--surface-inset)] p-2 font-mono text-[10px] text-[var(--ink-secondary)]">
                              {JSON.stringify(row.metadata, null, 2)}
                            </pre>
                            {row.userAgent && (
                              <p className="mt-1 truncate-line font-mono text-[10px] text-[var(--ink-faint)]">
                                {row.userAgent}
                              </p>
                            )}
                          </details>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

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
