import { Zap } from 'lucide-react'

import { cn } from '@/lib/utils'

export function Logo({ className, iconOnly }: { className?: string; iconOnly?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2 font-semibold', className)}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Zap className="size-4" />
      </span>
      {!iconOnly && <span className="text-base tracking-tight">Xenospace</span>}
    </div>
  )
}
