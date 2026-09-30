import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: string
  /** Trailing actions, right-aligned on wide viewports. */
  action?: React.ReactNode
  className?: string
}

export function PageHeader({ title, description, action, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col justify-between gap-3 sm:flex-row sm:items-end',
        className
      )}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{title}</h1>
        {description && <p className="text-muted-foreground text-sm">{description}</p>}
      </div>
      {action}
    </header>
  )
}
