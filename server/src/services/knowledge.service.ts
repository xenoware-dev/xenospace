import { Types } from 'mongoose'
import type { HydratedDocument, QueryFilter, SortOrder } from 'mongoose'

import { ArticleCategory } from '@/models/ArticleCategory.model'
import { ArticleComment, type IArticleComment } from '@/models/ArticleComment.model'
import { ArticleRevision } from '@/models/ArticleRevision.model'
import { Article, type IArticle } from '@/models/Article.model'
import { Project } from '@/models/Project.model'
import {
  CATEGORY_MANAGER_ROLES,
  KNOWLEDGE_MANAGER_ROLES,
  MAX_GRAPH_NODES,
  READABLE_ARTICLE_STATUSES,
  type ArticleStatus,
  type ArticleVisibility,
  type CategoryIcon,
  type Role,
} from '@/types/enums'
import { ApiError } from '@/utils/ApiError'
import {
  excerptFrom,
  headingsOf,
  readingMinutesOf,
  slugify,
  wikiLinksOf,
  wordCountOf,
  type ArticleHeading,
} from '@/utils/article-text'
import { idOf, toArticleCategoryRef, type ArticleCategoryRef } from '@/utils/refs'
import {
  serializeArticle,
  serializeCategory,
  serializeComment,
  serializeRevision,
  type SafeArticle,
  type SafeArticleComment,
} from '@/utils/serialize-article'

type ArticleDoc = HydratedDocument<IArticle>
type CommentDoc = HydratedDocument<IArticleComment>

const USER_REF_FIELDS = 'name username avatarUrl role presenceStatus'

const POPULATE = [
  { path: 'category', select: 'name slug icon' },
  { path: 'author', select: USER_REF_FIELDS },
  { path: 'lastEditedBy', select: USER_REF_FIELDS },
  { path: 'project', select: 'name key' },
]

/** The byline on a long article names everyone who has touched it. */
const DETAIL_POPULATE = [...POPULATE, { path: 'contributors', select: USER_REF_FIELDS }]

/** Pinned articles head every shelf, whichever order the rest is in. */
const SORTS = {
  recent: { isPinned: -1, publishedAt: -1, createdAt: -1 },
  updated: { isPinned: -1, updatedAt: -1 },
  popular: { isPinned: -1, views: -1, publishedAt: -1 },
  title: { isPinned: -1, title: 1 },
} as const satisfies Record<string, Record<string, SortOrder>>

export type ArticleSort = keyof typeof SORTS

/** Which slice of the knowledge base a request is looking at. */
export type ArticleScope = 'all' | 'mine' | 'bookmarks' | 'drafts' | 'archived'

interface Actor {
  id: string
  role: Role
}

interface ListArticlesInput {
  page: number
  limit: number
  scope: ArticleScope
  category?: string
  tag?: string
  status?: ArticleStatus
  search?: string
  sort: ArticleSort
}

interface ArticleInput {
  title?: string
  excerpt?: string
  body?: string
  category?: string
  tags?: string[]
  visibility?: ArticleVisibility
  project?: string | null
  /** Saved onto the revision this edit creates, not onto the article. */
  changeNote?: string
}

interface CategoryInput {
  name?: string
  description?: string
  icon?: CategoryIcon
  order?: number
}

function isManager(actor: Actor) {
  return KNOWLEDGE_MANAGER_ROLES.includes(actor.role)
}

function canCurate(actor: Actor) {
  return CATEGORY_MANAGER_ROLES.includes(actor.role)
}

/**
 * Editing, publishing and deleting belong to the author or a knowledge manager.
 * Managers reach unpublished work too, the same way they reach the whole file
 * library — the knowledge base is a shared asset, not a set of private notes.
 */
function canManage(article: ArticleDoc, actor: Actor) {
  return isManager(actor) || idOf(article.author) === actor.id
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Project ids the actor leads or belongs to, behind PROJECT visibility. */
async function visibleProjectIds(actor: Actor) {
  return Project.find({ $or: [{ lead: actor.id }, { members: actor.id }] }).distinct('_id')
}

/**
 * The reach of one person over the shelf, as a Mongo filter. Two conditions
 * have to hold at once: the article has to be addressed to them, and it has to
 * have left the drafting stage — unless it is their own draft.
 *
 * The ids are real ObjectIds rather than strings, because this filter is also
 * spliced into `$match` stages, which Mongoose passes through untouched.
 */
async function reachFilter(actor: Actor): Promise<QueryFilter<IArticle>> {
  if (isManager(actor)) return {}

  const viewerId = new Types.ObjectId(actor.id)
  const projectIds = await visibleProjectIds(actor)

  return {
    $and: [
      {
        $or: [
          { author: viewerId },
          { visibility: 'TEAM' },
          { visibility: 'PROJECT', project: { $in: projectIds } },
        ],
      },
      { $or: [{ status: { $in: READABLE_ARTICLE_STATUSES } }, { author: viewerId }] },
    ],
  }
}

async function canView(article: ArticleDoc, actor: Actor) {
  if (canManage(article, actor)) return true
  if (!READABLE_ARTICLE_STATUSES.includes(article.status)) return false
  if (article.visibility === 'TEAM') return true
  if (article.visibility === 'PROJECT' && article.project) {
    const member = await Project.exists({
      _id: article.project,
      $or: [{ lead: actor.id }, { members: actor.id }],
    })
    return !!member
  }
  return false
}

/** Articles are addressed by slug in the UI and by id everywhere else. */
async function findByRef(ref: string) {
  const byId = /^[0-9a-fA-F]{24}$/.test(ref) ? await Article.findById(ref) : null
  return byId ?? (await Article.findOne({ slug: ref.toLowerCase() }))
}

async function loadViewable(ref: string, actor: Actor) {
  const article = await findByRef(ref)
  if (!article) {
    throw ApiError.notFound('That article no longer exists')
  }
  if (!(await canView(article, actor))) {
    throw ApiError.forbidden('You do not have access to this article')
  }
  return article
}

async function loadManageable(ref: string, actor: Actor) {
  const article = await findByRef(ref)
  if (!article) {
    throw ApiError.notFound('That article no longer exists')
  }
  if (!canManage(article, actor)) {
    throw ApiError.forbidden('Only the author or a knowledge manager can change this article')
  }
  return article
}

async function assertReferencesExist(input: ArticleInput) {
  if (input.category) {
    const category = await ArticleCategory.exists({ _id: input.category })
    if (!category) throw ApiError.badRequest('The selected category does not exist')
  }
  if (input.project) {
    const project = await Project.exists({ _id: input.project })
    if (!project) throw ApiError.badRequest('The selected project does not exist')
  }
}

/** PROJECT visibility without a project would hide an article from everyone. */
function assertVisibilityIsCoherent(visibility: ArticleVisibility, project?: string | null) {
  if (visibility === 'PROJECT' && !project) {
    throw ApiError.badRequest('Pick a project for project-only visibility')
  }
}

/**
 * A slug nothing else is using. It is minted once from the first title and then
 * frozen, so renaming an article never breaks a link someone already shared.
 */
async function uniqueSlug(title: string) {
  const base = slugify(title) || 'article'

  for (let n = 1; n < 500; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`
    if (!(await Article.exists({ slug: candidate }))) return candidate
  }

  throw ApiError.conflict('Too many articles already share that title')
}

async function uniqueCategorySlug(name: string, exceptId?: string) {
  const base = slugify(name) || 'category'

  for (let n = 1; n < 100; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const clash = await ArticleCategory.findOne({ slug: candidate }).select('_id')
    if (!clash || String(clash._id) === exceptId) return candidate
  }

  throw ApiError.conflict('Too many categories already share that name')
}

/** Tags are matched and counted case-insensitively, so they are stored folded. */
function normalizeTags(tags: string[] | undefined) {
  if (!tags) return undefined
  const folded = tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)
  return [...new Set(folded)].slice(0, 20)
}

/** The three derived fields that follow from a body, kept in one place. */
function contentMetricsFor(body: string, excerpt?: string) {
  const wordCount = wordCountOf(body)
  return {
    wordCount,
    readingMinutes: readingMinutesOf(wordCount),
    excerpt: excerpt?.trim() || excerptFrom(body),
  }
}

async function serialize(article: ArticleDoc, actor: Actor, options: { withBody?: boolean } = {}) {
  await article.populate(options.withBody ? DETAIL_POPULATE : POPULATE)
  const commentCount = await ArticleComment.countDocuments({ article: article._id })

  return serializeArticle(article, {
    viewerId: actor.id,
    canManage: canManage(article, actor),
    withBody: options.withBody,
    commentCount,
  })
}


/**
 * Browsing defaults to the published shelf — an unfinished draft turning up
 * beside a finished article is what makes a wiki stop being trusted. The
 * graph view reads the same rule, so what is drawn matches what is listed.
 */
type StatusFilter = ArticleStatus | { $in: ArticleStatus[] } | { $ne: ArticleStatus }

function statusFilterFor(scope: ArticleScope, status?: ArticleStatus): StatusFilter {
  if (status) return status
  if (scope === 'drafts') return { $in: ['DRAFT', 'IN_REVIEW'] }
  if (scope === 'archived') return 'ARCHIVED'
  if (scope === 'mine' || scope === 'bookmarks') return { $ne: 'ARCHIVED' }
  return 'PUBLISHED'
}

// ------------------------------------------------------------- wiki links

/** A `[[target]]` paired with the article behind it, or null if there is none. */
interface MatchedWikiLink {
  target: string
  label: string | null
  article: { _id: Types.ObjectId; title: string; slug: string } | null
}

/**
 * Pairs every `[[wiki link]]` in a body with the article it names. A target is
 * matched on its slug first and then on its title, case-insensitively, so both
 * `[[how-we-deploy]]` and `[[How we deploy]]` land on the same page — people
 * write whichever they have to hand.
 */
async function matchWikiLinks(body: string): Promise<MatchedWikiLink[]> {
  const targets = wikiLinksOf(body)
  if (!targets.length) return []

  const slugs = targets.map((link) => slugify(link.target)).filter(Boolean)
  const titles = targets.map(
    (link) => new RegExp(`^${escapeRegex(link.target)}$`, 'i')
  )

  const found = await Article.find({
    $or: [{ slug: { $in: slugs } }, { title: { $in: titles } }],
  }).select('title slug')

  const bySlug = new Map(found.map((row) => [row.slug, row]))
  const byTitle = new Map(found.map((row) => [row.title.toLowerCase(), row]))

  return targets.map((link) => ({
    ...link,
    article: bySlug.get(slugify(link.target)) ?? byTitle.get(link.target.toLowerCase()) ?? null,
  }))
}

/** The two link fields an article carries, derived from its body. */
async function linkFieldsFor(body: string, selfId?: string) {
  const matched = await matchWikiLinks(body)

  const links = new Set<string>()
  const unresolvedLinks = new Set<string>()

  for (const link of matched) {
    // A page linking to itself is not an edge; it would draw a loop on the graph.
    if (link.article && String(link.article._id) !== selfId) {
      links.add(String(link.article._id))
    } else if (!link.article) {
      unresolvedLinks.add(link.target.toLowerCase())
    }
  }

  return { links: [...links], unresolvedLinks: [...unresolvedLinks] }
}

/**
 * Wires up the pages that were already pointing at an article before it
 * existed. Without this, writing the page everyone had linked to would leave
 * every one of those links dangling until each was edited by hand.
 */
async function reconcileInboundLinks(article: ArticleDoc) {
  const keys = [article.slug, article.title.toLowerCase()]

  const waiting = await Article.find({
    unresolvedLinks: { $in: keys },
    _id: { $ne: article._id },
  }).select('body')

  for (const row of waiting) {
    await Article.updateOne(
      { _id: row._id },
      await linkFieldsFor(row.body ?? '', String(row._id))
    )
  }
}

/** What the client needs to turn `[[...]]` in a body into a real link. */
export interface ArticleLinkTarget {
  target: string
  slug: string | null
  title: string | null
  exists: boolean
}

async function linkTargetsFor(body: string): Promise<ArticleLinkTarget[]> {
  const matched = await matchWikiLinks(body)

  return matched.map((link) => ({
    target: link.target,
    slug: link.article?.slug ?? null,
    title: link.article?.title ?? null,
    exists: !!link.article,
  }))
}

/** The articles pointing at this one — Obsidian's "linked mentions". */
async function backlinksFor(article: ArticleDoc, actor: Actor) {
  const reach = await reachFilter(actor)

  const found = await Article.find({
    ...reach,
    links: article._id,
    _id: { $ne: article._id },
    status: { $ne: 'ARCHIVED' },
  })
    .select('-body')
    .populate(POPULATE)
    .sort({ title: 1 })
    .limit(30)

  return found.map((row) =>
    serializeArticle(row, { viewerId: actor.id, canManage: canManage(row, actor) })
  )
}

// ---------------------------------------------------------------- reads

async function listArticles(input: ListArticlesInput, actor: Actor) {
  const reach = await reachFilter(actor)
  const filter: QueryFilter<IArticle> = { ...reach }
  const and: QueryFilter<IArticle>[] = []

  if (input.scope === 'mine') filter.author = actor.id
  if (input.scope === 'bookmarks') filter.bookmarkedBy = actor.id
  // A manager's drafts shelf is the whole backlog; everyone else sees their own.
  if (input.scope === 'drafts' && !isManager(actor)) filter.author = actor.id

  filter.status = statusFilterFor(input.scope, input.status)

  if (input.category) filter.category = input.category
  if (input.tag) filter.tags = input.tag.toLowerCase()

  if (input.search) {
    const regex = new RegExp(escapeRegex(input.search), 'i')
    and.push({ $or: [{ title: regex }, { excerpt: regex }, { tags: regex }, { body: regex }] })
  }

  // The reach filter already owns $and, so its clauses are carried over rather
  // than overwritten when a search adds one of its own.
  if (and.length) filter.$and = [...((reach.$and as QueryFilter<IArticle>[]) ?? []), ...and]

  const skip = (input.page - 1) * input.limit

  const [articles, total] = await Promise.all([
    Article.find(filter)
      // A list row never shows the body, so it is left on the server.
      .select('-body')
      .populate(POPULATE)
      .sort(SORTS[input.sort])
      .skip(skip)
      .limit(input.limit),
    Article.countDocuments(filter),
  ])

  // One grouped count beats a countDocuments per row on a page of 24.
  const counts = await commentCountsFor(articles.map((article) => article._id))

  const items: SafeArticle[] = articles.map((article) =>
    serializeArticle(article, {
      viewerId: actor.id,
      canManage: canManage(article, actor),
      commentCount: counts.get(String(article._id)) ?? 0,
    })
  )

  return {
    items,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit) || 1,
    },
  }
}

async function commentCountsFor(articleIds: Types.ObjectId[]) {
  if (!articleIds.length) return new Map<string, number>()

  const rows = await ArticleComment.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { article: { $in: articleIds } } },
    { $group: { _id: '$article', count: { $sum: 1 } } },
  ])

  return new Map(rows.map((row) => [String(row._id), row.count]))
}

export interface ArticleDetail {
  article: SafeArticle
  /** The table of contents down the side, derived from the body's headings. */
  headings: ArticleHeading[]
  /** A few more on the same shelf, so a page is never a dead end. */
  related: SafeArticle[]
  /** Every `[[target]]` in the body, resolved so the client can link it. */
  linkTargets: ArticleLinkTarget[]
  /** The articles pointing here. */
  backlinks: SafeArticle[]
}

async function getArticle(ref: string, actor: Actor): Promise<ArticleDetail> {
  const article = await loadViewable(ref, actor)

  // Not awaited, and never counted for the author: a failed counter must not
  // fail the read, and nobody's own re-reads should inflate their numbers.
  if (idOf(article.author) !== actor.id) {
    void Article.updateOne({ _id: article._id }, { $inc: { views: 1 } }).catch(() => {})
  }

  const serialized = await serialize(article, actor, { withBody: true })

  const [related, linkTargets, backlinks] = await Promise.all([
    relatedArticles(article, actor),
    linkTargetsFor(article.body ?? ''),
    backlinksFor(article, actor),
  ])

  return {
    article: serialized,
    headings: headingsOf(article.body ?? ''),
    related,
    linkTargets,
    backlinks,
  }
}

/** Published neighbours: same shelf first, then anything sharing a tag. */
async function relatedArticles(article: ArticleDoc, actor: Actor) {
  const reach = await reachFilter(actor)

  const found = await Article.find({
    ...reach,
    _id: { $ne: article._id },
    status: 'PUBLISHED',
    $or: [{ category: idOf(article.category) }, { tags: { $in: article.tags ?? [] } }],
  })
    .select('-body')
    .populate(POPULATE)
    .sort({ views: -1, publishedAt: -1 })
    .limit(4)

  return found.map((row) =>
    serializeArticle(row, { viewerId: actor.id, canManage: canManage(row, actor) })
  )
}

/** The header tiles, the shelf counts and the tag cloud. */
async function summary(actor: Actor) {
  const reach = await reachFilter(actor)
  const published: QueryFilter<IArticle> = { ...reach, status: 'PUBLISHED' }
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [total, drafts, bookmarks, mine, updatedThisMonth, views, tags] = await Promise.all([
    Article.countDocuments(published),
    Article.countDocuments({ ...reach, status: { $in: ['DRAFT', 'IN_REVIEW'] } }),
    Article.countDocuments({ ...reach, bookmarkedBy: actor.id, status: { $ne: 'ARCHIVED' } }),
    Article.countDocuments({ ...reach, author: actor.id, status: { $ne: 'ARCHIVED' } }),
    Article.countDocuments({ ...published, updatedAt: { $gte: thirtyDaysAgo } }),
    Article.aggregate<{ _id: null; views: number }>([
      { $match: published },
      { $group: { _id: null, views: { $sum: '$views' } } },
    ]),
    Article.aggregate<{ _id: string; count: number }>([
      { $match: published },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 24 },
    ]),
  ])

  return {
    published: total,
    drafts,
    bookmarks,
    mine,
    updatedThisMonth,
    views: views[0]?.views ?? 0,
    tags: tags.map((row) => ({ tag: row._id, count: row.count })),
  }
}

/** The shelf itself, each category carrying the count the caller can see. */
async function listCategories(actor: Actor) {
  const reach = await reachFilter(actor)

  const [categories, counts] = await Promise.all([
    ArticleCategory.find().sort({ order: 1, name: 1 }),
    Article.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { ...reach, status: 'PUBLISHED' } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]),
  ])

  const byCategory = new Map(counts.map((row) => [String(row._id), row.count]))

  return categories.map((category) =>
    serializeCategory(category, byCategory.get(String(category._id)) ?? 0)
  )
}


// ---------------------------------------------------------------- graph

export interface GraphNode {
  id: string
  title: string
  slug: string
  category: ArticleCategoryRef | null
  status: string
  tags: string[]
  /** Distinct neighbours. Drives how big the node is drawn. */
  degree: number
  views: number
  isPinned: boolean
  /** Whether this is the article the local graph was built around. */
  isFocus: boolean
}

export interface GraphEdge {
  source: string
  target: string
  /** True when each article links to the other; drawn as one heavier line. */
  mutual: boolean
}

export interface ArticleGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: {
    nodes: number
    edges: number
    /** Articles nothing links to and which link nowhere — the ones to go wire up. */
    orphans: number
    /** Distinct `[[targets]]` across the set with no article behind them. */
    unresolved: number
    /** True when the shelf was larger than one graph can usefully draw. */
    truncated: boolean
  }
}

interface GraphInput {
  scope: ArticleScope
  category?: string
  tag?: string
  /** A slug or id to centre a local graph on. Omitted, the whole shelf is drawn. */
  focus?: string
  /** How many hops out from the focus to include. */
  depth: number
}

/**
 * The link graph, as nodes and edges the client lays out. Edges are kept only
 * where both ends are in the node set, so a link into something the caller
 * cannot read neither draws a line to nowhere nor leaks that it exists.
 */
async function graph(input: GraphInput, actor: Actor): Promise<ArticleGraph> {
  const reach = await reachFilter(actor)
  const filter: QueryFilter<IArticle> = {
    ...reach,
    status: statusFilterFor(input.scope, undefined),
  }

  if (input.scope === 'mine') filter.author = actor.id
  if (input.scope === 'bookmarks') filter.bookmarkedBy = actor.id
  if (input.category) filter.category = input.category
  if (input.tag) filter.tags = input.tag.toLowerCase()

  const total = await Article.countDocuments(filter)

  const articles = await Article.find(filter)
    .select('title slug category tags status links unresolvedLinks views isPinned')
    .populate({ path: 'category', select: 'name slug icon' })
    // Oldest-first would hide today's writing behind last year's, so the most
    // read articles are the ones that survive the cap.
    .sort({ views: -1, createdAt: -1 })
    .limit(MAX_GRAPH_NODES)

  const present = new Set(articles.map((article) => String(article._id)))

  // One entry per unordered pair, so a mutual link is a single heavier line
  // rather than two lines drawn on top of each other.
  const pairs = new Map<string, GraphEdge>()
  const neighbours = new Map<string, Set<string>>()

  const connect = (a: string, b: string) => {
    if (!neighbours.has(a)) neighbours.set(a, new Set())
    if (!neighbours.has(b)) neighbours.set(b, new Set())
    neighbours.get(a)!.add(b)
    neighbours.get(b)!.add(a)
  }

  for (const article of articles) {
    const source = String(article._id)

    for (const link of article.links ?? []) {
      const target = String(link)
      if (target === source || !present.has(target)) continue

      const key = [source, target].sort().join(':')
      const existing = pairs.get(key)

      if (existing) existing.mutual = true
      else pairs.set(key, { source, target, mutual: false })

      connect(source, target)
    }
  }

  const focusId = input.focus ? await resolveGraphFocus(input.focus, present) : null
  const keep = focusId ? withinDepth(focusId, neighbours, input.depth) : present

  const unresolved = new Set<string>()
  const nodes: GraphNode[] = []

  for (const article of articles) {
    const id = String(article._id)
    if (!keep.has(id)) continue

    for (const target of article.unresolvedLinks ?? []) unresolved.add(target)

    nodes.push({
      id,
      title: article.title,
      slug: article.slug,
      category: toArticleCategoryRef(article.category),
      status: article.status,
      tags: article.tags ?? [],
      degree: neighbours.get(id)?.size ?? 0,
      views: article.views ?? 0,
      isPinned: article.isPinned,
      isFocus: id === focusId,
    })
  }

  const edges = [...pairs.values()].filter(
    (edge) => keep.has(edge.source) && keep.has(edge.target)
  )

  return {
    nodes,
    edges,
    stats: {
      nodes: nodes.length,
      edges: edges.length,
      orphans: nodes.filter((node) => node.degree === 0).length,
      unresolved: unresolved.size,
      truncated: total > articles.length,
    },
  }
}

/** The focus article's id, but only if it is one of the nodes on the graph. */
async function resolveGraphFocus(ref: string, present: Set<string>) {
  const article = await findByRef(ref)
  if (!article) return null

  const id = String(article._id)
  return present.has(id) ? id : null
}

/** Breadth-first walk out from one node, `depth` hops at most. */
function withinDepth(start: string, neighbours: Map<string, Set<string>>, depth: number) {
  const keep = new Set([start])
  let frontier = [start]

  for (let hop = 0; hop < depth; hop += 1) {
    const next: string[] = []

    for (const id of frontier) {
      for (const neighbour of neighbours.get(id) ?? []) {
        if (keep.has(neighbour)) continue
        keep.add(neighbour)
        next.push(neighbour)
      }
    }

    if (!next.length) break
    frontier = next
  }

  return keep
}

// ---------------------------------------------------------------- writes

async function createArticle(
  input: ArticleInput & { title: string; category: string; status?: ArticleStatus },
  actor: Actor
) {
  await assertReferencesExist(input)

  const visibility = input.visibility ?? 'TEAM'
  assertVisibilityIsCoherent(visibility, input.project)

  const body = input.body ?? ''
  const status = input.status ?? 'DRAFT'

  const article = await Article.create({
    ...(await linkFieldsFor(body)),
    title: input.title,
    slug: await uniqueSlug(input.title),
    body,
    category: input.category,
    tags: normalizeTags(input.tags) ?? [],
    status,
    visibility,
    project: input.project ?? null,
    author: actor.id,
    lastEditedBy: actor.id,
    contributors: [actor.id],
    publishedAt: status === 'PUBLISHED' ? new Date() : null,
    ...contentMetricsFor(body, input.excerpt),
  })

  // Version 1 is written up front, so the history never starts at "unknown".
  await ArticleRevision.create({
    article: article._id,
    version: 1,
    title: article.title,
    excerpt: article.excerpt,
    body: article.body,
    changeNote: input.changeNote?.trim() || 'Created',
    wordCount: article.wordCount,
    editedBy: actor.id,
  })

  // Anything that linked to this title before it was written now resolves.
  await reconcileInboundLinks(article)

  return serialize(article, actor, { withBody: true })
}

async function updateArticle(ref: string, input: ArticleInput, actor: Actor) {
  const article = await loadManageable(ref, actor)
  await assertReferencesExist(input)

  const patch: Record<string, unknown> = { lastEditedBy: actor.id }

  if (input.title !== undefined) patch.title = input.title
  if (input.category !== undefined) patch.category = input.category
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags)

  const visibility = input.visibility ?? article.visibility
  const project = input.project !== undefined ? input.project : idOf(article.project) || null
  if (input.visibility !== undefined || input.project !== undefined) {
    assertVisibilityIsCoherent(visibility, project)
    patch.visibility = visibility
    patch.project = project
  }

  // Only a change to what people read earns a new version; retagging an
  // article or moving it to another shelf would otherwise bury the history.
  const nextTitle = input.title ?? article.title
  const nextBody = input.body ?? article.body ?? ''
  const nextExcerpt = input.excerpt !== undefined ? input.excerpt : article.excerpt
  const contentChanged =
    nextTitle !== article.title ||
    nextBody !== (article.body ?? '') ||
    (input.excerpt !== undefined && nextExcerpt !== article.excerpt)

  if (input.body !== undefined || input.excerpt !== undefined) {
    Object.assign(patch, contentMetricsFor(nextBody, nextExcerpt))
  }

  // The edges live on the row, so they are recut whenever the prose that
  // spells them out changes. A retitle re-cuts them too: other pages may name
  // this one by its old title, and those links have just gone stale.
  if (input.body !== undefined) {
    Object.assign(patch, await linkFieldsFor(nextBody, String(article._id)))
  }

  const version = contentChanged ? (article.version ?? 1) + 1 : article.version
  if (contentChanged) patch.version = version

  const updated = await Article.findByIdAndUpdate(
    article._id,
    { ...patch, $addToSet: { contributors: actor.id } },
    { returnDocument: 'after', runValidators: true }
  )

  if (contentChanged) {
    await ArticleRevision.create({
      article: article._id,
      version,
      title: updated!.title,
      excerpt: updated!.excerpt,
      body: updated!.body,
      changeNote: input.changeNote?.trim() || '',
      wordCount: updated!.wordCount,
      editedBy: actor.id,
    })
  }

  if (input.title !== undefined && input.title !== article.title) {
    await reconcileInboundLinks(updated!)
  }

  return serialize(updated!, actor, { withBody: true })
}

/**
 * Moves an article between draft, review, published and archived, keeping the
 * two timestamps that hang off those transitions honest.
 */
async function setStatus(ref: string, status: ArticleStatus, actor: Actor) {
  const article = await loadManageable(ref, actor)

  if (status === 'PUBLISHED' && !article.body?.trim()) {
    throw ApiError.badRequest('Write something before publishing this article')
  }
  if (article.status === status) {
    return serialize(article, actor, { withBody: true })
  }

  const patch: Record<string, unknown> = { status, lastEditedBy: actor.id }

  // The first publish stamps the date; a re-publish after archiving keeps the
  // original one, since that is when the article entered the knowledge base.
  if (status === 'PUBLISHED') {
    if (!article.publishedAt) patch.publishedAt = new Date()
    patch.archivedAt = null
  }
  if (status === 'ARCHIVED') patch.archivedAt = new Date()
  // Pulling an article back to a draft takes it off the shelf, so it must not
  // keep a pin that would float it above published work when it returns.
  if (status === 'DRAFT' || status === 'IN_REVIEW') patch.isPinned = false

  const updated = await Article.findByIdAndUpdate(article._id, patch, {
    returnDocument: 'after',
  })

  return serialize(updated!, actor, { withBody: true })
}

async function toggleBookmark(ref: string, actor: Actor) {
  const article = await loadViewable(ref, actor)
  const bookmarked = article.bookmarkedBy.some((id) => String(id) === actor.id)

  const updated = await Article.findByIdAndUpdate(
    article._id,
    bookmarked
      ? { $pull: { bookmarkedBy: actor.id } }
      : { $addToSet: { bookmarkedBy: actor.id } },
    { returnDocument: 'after' }
  )

  return serialize(updated!, actor)
}

/** The "this helped" vote. One per person, and the author cannot vote for their own. */
async function toggleHelpful(ref: string, actor: Actor) {
  const article = await loadViewable(ref, actor)

  if (idOf(article.author) === actor.id) {
    throw ApiError.badRequest('You cannot mark your own article as helpful')
  }

  const voted = article.helpfulBy.some((id) => String(id) === actor.id)

  const updated = await Article.findByIdAndUpdate(
    article._id,
    voted ? { $pull: { helpfulBy: actor.id } } : { $addToSet: { helpfulBy: actor.id } },
    { returnDocument: 'after' }
  )

  return serialize(updated!, actor)
}

/** Pinning curates the shelf for everyone, so it is a manager's call. */
async function togglePin(ref: string, actor: Actor) {
  if (!isManager(actor)) {
    throw ApiError.forbidden('Only a knowledge manager can pin an article')
  }

  const article = await loadViewable(ref, actor)
  if (article.status !== 'PUBLISHED') {
    throw ApiError.badRequest('Only a published article can be pinned')
  }

  const updated = await Article.findByIdAndUpdate(
    article._id,
    { isPinned: !article.isPinned },
    { returnDocument: 'after' }
  )

  return serialize(updated!, actor)
}

/** Deleting takes the revision log and the comment thread with it. */
async function removeArticle(ref: string, actor: Actor) {
  const article = await loadManageable(ref, actor)

  await Promise.all([
    ArticleRevision.deleteMany({ article: article._id }),
    ArticleComment.deleteMany({ article: article._id }),
  ])
  await Article.deleteOne({ _id: article._id })

  return { deleted: true }
}

// ---------------------------------------------------------------- revisions

async function listRevisions(ref: string, actor: Actor) {
  const article = await loadViewable(ref, actor)

  const revisions = await ArticleRevision.find({ article: article._id })
    .select('-body')
    .populate({ path: 'editedBy', select: USER_REF_FIELDS })
    .sort({ version: -1 })

  return revisions.map((revision) => serializeRevision(revision))
}

async function getRevision(ref: string, version: number, actor: Actor) {
  const article = await loadViewable(ref, actor)

  const revision = await ArticleRevision.findOne({
    article: article._id,
    version,
  }).populate({ path: 'editedBy', select: USER_REF_FIELDS })

  if (!revision) {
    throw ApiError.notFound('That version of the article was not kept')
  }

  return serializeRevision(revision, { withBody: true })
}

/**
 * Puts an old version back as the newest one. The history is append-only, so a
 * restore is a fresh save of old content rather than a rewind — whatever was
 * live before it stays in the log and can itself be restored.
 */
async function restoreRevision(ref: string, version: number, actor: Actor) {
  const article = await loadManageable(ref, actor)

  const revision = await ArticleRevision.findOne({ article: article._id, version })
  if (!revision) {
    throw ApiError.notFound('That version of the article was not kept')
  }
  if (version === article.version) {
    throw ApiError.badRequest('That version is already the current one')
  }

  const nextVersion = (article.version ?? 1) + 1

  const updated = await Article.findByIdAndUpdate(
    article._id,
    {
      title: revision.title,
      body: revision.body,
      version: nextVersion,
      lastEditedBy: actor.id,
      ...contentMetricsFor(revision.body, revision.excerpt),
      ...(await linkFieldsFor(revision.body, String(article._id))),
      $addToSet: { contributors: actor.id },
    },
    { returnDocument: 'after' }
  )

  await ArticleRevision.create({
    article: article._id,
    version: nextVersion,
    title: revision.title,
    excerpt: revision.excerpt,
    body: revision.body,
    changeNote: `Restored version ${version}`,
    wordCount: updated!.wordCount,
    editedBy: actor.id,
  })

  return serialize(updated!, actor, { withBody: true })
}

// ---------------------------------------------------------------- comments

function canManageComment(comment: CommentDoc, actor: Actor) {
  return isManager(actor) || idOf(comment.author) === actor.id
}

/** The whole thread, replies nested under the comment they answer. */
async function listComments(ref: string, actor: Actor) {
  const article = await loadViewable(ref, actor)

  const comments = await ArticleComment.find({ article: article._id })
    .populate({ path: 'author', select: USER_REF_FIELDS })
    .sort({ createdAt: 1 })

  const roots: SafeArticleComment[] = []
  const byId = new Map<string, SafeArticleComment>()

  for (const comment of comments) {
    const safe = serializeComment(comment, { canManage: canManageComment(comment, actor) })
    byId.set(safe.id, safe)
  }

  for (const comment of comments) {
    const safe = byId.get(String(comment._id))!
    const parent = safe.parent ? byId.get(safe.parent) : undefined

    // A reply whose parent was deleted is shown at the top level rather than
    // dropped, so an answer never disappears with the question.
    if (parent) parent.replies.push(safe)
    else roots.push(safe)
  }

  return roots
}

async function addComment(
  ref: string,
  input: { body: string; parent?: string | null },
  actor: Actor
) {
  const article = await loadViewable(ref, actor)

  let parent: string | null = null
  if (input.parent) {
    const target = await ArticleComment.findOne({ _id: input.parent, article: article._id })
    if (!target) {
      throw ApiError.badRequest('The comment you are replying to no longer exists')
    }
    // Threads stay one level deep: replying to a reply answers its parent.
    parent = target.parent ? String(target.parent) : String(target._id)
  }

  const comment = await ArticleComment.create({
    article: article._id,
    author: actor.id,
    body: input.body,
    parent,
  })

  await comment.populate({ path: 'author', select: USER_REF_FIELDS })
  return serializeComment(comment, { canManage: true })
}

async function updateComment(commentId: string, body: string, actor: Actor) {
  const comment = await ArticleComment.findById(commentId)
  if (!comment) {
    throw ApiError.notFound('That comment no longer exists')
  }
  // A manager can remove a comment but not put words in someone else's mouth.
  if (idOf(comment.author) !== actor.id) {
    throw ApiError.forbidden('You can only edit your own comments')
  }

  const updated = await ArticleComment.findByIdAndUpdate(
    commentId,
    { body, isEdited: true, editedAt: new Date() },
    { returnDocument: 'after', runValidators: true }
  )

  await updated!.populate({ path: 'author', select: USER_REF_FIELDS })
  return serializeComment(updated!, { canManage: true })
}

/** Deleting a comment takes its replies with it — an orphaned answer reads oddly. */
async function removeComment(commentId: string, actor: Actor) {
  const comment = await ArticleComment.findById(commentId)
  if (!comment) {
    throw ApiError.notFound('That comment no longer exists')
  }
  if (!canManageComment(comment, actor)) {
    throw ApiError.forbidden('You can only delete your own comments')
  }

  const replies = comment.parent
    ? { deletedCount: 0 }
    : await ArticleComment.deleteMany({ parent: comment._id })

  await ArticleComment.deleteOne({ _id: comment._id })

  return { deleted: replies.deletedCount + 1 }
}

// ---------------------------------------------------------------- categories

async function createCategory(input: CategoryInput & { name: string }, actor: Actor) {
  if (!canCurate(actor)) {
    throw ApiError.forbidden('Only an admin or manager can add a category')
  }

  const category = await ArticleCategory.create({
    name: input.name,
    slug: await uniqueCategorySlug(input.name),
    description: input.description ?? '',
    icon: input.icon ?? 'book',
    order: input.order ?? (await ArticleCategory.countDocuments()),
    createdBy: actor.id,
  })

  return serializeCategory(category)
}

async function updateCategory(id: string, input: CategoryInput, actor: Actor) {
  if (!canCurate(actor)) {
    throw ApiError.forbidden('Only an admin or manager can change a category')
  }

  const category = await ArticleCategory.findById(id)
  if (!category) {
    throw ApiError.notFound('That category no longer exists')
  }

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined && input.name !== category.name) {
    patch.name = input.name
    patch.slug = await uniqueCategorySlug(input.name, id)
  }
  if (input.description !== undefined) patch.description = input.description
  if (input.icon !== undefined) patch.icon = input.icon
  if (input.order !== undefined) patch.order = input.order

  const updated = await ArticleCategory.findByIdAndUpdate(id, patch, {
    returnDocument: 'after',
    runValidators: true,
  })

  const count = await Article.countDocuments({ category: id, status: 'PUBLISHED' })
  return serializeCategory(updated!, count)
}

/**
 * A category only goes once it is empty. Deleting one with articles on it would
 * either orphan them or silently move them somewhere nobody chose.
 */
async function removeCategory(id: string, actor: Actor) {
  if (!canCurate(actor)) {
    throw ApiError.forbidden('Only an admin or manager can delete a category')
  }

  const category = await ArticleCategory.findById(id)
  if (!category) {
    throw ApiError.notFound('That category no longer exists')
  }

  const inUse = await Article.countDocuments({ category: id })
  if (inUse) {
    throw ApiError.conflict(
      `Move the ${inUse} article${inUse === 1 ? '' : 's'} on this shelf before deleting it`
    )
  }

  await ArticleCategory.deleteOne({ _id: id })
  return { deleted: true }
}

export const knowledgeService = {
  listArticles,
  getArticle,
  graph,
  summary,
  listCategories,
  createArticle,
  updateArticle,
  setStatus,
  toggleBookmark,
  toggleHelpful,
  togglePin,
  removeArticle,
  listRevisions,
  getRevision,
  restoreRevision,
  listComments,
  addComment,
  updateComment,
  removeComment,
  createCategory,
  updateCategory,
  removeCategory,
}
