import { z } from 'zod'

import {
  ARTICLE_STATUSES,
  ARTICLE_VISIBILITIES,
  CATEGORY_ICONS,
  DEFAULT_GRAPH_DEPTH,
} from '@/types/enums'

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')

/** The detail route takes either an id or the article's slug. */
const articleRef = z.string().trim().min(1).max(100)

const title = z.string().trim().min(1, 'A title is required').max(180)
const body = z.string().max(200_000, 'This article is too long to save')
const excerpt = z.string().trim().max(400)
const tags = z.array(z.string().trim().min(1).max(30)).max(20)
const changeNote = z.string().trim().max(300)

export const listArticlesQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    scope: z.enum(['all', 'mine', 'bookmarks', 'drafts', 'archived']).default('all'),
    category: objectId.optional(),
    tag: z.string().trim().max(30).optional(),
    status: z.enum(ARTICLE_STATUSES).optional(),
    search: z.string().trim().max(100).optional(),
    sort: z.enum(['recent', 'updated', 'popular', 'title']).default('recent'),
  }),
})

export const graphQuerySchema = z.object({
  query: z.object({
    scope: z.enum(['all', 'mine', 'bookmarks', 'drafts', 'archived']).default('all'),
    category: objectId.optional(),
    tag: z.string().trim().max(30).optional(),
    /** A slug or id to centre a local graph on. */
    focus: articleRef.optional(),
    // Past three hops a "local" graph is the whole graph again, so that is
    // where the ceiling sits.
    depth: z.coerce.number().int().min(1).max(3).default(DEFAULT_GRAPH_DEPTH),
  }),
})

export const articleRefSchema = z.object({
  params: z.object({ ref: articleRef }),
})

export const articleIdSchema = z.object({
  params: z.object({ id: objectId }),
})

export const createArticleSchema = z.object({
  body: z.object({
    title,
    body: body.optional(),
    excerpt: excerpt.optional(),
    category: objectId,
    tags: tags.optional(),
    // An article can be published straight from the composer; anything past
    // that — archiving, sending back to review — goes through the status route.
    status: z.enum(['DRAFT', 'IN_REVIEW', 'PUBLISHED']).optional(),
    visibility: z.enum(ARTICLE_VISIBILITIES).optional(),
    project: objectId.nullable().optional(),
    changeNote: changeNote.optional(),
  }),
})

export const updateArticleSchema = z.object({
  params: z.object({ ref: articleRef }),
  body: z
    .object({
      title: title.optional(),
      body: body.optional(),
      excerpt: excerpt.optional(),
      category: objectId.optional(),
      tags: tags.optional(),
      visibility: z.enum(ARTICLE_VISIBILITIES).optional(),
      project: objectId.nullable().optional(),
      changeNote: changeNote.optional(),
    })
    .refine((values) => Object.keys(values).length > 0, 'Nothing to update'),
})

export const articleStatusSchema = z.object({
  params: z.object({ ref: articleRef }),
  body: z.object({ status: z.enum(ARTICLE_STATUSES) }),
})

export const revisionSchema = z.object({
  params: z.object({
    ref: articleRef,
    version: z.coerce.number().int().min(1),
  }),
})

export const createCommentSchema = z.object({
  params: z.object({ ref: articleRef }),
  body: z.object({
    body: z.string().trim().min(1, 'Write something first').max(4000),
    parent: objectId.nullable().optional(),
  }),
})

export const updateCommentSchema = z.object({
  params: z.object({ id: objectId }),
  body: z.object({
    body: z.string().trim().min(1, 'Write something first').max(4000),
  }),
})

const categoryName = z.string().trim().min(1, 'A name is required').max(60)

export const createCategorySchema = z.object({
  body: z.object({
    name: categoryName,
    description: z.string().trim().max(300).optional(),
    icon: z.enum(CATEGORY_ICONS).optional(),
    order: z.coerce.number().int().min(0).max(999).optional(),
  }),
})

export const updateCategorySchema = z.object({
  params: z.object({ id: objectId }),
  body: z
    .object({
      name: categoryName.optional(),
      description: z.string().trim().max(300).optional(),
      icon: z.enum(CATEGORY_ICONS).optional(),
      order: z.coerce.number().int().min(0).max(999).optional(),
    })
    .refine((values) => Object.keys(values).length > 0, 'Nothing to update'),
})
