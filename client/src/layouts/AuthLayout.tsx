import { Check, Zap } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import { RouteTransition } from '@/components/layout/RouteTransition'
import { cn } from '@/lib/utils'

interface Journey {
  steps: string[]
  /** Which step the current route is on; earlier ones render as done. */
  active: number
}

const signupSteps = ['Sign up your account', 'Verify your email', 'Set up your profile']
const resetSteps = ['Request a reset link', 'Check your inbox', 'Choose a new password']
const signinSteps = ['Sign in to your account', 'Choose your workspace', 'Back to your work']

const journeys: Record<string, Journey> = {
  '/login': { steps: signinSteps, active: 0 },
  '/register': { steps: signupSteps, active: 0 },
  '/verify-email': { steps: signupSteps, active: 1 },
  '/forgot-password': { steps: resetSteps, active: 0 },
  '/reset-password': { steps: resetSteps, active: 2 },
}

/**
 * The sign-in shell: a black page split into a brand panel lit by a violet
 * bloom and a form column beside it. Below `lg` the panel folds away and the
 * form takes the full page, so the flow still works on a phone.
 *
 * It stays dark in both themes, the way the rail does.
 *
 * The heading belongs to each routed page rather than to this shell, because
 * several of them swap it for a state of their own ("Check Your Inbox",
 * "Invalid Link"); a title here would sit above and contradict it.
 */
export function AuthLayout() {
  const { pathname } = useLocation()
  const journey = journeys[pathname] ?? journeys['/login']

  return (
    <div className="auth-canvas dark flex min-h-svh text-white lg:p-4">
      {/*
        The brand half. It is a card inset from the page edge rather than a
        flush column, so the black page reads as a frame around the colour.
      */}
      <aside className="hidden w-[46%] max-w-[560px] shrink-0 lg:block">
        <div className="auth-canvas relative flex h-full flex-col items-center justify-end overflow-hidden rounded-[1.75rem] px-10 pb-20">
          {/*
            The bloom is painted by a child rather than the panel itself so it
            can drift without moving the content layered over it.
          */}
          <div
            aria-hidden
            className="auth-brand-panel auth-brand-bloom pointer-events-none absolute -inset-[15%]"
          />

          <div className="relative flex flex-col items-center text-center">
            {/*
              The mark stacks over the wordmark here instead of sitting beside
              it, which the shared Logo does; this is the one place it is the
              subject of the screen rather than a label in a corner.
            */}
            <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 ring-inset backdrop-blur-sm">
              <Zap className="size-6" />
            </span>
            <h2 className="mt-5 text-3xl font-semibold tracking-tight">Xenospace</h2>
            <p className="mt-2 text-sm text-white/60">Your team&apos;s work, in one place.</p>
          </div>

          <JourneySteps journey={journey} className="relative mt-12" />
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          {/* Keyed on the path so switching auth routes replays the shared tempo. */}
          <JourneySteps
            key={pathname}
            journey={journey}
            className="animate-tab-enter mb-9 lg:hidden"
          />

          {/* Login → register → forgot password cross-fade like the app's views. */}
          <RouteTransition />
        </div>
      </main>
    </div>
  )
}

function JourneySteps({ journey, className }: { journey: Journey; className?: string }) {
  return (
    <ol className={cn('flex flex-wrap items-center justify-center gap-1.5', className)}>
      {journey.steps.map((step, index) => {
        const isActive = index === journey.active
        const isDone = index < journey.active

        return (
          <li
            key={step}
            aria-current={isActive ? 'step' : undefined}
            className="flex items-center gap-1.5"
          >
            <span
              className={cn(
                'flex items-center gap-2 rounded-full text-xs font-medium',
                'transition-colors duration-[var(--motion-tab)] ease-[var(--ease-glass)]',
                isActive
                  ? 'bg-white py-1.5 pr-3.5 pl-1.5 text-neutral-950'
                  : 'bg-white/[0.06] p-1.5 text-white/55 ring-1 ring-white/10 ring-inset'
              )}
            >
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  isActive
                    ? 'bg-neutral-950 text-white'
                    : isDone
                      ? 'bg-white/80 text-neutral-950'
                      : 'bg-white/15 text-white/70'
                )}
              >
                {isDone ? <Check className="size-3" /> : index + 1}
              </span>
              {/*
                Only the step being worked on is spelled out, to keep the row
                narrow; the rest stay readable to a screen reader.
              */}
              <span className={cn('whitespace-nowrap', !isActive && 'sr-only')}>{step}</span>
            </span>

            {index < journey.steps.length - 1 && (
              <span aria-hidden className="h-px w-4 bg-white/15" />
            )}
          </li>
        )
      })}
    </ol>
  )
}
