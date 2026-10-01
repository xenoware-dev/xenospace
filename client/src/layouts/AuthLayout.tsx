import { Zap } from 'lucide-react'

import { RouteTransition } from '@/components/layout/RouteTransition'

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
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          {/* Login → register → forgot password cross-fade like the app's views. */}
          <RouteTransition />
        </div>
      </main>
    </div>
  )
}
