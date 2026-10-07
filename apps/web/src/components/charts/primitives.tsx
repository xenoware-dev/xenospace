import type { ReactNode } from 'react';
import { cn } from '@/lib/cn.js';

/**
 * Chart chrome.
 *
 * Shared frame, legend and tooltip so every chart in the app has the same
 * anatomy. The rules enforced here, rather than left to each chart:
 *
 *  - a legend is always rendered for two or more series, so identity is never
 *    carried by colour alone;
 *  - series colours are assigned from the validated palette in fixed slot
 *    order and never cycled;
 *  - grid and axes stay recessive, and marks lead.
 */

/** The validated categorical order. Index 0 is slot 1. */
export const SERIES = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
  'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)',
] as const;

/**
 * Colour for a series slot.
 *
 * Throws past slot 8 rather than wrapping: a cycled palette repeats a hue and
 * silently makes two series indistinguishable. A ninth series must be folded
 * into "Other" or faceted instead.
 */
export function seriesColor(index: number): string {
  const color = SERIES[index];
  if (!color) {
    throw new Error(
      `Series slot ${index} is out of range. The palette holds 8 validated slots; ` +
        'fold further series into "Other" or use small multiples.',
    );
  }
  return color;
}

/**
 * Fixed series slot per task status, in board order.
 *
 * Colour follows the entity, never its rank: filtering out an empty status must
 * not repaint the others. Slots were previously assigned by position in a
 * filtered list, so "Done" changed colour depending on what else had tasks.
 */
export const STATUS_SERIES = {
  BACKLOG: 'var(--series-8)',
  TODO: 'var(--series-4)',
  IN_PROGRESS: 'var(--series-1)',
  IN_REVIEW: 'var(--series-7)',
  BLOCKED: 'var(--series-2)',
  DONE: 'var(--series-3)',
} as const;

export const CHART_GRID = 'var(--chart-grid)';
export const CHART_AXIS = 'var(--chart-axis)';
export const CHART_LABEL = 'var(--chart-label)';

/** Axis defaults shared by every cartesian chart. */
export const axisProps = {
  stroke: CHART_AXIS,
  tick: { fill: CHART_LABEL, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: CHART_AXIS },
} as const;

export function ChartFrame({
  title,
  subtitle,
  action,
  legend,
  /** Fixed height: a chart inside a flex column needs an explicit box. */
  height = 240,
  children,
  footnote,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  legend?: ReactNode;
  height?: number;
  children: ReactNode;
  footnote?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn('m-0 flex min-w-0 flex-col', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && (
              <figcaption className="text-sm font-semibold text-[var(--ink-primary)]">{title}</figcaption>
            )}
            {subtitle && <p className="mt-0.5 text-2xs text-[var(--ink-muted)]">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}

      {legend && <div className="mb-2">{legend}</div>}

      <div style={{ height }} className="min-w-0">
        {children}
      </div>

      {footnote && <p className="mt-2 text-2xs text-[var(--ink-faint)]">{footnote}</p>}
    </figure>
  );
}

export interface LegendEntry {
  label: string;
  color: string;
  value?: string | number;
}

/**
 * Legend.
 *
 * A swatch plus a text label, with the value in ink rather than the series
 * colour — coloured text at this size fails contrast and reads as decoration.
 */
export function Legend({ entries, className }: { entries: LegendEntry[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {entries.map((entry) => (
        <li key={entry.label} className="flex items-center gap-1.5 text-2xs">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-[2px]"
            style={{ background: entry.color }}
          />
          <span className="text-[var(--ink-secondary)]">{entry.label}</span>
          {entry.value !== undefined && (
            <span className="font-medium text-[var(--ink-primary)] tabular-nums">{entry.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Tooltip body, shared by every chart's hover layer. */
export function ChartTooltip({
  label,
  rows,
}: {
  label?: ReactNode;
  rows: Array<{ label: string; value: ReactNode; color?: string }>;
}) {
  return (
    <div
      className={cn(
        'glass-overlay pointer-events-none min-w-32 rounded-[var(--radius-md)] px-2.5 py-2',
      )}
    >
      {label !== undefined && (
        <p className="mb-1.5 text-2xs font-medium text-[var(--ink-primary)]">{label}</p>
      )}
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3 text-2xs">
            <span className="flex items-center gap-1.5">
              {row.color && (
                <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: row.color }} />
              )}
              <span className="text-[var(--ink-muted)]">{row.label}</span>
            </span>
            <span className="font-medium text-[var(--ink-primary)] tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Accessible table alternative.
 *
 * Required relief wherever a series colour sits below 3:1 on its surface —
 * which three light-mode slots do. Collapsed by default so it does not
 * compete with the chart.
 */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer list-none text-2xs text-[var(--ink-muted)] transition-colors hover:text-[var(--ink-secondary)]">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-90">▸</span>
          View as table
        </span>
      </summary>
      <div className="mt-2 max-h-56 overflow-auto rounded-[var(--radius-md)] ring-1 ring-[var(--line-subtle)]">
        <table className="w-full border-collapse text-2xs">
          <caption className="sr-only-focusable">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    'sticky top-0 bg-[var(--surface-2)] px-2.5 py-1.5 font-medium text-[var(--ink-muted)]',
                    index === 0 ? 'text-left' : 'text-right',
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-[var(--line-subtle)]">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={cn(
                      'px-2.5 py-1.5 text-[var(--ink-secondary)]',
                      cellIndex === 0 ? 'text-left' : 'text-right tabular-nums',
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
