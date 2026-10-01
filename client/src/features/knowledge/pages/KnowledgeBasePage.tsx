import { AxiosError } from 'axios'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  PenLine,
  Search,
  Share2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useDebouncedCallback } from 'use-debounce'

import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArticleCard } from '@/features/knowledge/components/ArticleCard'
import { CategoryFormDialog } from '@/features/knowledge/components/CategoryFormDialog'
import { CategoryShelf } from '@/features/knowledge/components/CategoryShelf'
import { KnowledgeGraph } from '@/features/knowledge/components/KnowledgeGraph'
import { TagCloud } from '@/features/knowledge/components/TagCloud'
import { scopeLabels, sortLabels } from '@/features/knowledge/lib/knowledge-meta'
import { knowledgeApi } from '@/services/knowledge.service'
import { useAuthStore } from '@/store/auth.store'
import {
  ARTICLE_SCOPES,
  ARTICLE_SORTS,
  CATEGORY_MANAGER_ROLES,
  type Article,
  type ArticleCategory,
  type ArticleGraph,
  type ArticleScope,
  type ArticleSort,
  type KnowledgeSummary,
  type Pagination,
} from '@/types/knowledge'

const PAGE_SIZE = 12

export default function KnowledgeBasePage() {
  // The open shelf and tag live in the URL, so a filtered view can be linked
  // to and the back button walks back out of it.
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryId = searchParams.get('category')
  const tag = searchParams.get('tag')

  const currentUser = useAuthStore((s) => s.user)
  const canCurate = !!currentUser && CATEGORY_MANAGER_ROLES.includes(currentUser.role)

  const [items, setItems] = useState<Article[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [categories, setCategories] = useState<ArticleCategory[]>([])
  const [summary, setSummary] = useState<KnowledgeSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [scope, setScope] = useState<ArticleScope>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<ArticleSort>('recent')
  const [page, setPage] = useState(1)
  const [view, setView] = useState<'cards' | 'graph'>('cards')

  const [graph, setGraph] = useState<ArticleGraph | null>(null)
  const [isGraphLoading, setIsGraphLoading] = useState(false)

  const [categoryFormOpen, setCategoryFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ArticleCategory | undefined>(undefined)

  const load = useCallback(() => {
    setIsLoading(true)
    knowledgeApi
      .list({
        page,
        limit: PAGE_SIZE,
        scope,
        category: categoryId ?? undefined,
        tag: tag ?? undefined,
        search: search || undefined,
        sort,
      })
      .then(({ data }) => {
        setItems(data.items)
        setPagination(data.pagination)
      })
      .catch((error: unknown) => {
        const fallback = 'Unable to load the knowledge base'
        toast.error(
          error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
        )
      })
      .finally(() => setIsLoading(false))
  }, [page, scope, categoryId, tag, search, sort])

  useEffect(load, [load])

  const loadAside = useCallback(() => {
    knowledgeApi
      .categories()
      .then(({ data }) => setCategories(data.categories))
      .catch(() => setCategories([]))
    knowledgeApi
      .summary()
      .then(({ data }) => setSummary(data.summary))
      .catch(() => setSummary(null))
  }, [])

  useEffect(loadAside, [loadAside])

  // The graph draws the whole filtered shelf at once, so it is fetched on its
  // own rather than paged like the cards — and only once the reader asks for it.
  useEffect(() => {
    if (view !== 'graph') return

    setIsGraphLoading(true)
    knowledgeApi
      .graph({ scope, category: categoryId ?? undefined, tag: tag ?? undefined })
      .then(({ data }) => setGraph(data))
      .catch(() => setGraph(null))
      .finally(() => setIsGraphLoading(false))
  }, [view, scope, categoryId, tag])

  /** One place to change a URL filter, so the page always resets with it. */
  const setFilter = useCallback(
    (patch: { category?: string | null; tag?: string | null }) => {
      setPage(1)
      setSearchParams(
        (params) => {
          for (const [key, value] of Object.entries(patch)) {
            if (value) params.set(key, value)
            else params.delete(key)
          }
          return params
        },
        { replace: false }
      )
    },
    [setSearchParams]
  )

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setPage(1)
    setSearch(value)
  }, 350)

  const activeCategory = categories.find((category) => category.id === categoryId) ?? null
  const totalPublished = categories.reduce((sum, category) => sum + category.articleCount, 0)

  // Any change of view replays the shared tab motion, matching route changes.
  const viewKey = `${scope}-${categoryId ?? 'all'}-${tag ?? ''}-${sort}-${search}-${page}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Knowledge Base"
        description="How Xenoware works, written down — handbooks, runbooks and the answers people keep asking for"
        action={
          <Button asChild>
            <Link to="/knowledge-base/new">
              <PenLine />
              Write an article
            </Link>
          </Button>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Published" value={summary.published} />
          <StatTile label="Updated this month" value={summary.updatedThisMonth} />
          <StatTile label="Total reads" value={summary.views} />
          <StatTile label="Your bookmarks" value={summary.bookmarks} />
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={scope}
          onValueChange={(value) => {
            setPage(1)
            setScope(value as ArticleScope)
          }}
        >
          <TabsList>
            {ARTICLE_SCOPES.map((value) => (
              <TabsTrigger key={value} value={value}>
                {scopeLabels[value]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search every article by title, tag or what is inside it..."
            className="pl-8"
            onChange={(event) => debouncedSetSearch(event.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <Select value={sort} onValueChange={(value) => setSort(value as ArticleSort)}>
            <SelectTrigger className="flex-1 lg:w-52">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {ARTICLE_SORTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {sortLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tabs value={view} onValueChange={(value) => setView(value as 'cards' | 'graph')}>
            <TabsList>
              <TabsTrigger value="cards" aria-label="Card view">
                <LayoutGrid className="size-4" />
              </TabsTrigger>
              <TabsTrigger value="graph" aria-label="Graph view">
                <Share2 className="size-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden flex-col gap-4 xl:flex">
          <CategoryShelf
            categories={categories}
            activeId={categoryId}
            totalCount={totalPublished}
            onSelect={(id) => setFilter({ category: id })}
            canCurate={canCurate}
            onAdd={() => {
              setEditingCategory(undefined)
              setCategoryFormOpen(true)
            }}
            onEdit={(category) => {
              setEditingCategory(category)
              setCategoryFormOpen(true)
            }}
          />
          {summary && (
            <TagCloud
              tags={summary.tags}
              activeTag={tag}
              onSelect={(value) => setFilter({ tag: value })}
            />
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-4">
          {(activeCategory || tag) && (
            <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              <span>Showing</span>
              {activeCategory && (
                <button
                  type="button"
                  onClick={() => setFilter({ category: null })}
                  className="glass-tile text-foreground rounded-full px-2.5 py-1 text-xs"
                >
                  {activeCategory.name} ✕
                </button>
              )}
              {tag && (
                <button
                  type="button"
                  onClick={() => setFilter({ tag: null })}
                  className="glass-tile text-foreground rounded-full px-2.5 py-1 text-xs"
                >
                  #{tag} ✕
                </button>
              )}
            </div>
          )}

          {activeCategory?.description && (
            <p className="text-muted-foreground max-w-[70ch] text-sm leading-6">
              {activeCategory.description}
            </p>
          )}

          {view === 'graph' ? (
            <div className="animate-tab-enter flex flex-col gap-3">
              {isGraphLoading && !graph ? (
                <Skeleton className="h-[520px] rounded-2xl" />
              ) : graph ? (
                <>
                  <KnowledgeGraph graph={graph} height={520} />
                  <p className="text-muted-foreground text-xs leading-5">
                    Each dot is an article and each line a{' '}
                    <code className="glass-control rounded px-1 py-0.5 font-mono">[[link]]</code>{' '}
                    between two of them — bigger dots are more connected, hollow ones are linked
                    to nothing yet. Drag to rearrange, scroll to zoom, click to open.
                    {graph.stats.unresolved > 0 &&
                      ` ${graph.stats.unresolved} link${
                        graph.stats.unresolved === 1 ? '' : 's'
                      } point at articles nobody has written.`}
                    {graph.stats.truncated &&
                      ' Only the most-read articles are drawn — narrow the shelf to see the rest.'}
                  </p>
                </>
              ) : (
                <Card variant="elevated">
                  <CardContent className="text-muted-foreground py-10 text-center text-sm">
                    Unable to draw the graph just now.
                  </CardContent>
                </Card>
              )}
            </div>
          ) : isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-56 rounded-2xl" />
              ))}
            </div>
          ) : items.length ? (
            <div key={viewKey} className="animate-tab-enter grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {items.map((article) => (
                <ArticleCard
                  key={article.id}
                  article={article}
                  showStatus={scope !== 'all'}
                />
              ))}
            </div>
          ) : (
            <Card variant="elevated">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <BookOpen className="text-muted-foreground size-8" aria-hidden />
                <p className="font-medium">Nothing here yet</p>
                <p className="text-muted-foreground max-w-sm text-sm">
                  {search
                    ? 'No article matches that search. Try a broader term, or clear the shelf and tag filters.'
                    : scope === 'bookmarks'
                      ? 'Bookmark an article and it will be waiting here next time.'
                      : 'Write the first one — the knowledge base is only as good as what the team puts in it.'}
                </p>
                {!search && scope !== 'bookmarks' && (
                  <Button asChild variant="outline">
                    <Link to="/knowledge-base/new">
                      <PenLine />
                      Write an article
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {view === 'cards' && pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">
                Page {pagination.page} of {pagination.pages} · {pagination.total} article
                {pagination.total === 1 ? '' : 's'}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <CategoryFormDialog
        open={categoryFormOpen}
        onOpenChange={setCategoryFormOpen}
        category={editingCategory}
        onSaved={loadAside}
      />
    </div>
  )
}
