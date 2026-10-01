import { Check } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import { Logo } from '@/components/common/Logo'
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
 * The sign-in shell: one centred column on a black page lit by a violet bloom
 * overhead. There is no second panel — the brand, the journey and the routed
 * form read top to bottom as a single page. It stays dark in both themes, the
 * way the rail does.
 *
 * The heading belongs to each routed page rather than to this shell, because
 * several of them swap it for a state of their own ("Check Your Inbox",
 * "Invalid Link"); a title here would sit above and contradict it.
 */
export function AuthLayout() {
  const { pathname } = useLocation()
  const journey = journeys[pathname] ?? journeys['/login']

  return (
    <div className="auth-canvas relative flex min-h-svh flex-col items-center justify-center px-4 py-12 text-white dark">
      {/*
        The aurora is now an overhead wash across the whole page rather than the
        fill of a side panel, so the colour still arrives from above.
      */}
      <div
        aria-hidden
        className="auth-aurora pointer-events-none absolute inset-x-0 top-0 h-[22rem] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />

      <div className="relative flex w-full max-w-[400px] flex-col items-center">
        {/* Keyed on the path so switching auth routes replays the shared tempo. */}
        <div key={pathname} className="animate-tab-enter flex w-full flex-col items-center">
          <Logo className="text-base" />

          <ol className="mt-8 mb-9 flex flex-wrap items-center justify-center gap-1.5">
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
                      Only the step being worked on is spelled out, to keep the
                      row narrow; the rest stay readable to a screen reader.
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
        </div>

        <div className="w-full">
          {/* Login → register → forgot password cross-fade like the app's views. */}
          <RouteTransition />
        </div>
      </div>
    </div>
  )
}
