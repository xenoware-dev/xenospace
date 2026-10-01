import { Eye, EyeOff, Loader2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { FormControl } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/**
 * The auth screen renders dark in both themes, so its controls are spelled out
 * against white rather than leaning on the themed tokens: a recessed field, a
 * hairline edge and a solid white primary action.
 */
export const authField =
  'h-11 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/35 ' +
  'focus-visible:border-white/25 focus-visible:ring-white/10'

const authGhostField =
  'h-11 rounded-xl border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white'

export function AuthHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-7 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
      {description && <p className="mt-2 text-sm text-white/50">{description}</p>}
    </div>
  )
}

/**
 * Social sign-in is part of the visual language of this screen, but no provider
 * is wired up on the server yet — say so rather than failing silently.
 */
export function SocialAuthButtons() {
  const notConnected = (provider: string) =>
    toast.info(`${provider} sign-in isn't connected yet`)

  return (
    <div className="grid grid-cols-2 gap-3">
      <Button
        type="button"
        variant="outline"
        className={authGhostField}
        onClick={() => notConnected('Google')}
      >
        <GoogleMark />
        Google
      </Button>
      <Button
        type="button"
        variant="outline"
        className={authGhostField}
        onClick={() => notConnected('GitHub')}
      >
        <GithubMark />
        Github
      </Button>
    </div>
  )
}

export function AuthDivider({ label = 'Or' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-4">
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-xs text-white/40">{label}</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  )
}

export function AuthLabel({ className, ...props }: React.ComponentProps<'span'>) {
  return <span className={cn('text-sm font-medium text-white', className)} {...props} />
}

/** A password input with a reveal toggle, matching the reference's eye affordance. */
export function PasswordField({ className, ...props }: React.ComponentProps<'input'>) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <FormControl>
        <Input
          {...props}
          type={visible ? 'text' : 'password'}
          className={cn(authField, 'pr-11', className)}
        />
      </FormControl>
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-white/45 transition-colors hover:text-white"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function AuthSubmit({
  pending,
  children,
  className,
  ...props
}: React.ComponentProps<'button'> & { pending?: boolean }) {
  return (
    <Button
      type="submit"
      disabled={pending}
      className={cn(
        'mt-2 h-11 w-full rounded-xl bg-white font-semibold text-neutral-950 hover:bg-white/90',
        className
      )}
      {...props}
    >
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  )
}

export function AuthFooterNote({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('mt-7 text-center text-sm text-white/50', className)} {...props} />
}

export const authLink = 'font-semibold text-white hover:underline'

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.44a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.09 3.58-5.17 3.58-8.86Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.7 0 3.99 2.47 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}

function GithubMark() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.73.5.9 5.48.9 11.92c0 5.05 3.29 9.33 7.86 10.84.57.1.78-.26.78-.57v-2.2c-3.2.71-3.87-1.42-3.87-1.42-.53-1.37-1.29-1.74-1.29-1.74-1.05-.74.08-.72.08-.72 1.16.08 1.77 1.22 1.77 1.22 1.03 1.82 2.7 1.29 3.36.99.1-.77.4-1.29.73-1.59-2.55-.3-5.24-1.31-5.24-5.83 0-1.29.44-2.34 1.17-3.17-.12-.3-.51-1.5.11-3.12 0 0 .96-.32 3.15 1.21a10.6 10.6 0 0 1 5.74 0c2.19-1.53 3.15-1.21 3.15-1.21.62 1.62.23 2.82.11 3.12.73.83 1.17 1.88 1.17 3.17 0 4.53-2.69 5.53-5.25 5.82.41.37.78 1.1.78 2.22v3.29c0 .31.21.68.79.56a11.06 11.06 0 0 0 7.85-10.83C23.1 5.48 18.27.5 12 .5Z" />
    </svg>
  )
}
