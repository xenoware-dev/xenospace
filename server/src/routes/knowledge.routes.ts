import { Router } from 'express'

import * as knowledgeController from '@/controllers/knowledge.controller'
import { protect } from '@/middleware/auth.middleware'
import { validate } from '@/middleware/validate.middleware'
import {
  articleIdSchema,
  articleRefSchema,
  articleStatusSchema,
  createArticleSchema,
  createCategorySchema,
  createCommentSchema,
  graphQuerySchema,
  listArticlesQuerySchema,
  revisionSchema,
  updateArticleSchema,
  updateCategorySchema,
  updateCommentSchema,
} from '@/validators/knowledge.validator'

const router = Router()

router.use(protect)

// The shelf itself. Adding, renaming and retiring a category is a curator's
// job, which the service checks — the routes stay open so everyone can browse.
router.get('/categories', knowledgeController.listCategories)
router.post('/categories', validate(createCategorySchema), knowledgeController.createCategory)
router.patch(
  '/categories/:id',
  validate(updateCategorySchema),
  knowledgeController.updateCategory
)
router.delete('/categories/:id', validate(articleIdSchema), knowledgeController.deleteCategory)

// A comment is addressed by its own id rather than through its article, so it
// is mounted beside the articles instead of under them.
router.patch('/comments/:id', validate(updateCommentSchema), knowledgeController.updateComment)
router.delete('/comments/:id', validate(articleIdSchema), knowledgeController.deleteComment)

router.get('/summary', knowledgeController.getArticleSummary)
router.get('/graph', validate(graphQuerySchema), knowledgeController.getArticleGraph)

// The fixed segments above come first, so none of them is read as an article
// reference by /articles/:ref — which accepts a slug as well as an id.
router.get('/articles', validate(listArticlesQuerySchema), knowledgeController.listArticles)
router.post('/articles', validate(createArticleSchema), knowledgeController.createArticle)

router.get('/articles/:ref', validate(articleRefSchema), knowledgeController.getArticle)
router.patch('/articles/:ref', validate(updateArticleSchema), knowledgeController.updateArticle)
router.delete('/articles/:ref', validate(articleRefSchema), knowledgeController.deleteArticle)

router.post('/articles/:ref/status', validate(articleStatusSchema), knowledgeController.setArticleStatus)
router.post('/articles/:ref/bookmark', validate(articleRefSchema), knowledgeController.bookmarkArticle)
router.post('/articles/:ref/helpful', validate(articleRefSchema), knowledgeController.markArticleHelpful)
router.post('/articles/:ref/pin', validate(articleRefSchema), knowledgeController.pinArticle)

router.get('/articles/:ref/revisions', validate(articleRefSchema), knowledgeController.listRevisions)
router.get(
  '/articles/:ref/revisions/:version',
  validate(revisionSchema),
  knowledgeController.getRevision
)
router.post(
  '/articles/:ref/revisions/:version/restore',
  validate(revisionSchema),
  knowledgeController.restoreRevision
)

router.get('/articles/:ref/comments', validate(articleRefSchema), knowledgeController.listComments)
router.post('/articles/:ref/comments', validate(createCommentSchema), knowledgeController.addComment)

export default router
