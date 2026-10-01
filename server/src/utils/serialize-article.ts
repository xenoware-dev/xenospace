import type { HydratedDocument } from 'mongoose'

import type { IArticleCategory } from '@/models/ArticleCategory.model'
import type { IArticleComment } from '@/models/ArticleComment.model'
import type { IArticleRevision } from '@/models/ArticleRevision.model'
import type { IArticle } from '@/models/Article.model'
import {
  toArticleCategoryRef,
  toProjectRef,
  toUserRef,
  type ArticleCategoryRef,
  type ProjectRef,
  type UserRef,
} from '@/utils/refs'

export interface SafeArticleCategory {
  id: string
  name: string
  slug: string
  description: string
  icon: string
  order: number
  /** How many articles the caller can actually see on this shelf. */
  articleCount: number
  createdAt: Date
  updatedAt: Date
}

export function serializeCategory(
  category: HydratedDocument<IArticleCategory>,
  articleCount = 0
): SafeArticleCategory {
  return {
    id: String(category._id),
    name: category.name,
    slug: category.slug,
    description: category.description ?? '',
    icon: category.icon,
    order: category.order ?? 0,
    articleCount,
    createdAt: category.createdAt,
    updatedAt: category.updatedAt,
  }
}

export interface SafeArticle {
  id: string
  title: string
  slug: string
  excerpt: string
  /** Omitted from list rows — a shelf of fifty articles need not ship fifty bodies. */
  body?: string
  category: ArticleCategoryRef | null
  tags: string[]
  status: string
  visibility: string
  project: ProjectRef | null
  author: UserRef | null
  lastEditedBy: UserRef | null
  contributors: UserRef[]
  views: number
  version: number
  wordCount: number
  readingMinutes: number
  isPinned: boolean
  /** Counts, plus whether the caller is one of them. */
  bookmarkCount: number
  isBookmarked: boolean
  helpfulCount: number
  isHelpful: boolean
  commentCount: number
  /** Whether the caller may edit, publish or delete it. */
  canManage: boolean
  publishedAt: Date | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface SerializeOptions {
  viewerId: string
  canManage: boolean
  /** Only the detail view asks for the body. */
  withBody?: boolean
  commentCount?: number
}

export function serializeArticle(
  article: HydratedDocument<IArticle>,
  { viewerId, canManage, withBody = false, commentCount = 0 }: SerializeOptions
): SafeArticle {
  const contributors = (article.contributors as unknown[])
    .map(toUserRef)
    .filter((user): user is UserRef => !!user)

  return {
    id: String(article._id),
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt ?? '',
    ...(withBody ? { body: article.body ?? '' } : {}),
    category: toArticleCategoryRef(article.category),
    tags: article.tags ?? [],
    status: article.status,
    visibility: article.visibility,
    project: toProjectRef(article.project),
    author: toUserRef(article.author),
    lastEditedBy: toUserRef(article.lastEditedBy),
    contributors,
    views: article.views ?? 0,
    version: article.version ?? 1,
    wordCount: article.wordCount ?? 0,
    readingMinutes: article.readingMinutes ?? 1,
    isPinned: article.isPinned,
    bookmarkCount: (article.bookmarkedBy ?? []).length,
    isBookmarked: (article.bookmarkedBy ?? []).some((id) => String(id) === viewerId),
    helpfulCount: (article.helpfulBy ?? []).length,
    isHelpful: (article.helpfulBy ?? []).some((id) => String(id) === viewerId),
    commentCount,
    canManage,
    publishedAt: article.publishedAt ?? null,
    archivedAt: article.archivedAt ?? null,
    createdAt: article.createdAt,
    updatedAt: article.updatedAt,
  }
}

export interface SafeArticleRevision {
  id: string
  version: number
  title: string
  excerpt: string
  /** Only the single-revision read carries it; the log is a list of headers. */
  body?: string
  changeNote: string
  wordCount: number
  editedBy: UserRef | null
  createdAt: Date
}

export function serializeRevision(
  revision: HydratedDocument<IArticleRevision>,
  { withBody = false }: { withBody?: boolean } = {}
): SafeArticleRevision {
  return {
    id: String(revision._id),
    version: revision.version,
    title: revision.title,
    excerpt: revision.excerpt ?? '',
    ...(withBody ? { body: revision.body ?? '' } : {}),
    changeNote: revision.changeNote ?? '',
    wordCount: revision.wordCount ?? 0,
    editedBy: toUserRef(revision.editedBy),
    createdAt: revision.createdAt,
  }
}

export interface SafeArticleComment {
  id: string
  body: string
  author: UserRef | null
  parent: string | null
  isEdited: boolean
  /** Whether the caller may edit or delete it. */
  canManage: boolean
  createdAt: Date
  updatedAt: Date
  /** Populated on top-level comments only; a reply never carries its own. */
  replies: SafeArticleComment[]
}

export function serializeComment(
  comment: HydratedDocument<IArticleComment>,
  { canManage }: { canManage: boolean }
): SafeArticleComment {
  return {
    id: String(comment._id),
    body: comment.body,
    author: toUserRef(comment.author),
    parent: comment.parent ? String(comment.parent) : null,
    isEdited: comment.isEdited,
    canManage,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    replies: [],
  }
}
