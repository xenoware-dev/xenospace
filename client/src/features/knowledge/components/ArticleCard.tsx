import { Bookmark, Eye, MessageSquare, Pin, ThumbsUp } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  categoryIcons,
  formatViews,
  readingTime,
  relativeDate,
  statusMeta,
} from '@/features/knowledge/lib/knowledge-meta'
import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Article } from '@/types/knowledge'

interface ArticleCardProps {
  article: Article
  /** Drafts and archived articles wear their status; the shelf does not need it. */
  showStatus?: boolean
  className?: string
}

export function ArticleCard({ article, showStatus = false, className }: ArticleCardProps) {
  const Icon = categoryIcons[article.category?.icon ?? 'book']
  const status = statusMeta[article.status]

  return (
    <Link
      to={`/knowledge-base/${article.slug}`}
      className={cn(
        'glass-tile group/article flex flex-col gap-3 rounded-2xl p-4',
        'focus-visible:ring-ring/40 outline-none focus-visible:ring-2',
        'transition-[filter,transform] duration-[var(--motion-control)] ease-[var(--ease-glass)]',
        'hover:brightness-105',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 text-xs">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{article.category?.name ?? 'Uncategorised'}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {article.isPinned && <Pin className="text-muted-foreground size-3.5" aria-hidden />}
          {article.isBookmarked && (
            <Bookmark className="fill-foreground text-foreground size-3.5" aria-hidden />
          )}
          {showStatus && (
            <Badge variant={status.variant} className="text-[10px]">
              {status.label}
            </Badge>
          )}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="line-clamp-2 text-base leading-snug font-semibold">{article.title}</h3>
        {article.excerpt && (
          <p className="text-muted-foreground line-clamp-2 text-sm leading-6">
            {article.excerpt}
          </p>
        )}
      </div>

      {article.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {article.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline" className="text-[10px] font-normal">
              {tag}
            </Badge>
          ))}
          {article.tags.length > 3 && (
            <span className="text-muted-foreground/70 self-center text-[10px]">
              +{article.tags.length - 3}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <span className="flex min-w-0 items-center gap-2">
          <Avatar className="size-6">
            <AvatarImage
              src={article.author?.avatarUrl ?? undefined}
              alt={article.author?.name ?? ''}
            />
            <AvatarFallback className="text-[10px]">
              {getInitials(article.author?.name ?? '?')}
            </AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground truncate text-xs">
            {article.author?.name ?? 'Unknown'}
          </span>
        </span>

        <span className="text-muted-foreground/70 flex shrink-0 items-center gap-2.5 text-[11px]">
          <span className="flex items-center gap-1" title={`${article.views} views`}>
            <Eye className="size-3" aria-hidden />
            {formatViews(article.views)}
          </span>
          {article.helpfulCount > 0 && (
            <span className="flex items-center gap-1">
              <ThumbsUp className="size-3" aria-hidden />
              {article.helpfulCount}
            </span>
          )}
          {article.commentCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3" aria-hidden />
              {article.commentCount}
            </span>
          )}
        </span>
      </div>

      <p className="text-muted-foreground/70 text-[11px]">
        {readingTime(article.readingMinutes)} ·{' '}
        {article.publishedAt
          ? `published ${relativeDate(article.publishedAt)}`
          : `updated ${relativeDate(article.updatedAt)}`}
      </p>
    </Link>
  )
}
