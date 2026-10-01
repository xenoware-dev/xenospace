import { softSurface } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface SectionCardProps {
  title: string
  description?: string
  /** Trailing action, right-aligned against the title. */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/**
 * The panel every admin page is built from — a glass tile with a titled head.
 * It is deliberately one component rather than four near-identical ones, so the
 * console reads as a single surface no matter which route painted it.
 */
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: SectionCardProps) {
  return (
    <section className={cn(softSurface, 'flex flex-col gap-4 p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-muted-foreground text-xs">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
