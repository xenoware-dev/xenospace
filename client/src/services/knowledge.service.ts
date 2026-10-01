import { api } from '@/lib/axios'
import type { ApiEnvelope } from '@/types/auth'
import type {
  Article,
  ArticleCategory,
  ArticleComment,
  ArticleDetail,
  ArticleGraph,
  ArticleRevision,
  ArticleStatus,
  CategoryPayload,
  CreateArticlePayload,
  GraphParams,
  KnowledgeSummary,
  ListArticlesParams,
  ListArticlesResult,
  UpdateArticlePayload,
} from '@/types/knowledge'

/** An article is addressed by slug in the UI and by id everywhere else; the API takes either. */
export const knowledgeApi = {
  list: (params: ListArticlesParams) =>
    api
      .get<ApiEnvelope<ListArticlesResult>>('/knowledge/articles', { params })
      .then((r) => r.data),

  summary: () =>
    api
      .get<ApiEnvelope<{ summary: KnowledgeSummary }>>('/knowledge/summary')
      .then((r) => r.data),

  get: (ref: string) =>
    api.get<ApiEnvelope<ArticleDetail>>(`/knowledge/articles/${ref}`).then((r) => r.data),

  graph: (params: GraphParams = {}) =>
    api.get<ApiEnvelope<ArticleGraph>>('/knowledge/graph', { params }).then((r) => r.data),

  create: (payload: CreateArticlePayload) =>
    api
      .post<ApiEnvelope<{ article: Article }>>('/knowledge/articles', payload)
      .then((r) => r.data),

  update: (ref: string, payload: UpdateArticlePayload) =>
    api
      .patch<ApiEnvelope<{ article: Article }>>(`/knowledge/articles/${ref}`, payload)
      .then((r) => r.data),

  setStatus: (ref: string, status: ArticleStatus) =>
    api
      .post<ApiEnvelope<{ article: Article }>>(`/knowledge/articles/${ref}/status`, { status })
      .then((r) => r.data),

  bookmark: (ref: string) =>
    api
      .post<ApiEnvelope<{ article: Article }>>(`/knowledge/articles/${ref}/bookmark`)
      .then((r) => r.data),

  helpful: (ref: string) =>
    api
      .post<ApiEnvelope<{ article: Article }>>(`/knowledge/articles/${ref}/helpful`)
      .then((r) => r.data),

  pin: (ref: string) =>
    api
      .post<ApiEnvelope<{ article: Article }>>(`/knowledge/articles/${ref}/pin`)
      .then((r) => r.data),

  remove: (ref: string) =>
    api
      .delete<ApiEnvelope<{ deleted: boolean }>>(`/knowledge/articles/${ref}`)
      .then((r) => r.data),

  revisions: (ref: string) =>
    api
      .get<ApiEnvelope<{ revisions: ArticleRevision[] }>>(`/knowledge/articles/${ref}/revisions`)
      .then((r) => r.data),

  revision: (ref: string, version: number) =>
    api
      .get<ApiEnvelope<{ revision: ArticleRevision }>>(
        `/knowledge/articles/${ref}/revisions/${version}`
      )
      .then((r) => r.data),

  restoreRevision: (ref: string, version: number) =>
    api
      .post<ApiEnvelope<{ article: Article }>>(
        `/knowledge/articles/${ref}/revisions/${version}/restore`
      )
      .then((r) => r.data),

  comments: (ref: string) =>
    api
      .get<ApiEnvelope<{ comments: ArticleComment[] }>>(`/knowledge/articles/${ref}/comments`)
      .then((r) => r.data),

  addComment: (ref: string, body: string, parent?: string | null) =>
    api
      .post<ApiEnvelope<{ comment: ArticleComment }>>(`/knowledge/articles/${ref}/comments`, {
        body,
        parent: parent ?? null,
      })
      .then((r) => r.data),

  updateComment: (id: string, body: string) =>
    api
      .patch<ApiEnvelope<{ comment: ArticleComment }>>(`/knowledge/comments/${id}`, { body })
      .then((r) => r.data),

  removeComment: (id: string) =>
    api
      .delete<ApiEnvelope<{ deleted: number }>>(`/knowledge/comments/${id}`)
      .then((r) => r.data),

  categories: () =>
    api
      .get<ApiEnvelope<{ categories: ArticleCategory[] }>>('/knowledge/categories')
      .then((r) => r.data),

  createCategory: (payload: CategoryPayload) =>
    api
      .post<ApiEnvelope<{ category: ArticleCategory }>>('/knowledge/categories', payload)
      .then((r) => r.data),

  updateCategory: (id: string, payload: Partial<CategoryPayload>) =>
    api
      .patch<ApiEnvelope<{ category: ArticleCategory }>>(`/knowledge/categories/${id}`, payload)
      .then((r) => r.data),

  removeCategory: (id: string) =>
    api
      .delete<ApiEnvelope<{ deleted: boolean }>>(`/knowledge/categories/${id}`)
      .then((r) => r.data),
}
