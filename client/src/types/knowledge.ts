import type { PresenceStatus, Role } from '@/types/auth'
import type { Pagination } from '@/types/team'

export const ARTICLE_STATUSES = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

export const ARTICLE_VISIBILITIES = ['PRIVATE', 'TEAM', 'PROJECT'] as const
export type ArticleVisibility = (typeof ARTICLE_VISIBILITIES)[number]

/** Which slice of the knowledge base the page is showing. */
export const ARTICLE_SCOPES = ['all', 'mine', 'bookmarks', 'drafts', 'archived'] as const
export type ArticleScope = (typeof ARTICLE_SCOPES)[number]

export const ARTICLE_SORTS = ['recent', 'updated', 'popular', 'title'] as const
export type ArticleSort = (typeof ARTICLE_SORTS)[number]

export const CATEGORY_ICONS = [
  'book',
  'compass',
  'rocket',
  'shield',
  'wrench',
  'sparkles',
  'users',
  'code',
  'lifebuoy',
  'scale',
] as const
export type CategoryIcon = (typeof CATEGORY_ICONS)[number]

/** Roles that may edit any article, pin one, and moderate comments. */
export const KNOWLEDGE_MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD']

/** Roles that may add, rename and retire the shelves themselves. */
export const CATEGORY_MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER']

export interface ArticleUserRef {
  id: string
  name: string
  username: string
  avatarUrl: string | null
  role: Role
  presenceStatus: PresenceStatus
}

export interface ArticleCategoryRef {
  id: string
  name: string
  slug: string
  icon: CategoryIcon
}

export interface ArticleProjectRef {
  id: string
  name: string
  key: string
}

export interface ArticleCategory {
  id: string
  name: string
  slug: string
  description: string
  icon: CategoryIcon
  order: number
  articleCount: number
  createdAt: string
  updatedAt: string
}

export interface Article {
  id: string
  title: string
  slug: string
  excerpt: string
  /** Only the detail read carries the body; a list row does not. */
  body?: string
  category: ArticleCategoryRef | null
  tags: string[]
  status: ArticleStatus
  visibility: ArticleVisibility
  project: ArticleProjectRef | null
  author: ArticleUserRef | null
  lastEditedBy: ArticleUserRef | null
  contributors: ArticleUserRef[]
  views: number
  version: number
  wordCount: number
  readingMinutes: number
  isPinned: boolean
  bookmarkCount: number
  isBookmarked: boolean
  helpfulCount: number
  isHelpful: boolean
  commentCount: number
  canManage: boolean
  publishedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

/** One entry in the table of contents beside a long article. */
export interface ArticleHeading {
  id: string
  text: string
  level: number
}

/** A `[[target]]` in a body, resolved so the renderer can link it. */
export interface ArticleLinkTarget {
  target: string
  slug: string | null
  title: string | null
  exists: boolean
}

export interface ArticleDetail {
  article: Article
  headings: ArticleHeading[]
  related: Article[]
  linkTargets: ArticleLinkTarget[]
  /** The articles pointing here — Obsidian's "linked mentions". */
  backlinks: Article[]
}

export interface GraphNode {
  id: string
  title: string
  slug: string
  category: ArticleCategoryRef | null
  status: ArticleStatus
  tags: string[]
  /** Distinct neighbours. Drives how big the node is drawn. */
  degree: number
  views: number
  isPinned: boolean
  isFocus: boolean
}

export interface GraphEdge {
  source: string
  target: string
  /** True when each article links to the other; drawn as one heavier line. */
  mutual: boolean
}

export interface GraphStats {
  nodes: number
  edges: number
  orphans: number
  unresolved: number
  truncated: boolean
}

export interface ArticleGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: GraphStats
}

export interface GraphParams {
  scope?: ArticleScope
  category?: string
  tag?: string
  /** A slug or id to centre a local graph on. */
  focus?: string
  depth?: number
}

export interface ArticleRevision {
  id: string
  version: number
  title: string
  excerpt: string
  body?: string
  changeNote: string
  wordCount: number
  editedBy: ArticleUserRef | null
  createdAt: string
}

export interface ArticleComment {
  id: string
  body: string
  author: ArticleUserRef | null
  parent: string | null
  isEdited: boolean
  canManage: boolean
  createdAt: string
  updatedAt: string
  replies: ArticleComment[]
}

export interface TagUsage {
  tag: string
  count: number
}

export interface KnowledgeSummary {
  published: number
  drafts: number
  bookmarks: number
  mine: number
  updatedThisMonth: number
  views: number
  tags: TagUsage[]
}

export interface ListArticlesParams {
  page?: number
  limit?: number
  scope?: ArticleScope
  category?: string
  tag?: string
  status?: ArticleStatus
  search?: string
  sort?: ArticleSort
}

export interface ListArticlesResult {
  items: Article[]
  pagination: Pagination
}

export interface CreateArticlePayload {
  title: string
  body?: string
  excerpt?: string
  category: string
  tags?: string[]
  status?: Exclude<ArticleStatus, 'ARCHIVED'>
  visibility?: ArticleVisibility
  project?: string | null
  changeNote?: string
}

export interface UpdateArticlePayload {
  title?: string
  body?: string
  excerpt?: string
  category?: string
  tags?: string[]
  visibility?: ArticleVisibility
  project?: string | null
  changeNote?: string
}

export interface CategoryPayload {
  name: string
  description?: string
  icon?: CategoryIcon
  order?: number
}

export type { Pagination }
