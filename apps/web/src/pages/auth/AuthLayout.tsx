import type { ReactNode } from 'react';
import { Zap } from '@/components/icons.jsx';

/**
 * Shell for the signed-out pages, built from the same parts as the app itself:
 * the ambient backdrop, a glass panel, the rail's logo tile and the page title
 * scale. Signing in should feel like the door to the workspace, not a
 * different product.
 */
export function AuthLayout({
  title,
  subtitle,
  eyebrow,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  /** Small label above the title, e.g. "Invite-only workspace". */
  eyebrow?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <main className="glass w-full max-w-md rounded-[28px] px-6 py-8 sm:px-10 sm:py-10">
        <header className="flex items-center gap-3">
          {/* The rail's logo tile, so the mark is the one people see inside. */}
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-[var(--radius-lg)] bg-white text-black shadow-[0_6px_20px_rgb(0_0_0/0.35)]"
          >
            <Zap size={18} />
          </span>
          <span className="text-base font-semibold tracking-tight">XenoSpace</span>
        </header>

        <div className="mt-10">
          {eyebrow && <div className="mb-5">{eyebrow}</div>}
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
          {subtitle && <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)]">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <p className="mt-6 text-xs leading-relaxed text-[var(--ink-muted)]">{footer}</p>}
        </div>
      </main>

      <p className="text-2xs text-[var(--ink-faint)]">© {new Date().getFullYear()} Xenoware · XenoSpace</p>
    </div>
  );
}
