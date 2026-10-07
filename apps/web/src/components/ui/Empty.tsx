import type { ReactNode } from 'react';
import { cn } from '@/lib/cn.js';

/**
 * Empty state.
 *
 * Always names the next action. "No tasks yet" with a create button is useful;
 * a bare "No data" is a dead end, and these screens are where a new user spends
 * their first minutes.
 */
export function EmptyState({
  icon,
  title,
  message,
  action,
  compact = false,
  className,
}: {
  icon?: ReactNode;
  title: string;
  message?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 py-8' : 'gap-3 py-16',
        className,
      )}
    >
      {icon && (
        <div
          aria-hidden="true"
          className={cn(
            'flex items-center justify-center rounded-[var(--radius-xl)] text-[var(--ink-faint)]',
            'bg-[var(--surface-2)] ring-1 ring-inset ring-[var(--line-subtle)]',
            compact ? 'size-9' : 'size-12',
          )}
        >
          {icon}
        </div>
      )}
      <div className="max-w-sm">
        <h3 className={cn('font-semibold text-[var(--ink-primary)]', compact ? 'text-sm' : 'text-md')}>
          {title}
        </h3>
        {message && (
          <p className={cn('mt-1 leading-relaxed text-[var(--ink-muted)]', compact ? 'text-2xs' : 'text-xs')}>
            {message}
          </p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Inline error with a retry, for a query that failed rather than returned empty. */
export function ErrorState({
  title = 'Could not load this',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] py-12 text-center',
        'bg-[var(--status-critical-wash)] ring-1 ring-inset ring-[var(--status-critical)]/20',
        className,
      )}
    >
      <span aria-hidden="true" className="text-xl text-[var(--status-critical-ink)]">⚠</span>
      <div className="max-w-sm">
        <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{title}</h3>
        {message && <p className="mt-1 text-xs text-[var(--ink-muted)]">{message}</p>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-[var(--radius-sm)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium ring-1 ring-inset ring-[var(--line)] transition-colors hover:bg-[var(--surface-3)]"
        >
          Try again
        </button>
      )}
    </div>
  );
}
