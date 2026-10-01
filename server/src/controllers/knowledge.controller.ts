import type { Request, Response } from 'express'

import {
  knowledgeService,
  type ArticleScope,
  type ArticleSort,
} from '@/services/knowledge.service'
import type { ArticleStatus, Role } from '@/types/enums'
import { ApiResponse } from '@/utils/ApiResponse'
import { catchAsync } from '@/utils/catchAsync'

function actorOf(req: Request) {
  return { id: String(req.user!._id), role: req.user!.role as Role }
}

export const listArticles = catchAsync(async (req: Request, res: Response) => {
  // validate() writes its parsed output back onto req.body only, so query
  // values still arrive as strings here and are coerced by hand.
  const query = req.query as Record<string, string | undefined>

  const result = await knowledgeService.listArticles(
    {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 12,
      scope: (query.scope as ArticleScope) || 'all',
      category: query.category,
      tag: query.tag,
      status: query.status as ArticleStatus | undefined,
      search: query.search,
      sort: (query.sort as ArticleSort) || 'recent',
    },
    actorOf(req)
  )

  ApiResponse.send(res, 200, 'Articles', result)
})

export const getArticleGraph = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as Record<string, string | undefined>

  const graph = await knowledgeService.graph(
    {
      scope: (query.scope as ArticleScope) || 'all',
      category: query.category,
      tag: query.tag,
      focus: query.focus,
      depth: Number(query.depth) || 1,
    },
    actorOf(req)
  )

  ApiResponse.send(res, 200, 'Knowledge graph', graph)
})

export const getArticleSummary = catchAsync(async (req: Request, res: Response) => {
  const summary = await knowledgeService.summary(actorOf(req))
  ApiResponse.send(res, 200, 'Knowledge base summary', { summary })
})

export const listCategories = catchAsync(async (req: Request, res: Response) => {
  const categories = await knowledgeService.listCategories(actorOf(req))
  ApiResponse.send(res, 200, 'Categories', { categories })
})

export const getArticle = catchAsync(async (req: Request, res: Response) => {
  const result = await knowledgeService.getArticle(String(req.params.ref), actorOf(req))
  ApiResponse.send(res, 200, 'Article', result)
})

export const createArticle = catchAsync(async (req: Request, res: Response) => {
  const article = await knowledgeService.createArticle(req.body, actorOf(req))
  ApiResponse.send(
    res,
    201,
    article.status === 'PUBLISHED' ? 'Article published' : 'Draft saved',
    { article }
  )
})

export const updateArticle = catchAsync(async (req: Request, res: Response) => {
  const article = await knowledgeService.updateArticle(
    String(req.params.ref),
    req.body,
    actorOf(req)
  )
  ApiResponse.send(res, 200, 'Changes saved', { article })
})

const STATUS_MESSAGES: Record<ArticleStatus, string> = {
  DRAFT: 'Moved back to drafts',
  IN_REVIEW: 'Sent for review',
  PUBLISHED: 'Article published',
  ARCHIVED: 'Article archived',
}

export const setArticleStatus = catchAsync(async (req: Request, res: Response) => {
  const status = req.body.status as ArticleStatus
  const article = await knowledgeService.setStatus(String(req.params.ref), status, actorOf(req))
  ApiResponse.send(res, 200, STATUS_MESSAGES[status], { article })
})

export const bookmarkArticle = catchAsync(async (req: Request, res: Response) => {
  const article = await knowledgeService.toggleBookmark(String(req.params.ref), actorOf(req))
  ApiResponse.send(
    res,
    200,
    article.isBookmarked ? 'Saved to your bookmarks' : 'Removed from your bookmarks',
    { article }
  )
})

export const markArticleHelpful = catchAsync(async (req: Request, res: Response) => {
  const article = await knowledgeService.toggleHelpful(String(req.params.ref), actorOf(req))
  ApiResponse.send(res, 200, article.isHelpful ? 'Thanks for the feedback' : 'Vote withdrawn', {
    article,
  })
})

export const pinArticle = catchAsync(async (req: Request, res: Response) => {
  const article = await knowledgeService.togglePin(String(req.params.ref), actorOf(req))
  ApiResponse.send(res, 200, article.isPinned ? 'Pinned to the top' : 'Unpinned', { article })
})

export const deleteArticle = catchAsync(async (req: Request, res: Response) => {
  const result = await knowledgeService.removeArticle(String(req.params.ref), actorOf(req))
  ApiResponse.send(res, 200, 'Article deleted', result)
})

export const listRevisions = catchAsync(async (req: Request, res: Response) => {
  const revisions = await knowledgeService.listRevisions(String(req.params.ref), actorOf(req))
  ApiResponse.send(res, 200, 'Version history', { revisions })
})

export const getRevision = catchAsync(async (req: Request, res: Response) => {
  const revision = await knowledgeService.getRevision(
    String(req.params.ref),
    Number(req.params.version),
    actorOf(req)
  )
  ApiResponse.send(res, 200, 'Version', { revision })
})

export const restoreRevision = catchAsync(async (req: Request, res: Response) => {
  const article = await knowledgeService.restoreRevision(
    String(req.params.ref),
    Number(req.params.version),
    actorOf(req)
  )
  ApiResponse.send(res, 200, `Restored version ${req.params.version}`, { article })
})

export const listComments = catchAsync(async (req: Request, res: Response) => {
  const comments = await knowledgeService.listComments(String(req.params.ref), actorOf(req))
  ApiResponse.send(res, 200, 'Comments', { comments })
})

export const addComment = catchAsync(async (req: Request, res: Response) => {
  const comment = await knowledgeService.addComment(
    String(req.params.ref),
    { body: req.body.body, parent: req.body.parent ?? null },
    actorOf(req)
  )
  ApiResponse.send(res, 201, 'Comment posted', { comment })
})

export const updateComment = catchAsync(async (req: Request, res: Response) => {
  const comment = await knowledgeService.updateComment(
    String(req.params.id),
    req.body.body,
    actorOf(req)
  )
  ApiResponse.send(res, 200, 'Comment updated', { comment })
})

export const deleteComment = catchAsync(async (req: Request, res: Response) => {
  const result = await knowledgeService.removeComment(String(req.params.id), actorOf(req))
  ApiResponse.send(res, 200, 'Comment deleted', result)
})

export const createCategory = catchAsync(async (req: Request, res: Response) => {
  const category = await knowledgeService.createCategory(req.body, actorOf(req))
  ApiResponse.send(res, 201, 'Category created', { category })
})

export const updateCategory = catchAsync(async (req: Request, res: Response) => {
  const category = await knowledgeService.updateCategory(
    String(req.params.id),
    req.body,
    actorOf(req)
  )
  ApiResponse.send(res, 200, 'Category updated', { category })
})

export const deleteCategory = catchAsync(async (req: Request, res: Response) => {
  const result = await knowledgeService.removeCategory(String(req.params.id), actorOf(req))
  ApiResponse.send(res, 200, 'Category deleted', result)
})
