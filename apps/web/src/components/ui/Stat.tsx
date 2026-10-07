import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn.js';
import { number } from '@/lib/format.js';
import { Sparkline } from '../charts/index.jsx';

/**
 * Stat tile.
 *
 * The form for a single headline figure — a chart would be the wrong shape for
 * one number. The value uses proportional figures (it stands alone), and the
 * optional sparkline is a shape cue, not a readable series.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  trend,
  spark,
  to,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Draws attention when the figure is itself a problem. */
  tone?: 'default' | 'good' | 'warning' | 'critical';
  icon?: ReactNode;
  /** Period-over-period change, as a percentage. */
  trend?: { value: number; label?: string; invert?: boolean } | null;
  spark?: number[];
  to?: string;
  className?: string;
}) {
  const toneInk = {
    default: 'var(--ink-primary)',
    good: 'var(--status-good-ink)',
    warning: 'var(--status-warning-ink)',
    critical: 'var(--status-critical-ink)',
  }[tone];

  const sparkColor = {
    default: 'var(--series-1)',
    good: 'var(--status-good)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-critical)',
  }[tone];

  /*
   * A rise is not always good — more overdue tasks is worse. `invert` flips the
   * colouring, and the arrow states the direction independently of the colour.
   */
  const trendGood = trend ? (trend.invert ? trend.value < 0 : trend.value > 0) : false;

  const body = (
    <>
      <p className="text-sm text-[var(--ink-muted)]">{label}</p>
      {/* `icon` is accepted for compatibility but no longer drawn: the
          figure is the tile, and icons beside it only added noise. */}
      {void icon}

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <span
            className="block text-2xl leading-none font-semibold tracking-tight"
            style={{ color: toneInk }}
          >
            {typeof value === 'number' ? number(value) : value}
          </span>
          {(hint || trend) && (
            <span className="mt-1.5 flex items-center gap-1.5 text-2xs">
              {trend && (
                <span
                  className="inline-flex items-center gap-0.5 font-medium"
                  style={{
                    color: trendGood ? 'var(--status-good-ink)' : 'var(--status-critical-ink)',
                  }}
                >
                  <span aria-hidden="true">{trend.value > 0 ? '↑' : trend.value < 0 ? '↓' : '→'}</span>
                  {Math.abs(Math.round(trend.value))}%
                </span>
              )}
              {hint && <span className="truncate-line text-[var(--ink-muted)]">{hint}</span>}
            </span>
          )}
        </div>

        {spark && spark.length > 1 && (
          <div className="w-16 shrink-0">
            <Sparkline data={spark} color={sparkColor} height={26} />
          </div>
        )}
      </div>
    </>
  );

  const shell = cn(
    'glass-tile rounded-[var(--radius-lg)] p-4',
    to && 'block transition-[background-color,box-shadow] duration-[var(--duration)] ease-[var(--ease-glass)] hover:bg-[var(--surface-2)] hover:shadow-[var(--glass-shadow-sm)]',
    className,
  );

  return to ? (
    <Link to={to} className={shell}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

/** Responsive grid for a row of stat tiles. */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4', className)}>
      {children}
    </div>
  );
}
