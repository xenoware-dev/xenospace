import { useEffect, useState } from 'react'

import { softSurface } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ArticleHeading } from '@/types/knowledge'

interface ArticleTocProps {
  headings: ArticleHeading[]
  className?: string
}

/**
 * The table of contents beside a long article. The highlight follows the
 * reader: whichever heading most recently crossed the top quarter of the
 * viewport is the one they are inside.
 */
export function ArticleToc({ headings, className }: ArticleTocProps) {
  const [activeId, setActiveId] = useState<string | null>(headings[0]?.id ?? null)

  useEffect(() => {
    if (!headings.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)

        if (visible[0]) setActiveId(visible[0].target.id)
      },
      // A band across the upper part of the view, so a heading counts as
      // "current" from the moment it reaches the top rather than the middle.
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    )

    for (const heading of headings) {
      const element = document.getElementById(heading.id)
      if (element) observer.observe(element)
    }

    return () => observer.disconnect()
  }, [headings])

  if (headings.length < 2) return null

  return (
    <nav className={cn(softSurface, 'flex flex-col gap-1 p-3', className)} aria-label="On this page">
      <p className="text-muted-foreground px-2 py-1 text-xs font-medium">On this page</p>

      {headings.map((heading) => (
        <a
          key={heading.id}
          href={`#${heading.id}`}
          onClick={() => setActiveId(heading.id)}
          className={cn(
            'truncate rounded-lg px-2 py-1 text-xs leading-5',
            'transition-[background-color,color] duration-[var(--motion-control)] ease-[var(--ease-glass)]',
            heading.level >= 3 && 'pl-5',
            heading.level >= 4 && 'pl-8',
            activeId === heading.id
              ? 'glass-raised text-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {heading.text}
        </a>
      ))}
    </nav>
  )
}
