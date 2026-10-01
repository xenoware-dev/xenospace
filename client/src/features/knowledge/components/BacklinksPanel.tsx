import { CornerUpLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

import { softSurface } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Article } from '@/types/knowledge'

interface BacklinksPanelProps {
  backlinks: Article[]
  /** How many `[[links]]` this article points out through. */
  outgoing: number
  className?: string
}

/**
 * What points here. The reverse of a wiki link is the half people never
 * write by hand, and it is usually the more useful direction: it is how you
 * find the runbook that depends on the page you are about to change.
 */
export function BacklinksPanel({ backlinks, outgoing, className }: BacklinksPanelProps) {
  return (
    <div className={cn(softSurface, 'flex flex-col gap-2 p-3', className)}>
      <p className="text-muted-foreground flex items-center gap-1.5 px-1 py-0.5 text-xs font-medium">
        <CornerUpLeft className="size-3.5" aria-hidden />
        Linked mentions
        <span className="text-muted-foreground/70 ml-auto tabular-nums">
          {backlinks.length} in · {outgoing} out
        </span>
      </p>

      {backlinks.length ? (
        backlinks.map((article) => (
          <Link
            key={article.id}
            to={`/knowledge-base/${article.slug}`}
            className="hover:bg-glass-tile focus-visible:ring-ring/40 rounded-lg px-2 py-1.5 text-xs leading-5 outline-none transition-colors duration-[var(--motion-control)] focus-visible:ring-2"
          >
            <span className="line-clamp-2">{article.title}</span>
          </Link>
        ))
      ) : (
        <p className="text-muted-foreground/70 px-2 py-1 text-xs leading-5">
          Nothing links here yet. Mention it from another article with{' '}
          <code className="glass-control rounded px-1 py-0.5 font-mono">[[…]]</code>.
        </p>
      )}
    </div>
  )
}
