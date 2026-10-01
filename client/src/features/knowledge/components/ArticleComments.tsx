import { AxiosError } from 'axios'
import { Loader2, MessageSquare, Pencil, Reply, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { softSurface } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { relativeDate } from '@/features/knowledge/lib/knowledge-meta'
import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { knowledgeApi } from '@/services/knowledge.service'
import type { ArticleComment } from '@/types/knowledge'

interface ArticleCommentsProps {
  /** The article's slug — the API takes it in place of an id. */
  articleRef: string
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
}

/** A comment plus its replies counts as that many notes under the article. */
function countAll(comments: ArticleComment[]): number {
  return comments.reduce((total, comment) => total + 1 + comment.replies.length, 0)
}

export function ArticleComments({ articleRef }: ArticleCommentsProps) {
  const [comments, setComments] = useState<ArticleComment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(() => {
    setIsLoading(true)
    knowledgeApi
      .comments(articleRef)
      .then(({ data }) => setComments(data.comments))
      .catch(() => setComments([]))
      .finally(() => setIsLoading(false))
  }, [articleRef])

  useEffect(load, [load])

  const post = async (body: string, parent: string | null) => {
    setIsPosting(true)
    try {
      await knowledgeApi.addComment(articleRef, body, parent)
      setDraft('')
      setReplyTo(null)
      load()
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to post your comment'))
    } finally {
      setIsPosting(false)
    }
  }

  const remove = (comment: ArticleComment) => {
    const warning = comment.replies.length
      ? 'Delete this comment and the replies under it?'
      : 'Delete this comment?'
    if (!window.confirm(warning)) return

    knowledgeApi
      .removeComment(comment.id)
      .then(({ message }) => {
        toast.success(message)
        load()
      })
      .catch((error: unknown) => toast.error(errorMessage(error, 'Unable to delete the comment')))
  }

  const total = countAll(comments)

  return (
    <section className="flex flex-col gap-4" aria-label="Comments">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <MessageSquare className="size-4" aria-hidden />
        {total === 0 ? 'Discussion' : `${total} comment${total === 1 ? '' : 's'}`}
      </h2>

      <div className={cn(softSurface, 'flex flex-col gap-3 p-4')}>
        <Textarea
          value={replyTo ? '' : draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Ask a question, or add what this article is missing..."
          rows={3}
          disabled={!!replyTo}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            disabled={!draft.trim() || isPosting || !!replyTo}
            onClick={() => post(draft.trim(), null)}
          >
            {isPosting && !replyTo && <Loader2 className="animate-spin" />}
            Post comment
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : comments.length ? (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => (
            <li key={comment.id}>
              <CommentRow
                comment={comment}
                isEditing={editing === comment.id}
                isReplying={replyTo === comment.id}
                isBusy={isPosting}
                onReply={() => {
                  setEditing(null)
                  setReplyTo(replyTo === comment.id ? null : comment.id)
                }}
                onEdit={() => {
                  setReplyTo(null)
                  setEditing(editing === comment.id ? null : comment.id)
                }}
                onDelete={() => remove(comment)}
                onSubmitReply={(body) => post(body, comment.id)}
                onSubmitEdit={async (body) => {
                  try {
                    await knowledgeApi.updateComment(comment.id, body)
                    setEditing(null)
                    load()
                  } catch (error) {
                    toast.error(errorMessage(error, 'Unable to save your comment'))
                  }
                }}
              />

              {comment.replies.length > 0 && (
                <ul className="border-border/60 mt-3 ml-5 flex flex-col gap-3 border-l pl-4">
                  {comment.replies.map((reply) => (
                    <li key={reply.id}>
                      <CommentRow
                        comment={reply}
                        isEditing={editing === reply.id}
                        isReplying={false}
                        isBusy={isPosting}
                        onEdit={() => setEditing(editing === reply.id ? null : reply.id)}
                        onDelete={() => remove(reply)}
                        onSubmitEdit={async (body) => {
                          try {
                            await knowledgeApi.updateComment(reply.id, body)
                            setEditing(null)
                            load()
                          } catch (error) {
                            toast.error(errorMessage(error, 'Unable to save your comment'))
                          }
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          No comments yet — be the first to add something.
        </p>
      )}
    </section>
  )
}

interface CommentRowProps {
  comment: ArticleComment
  isEditing: boolean
  isReplying: boolean
  isBusy: boolean
  /** Replies cannot themselves be replied to; the thread stays one level deep. */
  onReply?: () => void
  onEdit: () => void
  onDelete: () => void
  onSubmitReply?: (body: string) => void
  onSubmitEdit: (body: string) => void
}

function CommentRow({
  comment,
  isEditing,
  isReplying,
  isBusy,
  onReply,
  onEdit,
  onDelete,
  onSubmitReply,
  onSubmitEdit,
}: CommentRowProps) {
  const [draft, setDraft] = useState(comment.body)
  const [reply, setReply] = useState('')

  // Reopening the editor starts from what is on screen, not a stale draft.
  useEffect(() => {
    if (isEditing) setDraft(comment.body)
  }, [isEditing, comment.body])

  return (
    <article className={cn(softSurface, 'group/comment flex flex-col gap-2 p-4')}>
      <header className="flex items-center gap-2">
        <Avatar className="size-7">
          <AvatarImage
            src={comment.author?.avatarUrl ?? undefined}
            alt={comment.author?.name ?? ''}
          />
          <AvatarFallback className="text-[10px]">
            {getInitials(comment.author?.name ?? '?')}
          </AvatarFallback>
        </Avatar>

        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">
            {comment.author?.name ?? 'Unknown'}
          </span>
          <span className="text-muted-foreground/70 text-[11px]">
            {relativeDate(comment.createdAt)}
            {comment.isEdited && ' · edited'}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-[var(--motion-control)] group-hover/comment:opacity-100 group-focus-within/comment:opacity-100">
          {onReply && (
            <Button variant="ghost" size="icon" className="size-7" onClick={onReply} aria-label="Reply">
              <Reply className="size-3.5" />
            </Button>
          )}
          {comment.canManage && (
            <>
              <Button variant="ghost" size="icon" className="size-7" onClick={onEdit} aria-label="Edit">
                <Pencil className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive size-7"
                onClick={onDelete}
                aria-label="Delete"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </header>

      {isEditing ? (
        <div className="flex flex-col gap-2">
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Cancel
            </Button>
            <Button size="sm" disabled={!draft.trim()} onClick={() => onSubmitEdit(draft.trim())}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-6 whitespace-pre-wrap">{comment.body}</p>
      )}

      {isReplying && onSubmitReply && (
        <div className="mt-1 flex flex-col gap-2">
          <Textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder={`Reply to ${comment.author?.name ?? 'this comment'}...`}
            rows={2}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onReply}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!reply.trim() || isBusy}
              onClick={() => {
                onSubmitReply(reply.trim())
                setReply('')
              }}
            >
              {isBusy && <Loader2 className="animate-spin" />}
              Reply
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}
