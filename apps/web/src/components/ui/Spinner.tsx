import { cn } from '@/lib/cn.js';

/**
 * Indeterminate spinner.
 *
 * Drawn as an SVG arc rather than a bordered box so it stays circular at any
 * size and inherits `currentColor` from the button or text around it.
 */
export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 animate-[xs-spin_0.7s_linear_infinite]', className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Centred spinner with a label, for a page or panel that is still loading. */
export function LoadingState({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-[var(--ink-muted)]', className)}
    >
      <Spinner size={20} />
      <span className="text-xs">{label}…</span>
    </div>
  );
}

/** Shimmer placeholder matching the shape of the content it stands in for. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('xs-skeleton', className)} />;
}
