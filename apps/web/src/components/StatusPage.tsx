import type { ReactNode } from 'react';
import { cn } from '@/lib/cn.js';

/**
 * Full-page explanation for when something stops the user: an unknown link,
 * missing access, a refused sign-in, a crash.
 *
 * Each one says what happened in plain words, why, and offers the one or two
 * things that actually help, rather than a bare status code. `fullScreen` is
 * for pages outside the app shell (sign-in, 404); inside the shell it sits in
 * the content panel.
 */
export function StatusPage({
  code,
  icon,
  tone = 'neutral',
  title,
  message,
  detail,
  actions,
  footnote,
  fullScreen = false,
}: {
  /** Shown large and faint behind the card, e.g. "404". */
  code: string;
  icon: ReactNode;
  tone?: 'neutral' | 'warning' | 'critical';
  title: string;
  message: ReactNode;
  /** A highlighted fact, e.g. the account that was refused. */
  detail?: ReactNode;
  actions?: ReactNode;
  footnote?: ReactNode;
  fullScreen?: boolean;
}) {
  const toneColor =
    tone === 'critical' ? 'var(--status-critical)' : tone === 'warning' ? 'var(--status-warning)' : 'var(--ink-muted)';

  return (
    <main
      className={cn(
        'relative grid place-items-center overflow-hidden px-4 py-12',
        fullScreen ? 'min-h-dvh bg-[var(--surface-page)]' : 'min-h-[70vh]',
      )}
    >
      {/* The code is texture, not content: screen readers get the title. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 hidden -translate-x-1/2 -translate-y-1/2 font-mono sm:block text-[clamp(7rem,28vw,16rem)] leading-none font-bold tracking-tighter text-[var(--ink-primary)] opacity-[0.04] select-none"
      >
        {code}
      </span>

      <div className="glass-tile relative w-full max-w-md rounded-[var(--radius-xl)] p-6 text-center sm:p-8">
        {fullScreen && (
          <a href="/" className="mb-6 inline-flex items-center gap-2" aria-label="XenoSpace home">
            <span
              aria-hidden="true"
              className="grid size-8 place-items-center rounded-[var(--radius-md)] text-sm font-bold text-white"
              style={{ background: 'linear-gradient(140deg, var(--accent), #a855f7)' }}
            >
              X
            </span>
            <span className="text-sm font-semibold tracking-tight">XenoSpace</span>
          </a>
        )}

        <span
          aria-hidden="true"
          className="mx-auto grid size-12 place-items-center rounded-full"
          style={{
            color: toneColor,
            background: `color-mix(in oklch, ${toneColor} 14%, transparent)`,
          }}
        >
          {icon}
        </span>

        <p className="mt-4 font-mono text-xs text-[var(--ink-faint)]">Error {code}</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">{message}</p>

        {detail && (
          <div className="glass-control mt-5 rounded-[var(--radius-md)] px-3 py-2.5 text-sm break-all">{detail}</div>
        )}

        {actions && <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">{actions}</div>}

        {footnote && <p className="mt-6 text-xs leading-relaxed text-[var(--ink-faint)]">{footnote}</p>}
      </div>
    </main>
  );
}
