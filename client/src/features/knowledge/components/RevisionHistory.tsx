import { AxiosError } from 'axios'
import { History, Loader2, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { softSurface } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { MarkdownView } from '@/features/knowledge/components/MarkdownView'
import { formatArticleDateTime, relativeDate } from '@/features/knowledge/lib/knowledge-meta'
import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { knowledgeApi } from '@/services/knowledge.service'
import type { ArticleRevision } from '@/types/knowledge'

interface RevisionHistoryProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  articleRef: string
  currentVersion: number
  /** Whether the reader may put an old version back. */
  canManage: boolean
  onRestored: () => void
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
}

/**
 * The version log, with any one version readable in place. The history is
 * append-only, so restoring does not erase what is live — it saves the old
 * content as a new version on top.
 */
export function RevisionHistory({
  open,
  onOpenChange,
  articleRef,
  currentVersion,
  canManage,
  onRestored,
}: RevisionHistoryProps) {
  const [revisions, setRevisions] = useState<ArticleRevision[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [preview, setPreview] = useState<ArticleRevision | null>(null)
  const [busyVersion, setBusyVersion] = useState<number | null>(null)

  const load = useCallback(() => {
    setIsLoading(true)
    knowledgeApi
      .revisions(articleRef)
      .then(({ data }) => setRevisions(data.revisions))
      .catch(() => setRevisions([]))
      .finally(() => setIsLoading(false))
  }, [articleRef])

  // The sheet is mounted once and reused, so each opening refetches the log.
  useEffect(() => {
    if (!open) {
      setPreview(null)
      return
    }
    load()
  }, [open, load])

  const openPreview = (version: number) => {
    setBusyVersion(version)
    knowledgeApi
      .revision(articleRef, version)
      .then(({ data }) => setPreview(data.revision))
      .catch((error: unknown) => toast.error(errorMessage(error, 'Unable to open that version')))
      .finally(() => setBusyVersion(null))
  }

  const restore = (version: number) => {
    if (!window.confirm(`Put version ${version} back as the current article?`)) return

    setBusyVersion(version)
    knowledgeApi
      .restoreRevision(articleRef, version)
      .then(({ message }) => {
        toast.success(message)
        setPreview(null)
        onOpenChange(false)
        onRestored()
      })
      .catch((error: unknown) =>
        toast.error(errorMessage(error, 'Unable to restore that version'))
      )
      .finally(() => setBusyVersion(null))
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="size-4" aria-hidden />
            Version history
          </SheetTitle>
          <SheetDescription>
            Every save is kept. Restoring an old version adds it on top rather than erasing
            what is here now.
          </SheetDescription>
        </SheetHeader>

        <Separator />

        <div className="flex flex-col gap-3 p-4">
          {isLoading ? (
            <>
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </>
          ) : (
            revisions.map((revision) => {
              const isCurrent = revision.version === currentVersion
              const isOpen = preview?.version === revision.version

              return (
                <div key={revision.id} className={cn(softSurface, 'flex flex-col gap-3 p-3')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar className="size-7">
                        <AvatarImage
                          src={revision.editedBy?.avatarUrl ?? undefined}
                          alt={revision.editedBy?.name ?? ''}
                        />
                        <AvatarFallback className="text-[10px]">
                          {getInitials(revision.editedBy?.name ?? '?')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium">
                          {revision.editedBy?.name ?? 'Unknown'}
                        </span>
                        <span
                          className="text-muted-foreground/70 text-[11px]"
                          title={formatArticleDateTime(revision.createdAt)}
                        >
                          {relativeDate(revision.createdAt)} · {revision.wordCount} words
                        </span>
                      </div>
                    </div>

                    <Badge variant={isCurrent ? 'success' : 'outline'} className="shrink-0">
                      {isCurrent ? 'Current' : `v${revision.version}`}
                    </Badge>
                  </div>

                  <p className="text-sm">{revision.title}</p>
                  {revision.changeNote && (
                    <p className="text-muted-foreground text-xs italic">{revision.changeNote}</p>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => (isOpen ? setPreview(null) : openPreview(revision.version))}
                      disabled={busyVersion === revision.version}
                    >
                      {busyVersion === revision.version && <Loader2 className="animate-spin" />}
                      {isOpen ? 'Hide' : 'Read'}
                    </Button>
                    {canManage && !isCurrent && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restore(revision.version)}
                        disabled={busyVersion === revision.version}
                      >
                        <RotateCcw />
                        Restore
                      </Button>
                    )}
                  </div>

                  {isOpen && preview && (
                    <div className="animate-tab-enter border-border/60 border-t pt-3">
                      <MarkdownView markdown={preview.body ?? ''} className="text-sm" />
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
