import { useMemo } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { cn } from '@/lib/cn.js';
import { number, shortDate } from '@/lib/format.js';
import {
  CHART_GRID, ChartFrame, ChartTable, ChartTooltip, Legend, axisProps, seriesColor,
  type LegendEntry,
} from './primitives.jsx';

/**
 * Chart library.
 *
 * Every chart here follows the same rules: one y-axis (never a dual axis), a
 * legend whenever there are two or more series, a hover layer by default, a
 * table alternative, thin marks and a recessive grid.
 */

const tooltipDefaults = {
  cursor: { stroke: 'var(--line-strong)', strokeWidth: 1 },
  // Recharts' own wrapper styling is replaced wholesale by ChartTooltip.
  contentStyle: { background: 'none', border: 'none', boxShadow: 'none', padding: 0 },
  wrapperStyle: { outline: 'none' },
} as const;

/* ------------------------------------------------------- throughput (area) */

export interface ThroughputPoint {
  date: string;
  created: number;
  completed: number;
}

/** Created vs completed over time. Two series, so a legend is mandatory. */
export function ThroughputChart({
  data,
  height = 220,
  title,
  subtitle,
}: {
  data: ThroughputPoint[];
  height?: number;
  title?: string;
  subtitle?: string;
}) {
  const totals = useMemo(
    () => ({
      created: data.reduce((sum, d) => sum + d.created, 0),
      completed: data.reduce((sum, d) => sum + d.completed, 0),
    }),
    [data],
  );

  const legend: LegendEntry[] = [
    { label: 'Completed', color: seriesColor(0), value: number(totals.completed) },
    { label: 'Created', color: seriesColor(1), value: number(totals.created) },
  ];

  return (
    <ChartFrame title={title} subtitle={subtitle} legend={<Legend entries={legend} />} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <defs>
            {/* A soft vertical fade keeps the fill from flattening the line. */}
            <linearGradient id="xs-fill-completed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(0)} stopOpacity={0.28} />
              <stop offset="100%" stopColor={seriesColor(0)} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="xs-fill-created" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(1)} stopOpacity={0.2} />
              <stop offset="100%" stopColor={seriesColor(1)} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          {/* Horizontal only: vertical lines add noise on a dense time axis. */}
          <CartesianGrid stroke={CHART_GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="date"
            {...axisProps}
            tickFormatter={(value: string) => shortDate(value)}
            minTickGap={28}
          />
          <YAxis {...axisProps} width={44} allowDecimals={false} />
          <Tooltip
            {...tooltipDefaults}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip
                  label={shortDate(label as string)}
                  rows={payload.map((entry) => ({
                    label: entry.name === 'completed' ? 'Completed' : 'Created',
                    value: number(Number(entry.value)),
                    color: entry.color,
                  }))}
                />
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="completed"
            stroke={seriesColor(0)}
            strokeWidth={2}
            fill="url(#xs-fill-completed)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }}
          />
          <Area
            type="monotone"
            dataKey="created"
            stroke={seriesColor(1)}
            strokeWidth={2}
            strokeDasharray="4 3"
            fill="url(#xs-fill-created)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <ChartTable
        caption="Tasks created and completed per day"
        columns={['Date', 'Completed', 'Created']}
        rows={data.map((d) => [shortDate(d.date), d.completed, d.created])}
      />
    </ChartFrame>
  );
}

/* ----------------------------------------------------- velocity (grouped) */

export interface VelocityPoint {
  sprint: string;
  committed: number;
  completed: number;
}

export function VelocityChart({ data, height = 220, title }: { data: VelocityPoint[]; height?: number; title?: string }) {
  const legend: LegendEntry[] = [
    { label: 'Committed', color: seriesColor(3) },
    { label: 'Completed', color: seriesColor(0) },
  ];

  return (
    <ChartFrame title={title} legend={<Legend entries={legend} />} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        {/* barGap puts a 2px surface gap between adjacent bars. */}
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid stroke={CHART_GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="sprint" {...axisProps} />
          <YAxis {...axisProps} width={44} allowDecimals={false} />
          <Tooltip
            {...tooltipDefaults}
            cursor={{ fill: 'var(--wash-hover)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip
                  label={label as string}
                  rows={payload.map((entry) => ({
                    label: entry.name === 'committed' ? 'Committed' : 'Completed',
                    value: `${number(Number(entry.value))} pts`,
                    color: entry.color,
                  }))}
                />
              ) : null
            }
          />
          <Bar dataKey="committed" fill={seriesColor(3)} radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="completed" fill={seriesColor(0)} radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>

      <ChartTable
        caption="Story points committed and completed per sprint"
        columns={['Sprint', 'Committed', 'Completed']}
        rows={data.map((d) => [d.sprint, d.committed, d.completed])}
      />
    </ChartFrame>
  );
}

/* ----------------------------------------------------- burndown (2 lines) */

export interface BurndownPoint {
  date: string;
  remaining: number;
  ideal: number;
}

export function BurndownChart({ data, height = 220, title }: { data: BurndownPoint[]; height?: number; title?: string }) {
  const legend: LegendEntry[] = [
    { label: 'Remaining', color: seriesColor(0) },
    { label: 'Ideal', color: 'var(--ink-faint)' },
  ];

  return (
    <ChartFrame title={title} legend={<Legend entries={legend} />} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={CHART_GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="date" {...axisProps} tickFormatter={(v: string) => shortDate(v)} minTickGap={24} />
          <YAxis {...axisProps} width={44} allowDecimals={false} />
          <Tooltip
            {...tooltipDefaults}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <ChartTooltip
                  label={shortDate(label as string)}
                  rows={payload
                    // The remaining series is NaN for future dates, so those
                    // rows are dropped rather than shown as zero.
                    .filter((entry) => Number.isFinite(Number(entry.value)))
                    .map((entry) => ({
                      label: entry.name === 'remaining' ? 'Remaining' : 'Ideal',
                      value: `${number(Number(entry.value))} pts`,
                      color: entry.color,
                    }))}
                />
              ) : null
            }
          />
          <Line
            type="linear"
            dataKey="ideal"
            stroke="var(--ink-faint)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="remaining"
            stroke={seriesColor(0)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-1)' }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/* ------------------------------------------------------- distribution bar */

export interface DistributionSlice {
  label: string;
  value: number;
  color: string;
}

/**
 * Horizontal distribution.
 *
 * Preferred over a pie for comparing magnitudes — a bar's length is far easier
 * to compare than an angle — and every row is directly labelled.
 */
export function DistributionBars({
  slices,
  title,
  subtitle,
  total,
  className,
}: {
  slices: DistributionSlice[];
  title?: string;
  subtitle?: string;
  total?: number;
  className?: string;
}) {
  const sum = total ?? slices.reduce((acc, s) => acc + s.value, 0);
  const max = Math.max(1, ...slices.map((s) => s.value));

  return (
    <div className={cn('min-w-0', className)}>
      {title && (
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-2xs text-[var(--ink-muted)]">{subtitle}</p>}
        </div>
      )}

      {sum === 0 ? (
        <p className="py-6 text-center text-xs text-[var(--ink-muted)]">Nothing to show yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {slices.map((slice) => (
            <li key={slice.label} className="group">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-2xs">
                <span className="truncate-line text-[var(--ink-secondary)]">{slice.label}</span>
                <span className="shrink-0 font-medium text-[var(--ink-primary)] tabular-nums">
                  {number(slice.value)}
                  <span className="ml-1 text-[var(--ink-faint)]">
                    {sum > 0 ? `${Math.round((slice.value / sum) * 100)}%` : ''}
                  </span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-[var(--radius-full)] bg-[var(--surface-3)]">
                <div
                  className="h-full rounded-[var(--radius-full)] transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out)]"
                  style={{ width: `${(slice.value / max) * 100}%`, background: slice.color }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- donut */

/**
 * Donut.
 *
 * Reserved for a part-to-whole where the whole is the point, such as deployment
 * success rate. The figure sits in the hole, because reading a proportion off
 * arc angles alone is unreliable.
 */
export function DonutChart({
  slices,
  centerValue,
  centerLabel,
  height = 180,
  title,
}: {
  slices: DistributionSlice[];
  centerValue: string;
  centerLabel: string;
  height?: number;
  title?: string;
}) {
  const data = slices.filter((s) => s.value > 0);

  return (
    <ChartFrame title={title} legend={<Legend entries={slices} />} height={height}>
      <div className="relative h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="64%"
              outerRadius="92%"
              startAngle={90}
              endAngle={-270}
              // A 2px surface gap keeps adjacent segments from merging.
              paddingAngle={2}
              stroke="var(--surface-1)"
              strokeWidth={2}
            >
              {data.map((slice) => (
                <Cell key={slice.label} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              {...tooltipDefaults}
              cursor={false}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <ChartTooltip
                    rows={[
                      {
                        label: String(payload[0]?.name ?? ''),
                        value: number(Number(payload[0]?.value)),
                        color: payload[0]?.payload?.color as string,
                      },
                    ]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tracking-tight text-[var(--ink-primary)]">
            {centerValue}
          </span>
          <span className="mt-0.5 text-2xs text-[var(--ink-muted)]">{centerLabel}</span>
        </div>
      </div>
    </ChartFrame>
  );
}

/* ------------------------------------------------------- sparkline (bare) */

/**
 * Sparkline.
 *
 * Deliberately has no axes, grid or hover: it is a glyph inside a stat tile,
 * read for shape rather than value. The tile carries the number.
 */
export function Sparkline({
  data,
  color = seriesColor(0),
  height = 32,
  className,
}: {
  data: number[];
  color?: string;
  height?: number;
  className?: string;
}) {
  if (data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const width = 100;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      style={{ height }}
      aria-hidden="true"
    >
      <polyline
        points={`0,${height} ${points.join(' ')} ${width},${height}`}
        fill={color}
        opacity={0.12}
      />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ---------------------------------------------------- contribution heatmap */

/**
 * Year-long contribution grid.
 *
 * A sequential single-hue ramp, light to dark, where the lightest step means
 * "nothing" and recedes toward the surface — never a rainbow, because the value
 * being encoded is magnitude, not identity.
 */
export function ContributionHeatmap({
  data,
  title,
  className,
}: {
  data: Array<{ date: string; count: number }>;
  title?: string;
  className?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.count));

  const step = (count: number): string => {
    if (count === 0) return 'var(--surface-3)';
    const ratio = count / max;
    if (ratio <= 0.25) return 'var(--seq-200)';
    if (ratio <= 0.5) return 'var(--seq-300)';
    if (ratio <= 0.75) return 'var(--seq-500)';
    return 'var(--seq-600)';
  };

  // Grouped into calendar weeks so the grid reads vertically by weekday.
  const weeks: Array<Array<{ date: string; count: number } | null>> = [];
  let current: Array<{ date: string; count: number } | null> = [];
  data.forEach((day, index) => {
    const weekday = new Date(`${day.date}T00:00:00`).getDay();
    if (index === 0 && weekday > 0) {
      // Pad the first partial week so weekday rows stay aligned.
      current = Array.from({ length: weekday }, () => null);
    }
    current.push(day);
    if (current.length === 7) {
      weeks.push(current);
      current = [];
    }
  });
  if (current.length > 0) weeks.push(current);

  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className={cn('min-w-0', className)}>
      {title && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--ink-primary)]">{title}</h3>
          <span className="text-2xs text-[var(--ink-muted)]">
            {number(total)} completed in the last year
          </span>
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px]">
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[3px]">
              {week.map((day, dayIndex) =>
                day ? (
                  <span
                    key={day.date}
                    title={`${day.count} on ${shortDate(day.date)}`}
                    className="size-[10px] shrink-0 rounded-[2px] transition-transform hover:scale-125"
                    style={{ background: step(day.count) }}
                  />
                ) : (
                  <span key={`pad-${dayIndex}`} className="size-[10px] shrink-0" />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5 text-2xs text-[var(--ink-faint)]">
        <span>Less</span>
        {['var(--surface-3)', 'var(--seq-200)', 'var(--seq-300)', 'var(--seq-500)', 'var(--seq-600)'].map((color) => (
          <span key={color} aria-hidden="true" className="size-[10px] rounded-[2px]" style={{ background: color }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

export { ChartFrame, Legend, ChartTooltip, ChartTable, seriesColor, STATUS_SERIES } from './primitives.jsx';
