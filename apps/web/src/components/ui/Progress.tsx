import { cn } from '@/lib/cn.js';

/**
 * Progress bar.
 *
 * Carries its value as text as well as width, because a bar alone is not
 * readable to a screen reader and hard to read precisely by eye.
 */
export function Progress({
  value,
  tone = 'accent',
  size = 'md',
  showLabel = false,
  label,
  className,
}: {
  value: number;
  tone?: 'accent' | 'good' | 'warning' | 'critical';
  size?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  label?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const colors = {
    accent: 'var(--accent)',
    good: 'var(--status-good)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-critical)',
  };
  const heights = { xs: 'h-1', sm: 'h-1.5', md: 'h-2' };

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `${clamped}% complete`}
        className={cn('flex-1 overflow-hidden rounded-[var(--radius-full)] bg-[var(--surface-3)]', heights[size])}
      >
        <div
          className="h-full rounded-[var(--radius-full)] transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-out)]"
          style={{ width: `${clamped}%`, background: colors[tone] }}
        />
      </div>
      {showLabel && (
        <span className="w-8 shrink-0 text-right text-2xs font-medium text-[var(--ink-muted)] tabular-nums">
          {clamped}%
        </span>
      )}
    </div>
  );
}

/** Compact donut, for a progress figure that sits beside a title. */
export function ProgressRing({
  value,
  size = 36,
  thickness = 3.5,
  tone = 'accent',
}: {
  value: number;
  size?: number;
  thickness?: number;
  tone?: 'accent' | 'good' | 'warning' | 'critical';
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const colors = {
    accent: 'var(--accent)',
    good: 'var(--status-good)',
    warning: 'var(--status-warning)',
    critical: 'var(--status-critical)',
  };

  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      {/* Rotated so the arc starts at twelve o'clock rather than three. */}
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors[tone]}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-[var(--duration-slow)] ease-[var(--ease-out)]"
        />
      </svg>
      <span className="absolute text-[9px] font-semibold text-[var(--ink-secondary)] tabular-nums">
        {clamped}
      </span>
      <span className="sr-only-focusable">{clamped}% complete</span>
    </div>
  );
}
