import { AxiosError } from 'axios'
import {
  ArrowLeft,
  Bookmark,
  Eye,
  History,
  MoreHorizontal,
  Pencil,
  Pin,
  ThumbsUp,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ArticleCard } from '@/features/knowledge/components/ArticleCard'
import { ArticleComments } from '@/features/knowledge/components/ArticleComments'
import { ArticleToc } from '@/features/knowledge/components/ArticleToc'
import { BacklinksPanel } from '@/features/knowledge/components/BacklinksPanel'
import { KnowledgeGraph } from '@/features/knowledge/components/KnowledgeGraph'
import { MarkdownView } from '@/features/knowledge/components/MarkdownView'
import { RevisionHistory } from '@/features/knowledge/components/RevisionHistory'
import {
  categoryIcons,
  formatArticleDate,
  formatViews,
  readingTime,
  relativeDate,
  statusMeta,
  visibilityMeta,
} from '@/features/knowledge/lib/knowledge-meta'
import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { knowledgeApi } from '@/services/knowledge.service'
import { useAuthStore } from '@/store/auth.store'
import {
  ARTICLE_STATUSES,
  KNOWLEDGE_MANAGER_ROLES,
  type ArticleDetail,
  type ArticleGraph,
  type ArticleStatus,
} from '@/types/knowledge'

function errorMessage(error: unknown, fallback: string) {
  return error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
}

export default function ArticlePage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()

  const currentUser = useAuthStore((s) => s.user)
  const isManager = !!currentUser && KNOWLEDGE_MANAGER_ROLES.includes(currentUser.role)

  const [detail, setDetail] = useState<ArticleDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [localGraph, setLocalGraph] = useState<ArticleGraph | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const load = useCallback(() => {
    setIsLoading(true)
    setNotFound(false)
    knowledgeApi
      .get(slug)
      .then(({ data }) => setDetail(data))
      .catch((error: unknown) => {
        setDetail(null)
        setNotFound(true)
        toast.error(errorMessage(error, 'Unable to open that article'))
      })
      .finally(() => setIsLoading(false))
  }, [slug])

  useEffect(load, [load])

  // The neighbourhood around this article: one hop out, which is what fits
  // in a sidebar and what a reader can actually take in at a glance.
  useEffect(() => {
    knowledgeApi
      .graph({ focus: slug, depth: 1 })
      .then(({ data }) => setLocalGraph(data))
      .catch(() => setLocalGraph(null))
  }, [slug])

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  if (notFound || !detail) {
    return (
      <Card variant="elevated">
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-medium">That article is not here</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            It may have been deleted, or it may be a draft you do not have access to.
          </p>
          <Button asChild variant="outline">
            <Link to="/knowledge-base">
              <ArrowLeft />
              Back to the knowledge base
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  const { article, headings, related, linkTargets, backlinks } = detail
  const Icon = categoryIcons[article.category?.icon ?? 'book']
  const status = statusMeta[article.status]
  const visibility = visibilityMeta[article.visibility]
  const isAuthor = article.author?.id === currentUser?.id

  // The server already matched every [[target]] in the body, so the renderer
  // looks each one up rather than guessing at a slug.
  const resolveWikiLink = (target: string) =>
    linkTargets.find((link) => link.target.toLowerCase() === target.toLowerCase()) ?? null

  /** Every action re-reads the article, so counts and status stay honest. */
  const run = (promise: Promise<{ message: string }>, fallback: string) =>
    promise
      .then(({ message }) => {
        toast.success(message)
        load()
      })
      .catch((error: unknown) => toast.error(errorMessage(error, fallback)))

  const onDelete = () => {
    if (!window.confirm(`Delete "${article.title}"? Its history and comments go with it.`)) {
      return
    }

    knowledgeApi
      .remove(article.slug)
      .then(({ message }) => {
        toast.success(message)
        navigate('/knowledge-base')
      })
      .catch((error: unknown) => toast.error(errorMessage(error, 'Unable to delete the article')))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground -ml-2">
          <Link to="/knowledge-base">
            <ArrowLeft />
            Knowledge base
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant={article.isBookmarked ? 'secondary' : 'outline'}
            size="sm"
            onClick={() =>
              run(knowledgeApi.bookmark(article.slug), 'Unable to update your bookmark')
            }
          >
            <Bookmark className={cn(article.isBookmarked && 'fill-current')} />
            {article.isBookmarked ? 'Bookmarked' : 'Bookmark'}
          </Button>

          {article.canManage && (
            <Button asChild variant="outline" size="sm">
              <Link to={`/knowledge-base/${article.slug}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                <History />
                Version history
                <span className="text-muted-foreground ml-auto text-xs">v{article.version}</span>
              </DropdownMenuItem>

              {isManager && article.status === 'PUBLISHED' && (
                <DropdownMenuItem
                  onSelect={() => run(knowledgeApi.pin(article.slug), 'Unable to pin the article')}
                >
                  <Pin />
                  {article.isPinned ? 'Unpin from the top' : 'Pin to the top'}
                </DropdownMenuItem>
              )}

              {article.canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                    Status
                  </DropdownMenuLabel>
                  {ARTICLE_STATUSES.filter((value) => value !== article.status).map((value) => (
                    <DropdownMenuItem
                      key={value}
                      onSelect={() =>
                        run(
                          knowledgeApi.setStatus(article.slug, value as ArticleStatus),
                          'Unable to change the status'
                        )
                      }
                    >
                      {statusMeta[value].label}
                    </DropdownMenuItem>
                  ))}

                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2 />
                    Delete article
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_240px]">
        <article className="flex min-w-0 flex-col gap-6">
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {article.category && (
                <Link
                  to={`/knowledge-base?category=${article.category.id}`}
                  className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm transition-colors duration-[var(--motion-control)]"
                >
                  <Icon className="size-4" aria-hidden />
                  {article.category.name}
                </Link>
              )}
              {article.status !== 'PUBLISHED' && (
                <Badge variant={status.variant} title={status.description}>
                  {status.label}
                </Badge>
              )}
              {article.visibility !== 'TEAM' && (
                <Badge variant={visibility.variant} title={visibility.description}>
                  {article.visibility === 'PROJECT' && article.project
                    ? article.project.key
                    : visibility.label}
                </Badge>
              )}
              {article.isPinned && (
                <Badge variant="outline">
                  <Pin className="size-3" />
                  Pinned
                </Badge>
              )}
            </div>

            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{article.title}</h1>

            {article.excerpt && (
              <p className="text-muted-foreground max-w-[70ch] text-base leading-7">
                {article.excerpt}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="flex items-center gap-2">
                <Avatar className="size-8">
                  <AvatarImage
                    src={article.author?.avatarUrl ?? undefined}
                    alt={article.author?.name ?? ''}
                  />
                  <AvatarFallback className="text-xs">
                    {getInitials(article.author?.name ?? '?')}
                  </AvatarFallback>
                </Avatar>
                <span className="flex flex-col">
                  <Link
                    to={`/team/${article.author?.id ?? ''}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {article.author?.name ?? 'Unknown'}
                  </Link>
                  <span className="text-muted-foreground/70 text-xs">
                    {article.publishedAt
                      ? `Published ${formatArticleDate(article.publishedAt)}`
                      : 'Not published yet'}
                    {article.updatedAt !== article.createdAt &&
                      ` · updated ${relativeDate(article.updatedAt)}`}
                  </span>
                </span>
              </span>

              <span className="text-muted-foreground flex items-center gap-4 text-xs">
                <span>{readingTime(article.readingMinutes)}</span>
                <span className="flex items-center gap-1" title={`${article.views} views`}>
                  <Eye className="size-3.5" aria-hidden />
                  {formatViews(article.views)}
                </span>
              </span>
            </div>

            {article.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {article.tags.map((tag) => (
                  <Link key={tag} to={`/knowledge-base?tag=${encodeURIComponent(tag)}`}>
                    <Badge variant="outline" className="font-normal hover:brightness-110">
                      {tag}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </header>

          <Separator />

          <MarkdownView markdown={article.body ?? ''} resolveWikiLink={resolveWikiLink} />

          <Separator />

          {/* The vote is the cheapest signal we get about whether an article
              is actually doing its job, so it sits at the end of the read. */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant={article.isHelpful ? 'secondary' : 'outline'}
                size="sm"
                disabled={isAuthor}
                title={isAuthor ? 'You cannot vote on your own article' : undefined}
                onClick={() =>
                  run(knowledgeApi.helpful(article.slug), 'Unable to record your vote')
                }
              >
                <ThumbsUp className={cn(article.isHelpful && 'fill-current')} />
                {article.isHelpful ? 'Marked helpful' : 'This was helpful'}
              </Button>
              {article.helpfulCount > 0 && (
                <span className="text-muted-foreground text-sm">
                  {article.helpfulCount} {article.helpfulCount === 1 ? 'person' : 'people'} found
                  this helpful
                </span>
              )}
            </div>

            {article.contributors.length > 1 && (
              <span className="text-muted-foreground text-xs">
                Written with {article.contributors.length - 1} other
                {article.contributors.length === 2 ? '' : 's'}
              </span>
            )}
          </div>

          <ArticleComments articleRef={article.slug} />
        </article>

        <aside className="hidden flex-col gap-4 xl:flex">
          <div className="sticky top-4 flex flex-col gap-4">
            <ArticleToc headings={headings} />

            {localGraph && localGraph.nodes.length > 1 && (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground px-1 text-xs font-medium">Local graph</p>
                <KnowledgeGraph graph={localGraph} focusId={article.id} height={220} />
              </div>
            )}

            <BacklinksPanel backlinks={backlinks} outgoing={linkTargets.length} />

            {related.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-muted-foreground px-1 text-xs font-medium">Related</p>
                {related.map((item) => (
                  <Link
                    key={item.id}
                    to={`/knowledge-base/${item.slug}`}
                    className="glass-tile hover:brightness-105 focus-visible:ring-ring/40 rounded-xl p-3 text-sm leading-snug outline-none transition-[filter] duration-[var(--motion-control)] ease-[var(--ease-glass)] focus-visible:ring-2"
                  >
                    <span className="line-clamp-2 font-medium">{item.title}</span>
                    <span className="text-muted-foreground/70 mt-1 block text-[11px]">
                      {readingTime(item.readingMinutes)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Related cards get a row of their own below the fold on narrow views,
          where the sidebar is hidden entirely. */}
      {related.length > 0 && (
        <div className="flex flex-col gap-3 xl:hidden">
          <Separator />
          <h2 className="text-lg font-semibold">Related articles</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {related.map((item) => (
              <ArticleCard key={item.id} article={item} />
            ))}
          </div>
        </div>
      )}

      <RevisionHistory
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        articleRef={article.slug}
        currentVersion={article.version}
        canManage={article.canManage}
        onRestored={load}
      />
    </div>
  )
}
