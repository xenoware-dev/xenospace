import { ChevronRight, HardDrive } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { FileBreadcrumb } from '@/types/file'

interface FileBreadcrumbsProps {
  trail: FileBreadcrumb[]
  onNavigate: (folderId: string | null) => void
}

/** The path back out of a folder, root first. The last crumb is where you are. */
export function FileBreadcrumbs({ trail, onNavigate }: FileBreadcrumbsProps) {
  return (
    <nav aria-label="Folder path" className="flex min-w-0 items-center gap-0.5 text-sm">
      <Button
        variant="ghost"
        size="sm"
        className={cn('gap-1.5 px-2', trail.length === 0 && 'text-foreground font-medium')}
        onClick={() => onNavigate(null)}
      >
        <HardDrive className="size-3.5" />
        Library
      </Button>

      {trail.map((crumb, index) => {
        const isLast = index === trail.length - 1

        return (
          <span key={crumb.id} className="flex min-w-0 items-center gap-0.5">
            <ChevronRight className="text-muted-foreground/60 size-3.5 shrink-0" aria-hidden />
            <Button
              variant="ghost"
              size="sm"
              disabled={isLast}
              aria-current={isLast ? 'page' : undefined}
              className={cn(
                'min-w-0 px-2',
                isLast && 'text-foreground font-medium disabled:opacity-100'
              )}
              onClick={() => onNavigate(crumb.id)}
            >
              <span className="truncate">{crumb.name}</span>
            </Button>
          </span>
        )
      })}
    </nav>
  )
}
