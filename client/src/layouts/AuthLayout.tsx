import { Check } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import { Logo } from '@/components/common/Logo'
import { RouteTransition } from '@/components/layout/RouteTransition'
import { cn } from '@/lib/utils'

interface Panel {
  title: string
  description: string
  steps: string[]
  /** Which step the current route is on; earlier ones render as done. */
  active: number
}

const signupSteps = ['Sign up your account', 'Verify your email', 'Set up your profile']
const resetSteps = ['Request a reset link', 'Check your inbox', 'Choose a new password']

const panels: Record<string, Panel> = {
  '/login': {
    title: 'Welcome Back to Xenospace',
    description: 'Sign in to pick up right where your team left off.',
    steps: ['Sign in to your account', 'Choose your workspace', 'Back to your work'],
    active: 0,
  },
  '/register': {
    title: 'Get Started with Us',
    description: 'Complete these easy steps to register your account.',
    steps: signupSteps,
    active: 0,
  },
  '/verify-email': {
    title: 'Almost There',
    description: 'One click and your account is ready to use.',
    steps: signupSteps,
    active: 1,
  },
  '/forgot-password': {
    title: 'Forgot Your Password?',
    description: 'It happens. These steps will get you back in.',
    steps: resetSteps,
    active: 0,
  },
  '/reset-password': {
    title: 'Choose a New Password',
    description: 'Last step — pick something strong and memorable.',
    steps: resetSteps,
    active: 2,
  },
}

/**
 * The split sign-in shell: an aurora panel carrying the brand and the journey
 * on the left, the routed form on the right. It stays dark in both themes, the
 * way the rail does.
 */
export function AuthLayout() {
  const { pathname } = useLocation()
  const panel = panels[pathname] ?? panels['/login']

  return (
    <div className="auth-canvas relative flex min-h-svh gap-4 p-3 text-white lg:p-4 dark">
      {/* Below lg the aurora panel is dropped, so the brand glow moves overhead. */}
      <div
        aria-hidden
        className="auth-aurora pointer-events-none absolute inset-x-0 top-0 h-64 [mask-image:linear-gradient(to_bottom,black,transparent)] lg:hidden"
      />

      <aside className="auth-aurora relative hidden w-[48%] max-w-[660px] shrink-0 flex-col justify-end overflow-hidden rounded-3xl p-10 lg:flex">
        {/* Keyed on the path so switching auth routes replays the shared tempo. */}
        <div key={pathname} className="animate-tab-enter">
          <div className="flex flex-col items-center text-center">
            <Logo className="text-base" />
            <h2 className="mt-7 text-4xl leading-tight font-semibold tracking-tight">
              {panel.title}
            </h2>
            <p className="mt-3 max-w-xs text-sm text-white/55">{panel.description}</p>
          </div>

          <ol className="mt-10 flex flex-col gap-3">
            {panel.steps.map((step, index) => {
              const isActive = index === panel.active
              const isDone = index < panel.active

              return (
                <li
                  key={step}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-colors duration-[var(--motion-control)]',
                    isActive
                      ? 'bg-white text-neutral-950'
                      : 'bg-white/[0.06] text-white/55 ring-1 ring-white/10 ring-inset'
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      isActive
                        ? 'bg-neutral-950 text-white'
                        : isDone
                          ? 'bg-white/80 text-neutral-950'
                          : 'bg-white/15 text-white/70'
                    )}
                  >
                    {isDone ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  {step}
                </li>
              )
            })}
          </ol>
        </div>
      </aside>

      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-10">
        <div className="mb-10 lg:hidden">
          <Logo className="text-base" />
        </div>
        <div className="w-full max-w-[360px]">
          {/* Login → register → forgot password cross-fade like the app's views. */}
          <RouteTransition />
        </div>
      </main>
    </div>
  )
}
