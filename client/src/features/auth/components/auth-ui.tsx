import { Eye, EyeOff, Loader2 } from 'lucide-react'
import * as React from 'react'

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
  'h-12 rounded-xl border-white/10 bg-white/5 text-white placeholder:text-white/30 ' +
  'focus-visible:border-white/25 focus-visible:ring-white/10'

export function AuthHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-8 text-center">
      <h1 className="text-[2rem] leading-tight font-semibold tracking-tight text-white">{title}</h1>
      {description && <p className="mt-2 text-sm text-white/45">{description}</p>}
    </div>
  )
}

/** Field labels sit quietly above the input rather than competing with it. */
export const authLabel = 'text-sm font-normal text-white/55'

/** A password input with a reveal toggle, matching the reference's eye affordance. */
export function PasswordField({ className, ...props }: React.ComponentProps<'input'>) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <FormControl>
        <Input
          {...props}
          type={visible ? 'text' : 'password'}
          className={cn(authField, 'pr-12', className)}
        />
      </FormControl>
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-white/45 transition-colors hover:text-white"
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
        'mt-3 h-12 w-full rounded-xl bg-white font-semibold text-neutral-950 hover:bg-white/90',
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
  return <p className={cn('mt-7 text-center text-sm text-white/45', className)} {...props} />
}

export const authLink = 'font-semibold text-white hover:underline'
