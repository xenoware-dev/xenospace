import { api } from '@/lib/axios'
import type { ApiEnvelope } from '@/types/auth'
import type {
  ListTasksParams,
  Pagination,
  Task,
  TaskList,
  TaskPayload,
  TaskSummary,
} from '@/types/task'

export const taskApi = {
  list: (params: ListTasksParams) =>
    api
      .get<ApiEnvelope<{ tasks: Task[]; pagination: Pagination }>>('/tasks', { params })
      .then((r) => r.data),

  summary: () =>
    api.get<ApiEnvelope<{ summary: TaskSummary }>>('/tasks/summary').then((r) => r.data),

  get: (id: string) => api.get<ApiEnvelope<{ task: Task }>>(`/tasks/${id}`).then((r) => r.data),

  create: (payload: TaskPayload) =>
    api.post<ApiEnvelope<{ task: Task }>>('/tasks', payload).then((r) => r.data),

  /** Completion lives in the board column, so the API moves the card for us. */
  setDone: (id: string, done: boolean) =>
    api
      .patch<ApiEnvelope<{ task: Task }>>(`/tasks/${id}/done`, { done })
      .then((r) => r.data),

  update: (id: string, payload: Partial<TaskPayload>) =>
    api.patch<ApiEnvelope<{ task: Task }>>(`/tasks/${id}`, payload).then((r) => r.data),

  /** Drops a card at `index` of `list`; the server renumbers both columns. */
  move: (id: string, payload: { list: string; index: number }) =>
    api.patch<ApiEnvelope<{ task: Task }>>(`/tasks/${id}/move`, payload).then((r) => r.data),

  remove: (id: string) => api.delete<ApiEnvelope<null>>(`/tasks/${id}`).then((r) => r.data),
}

export const taskListApi = {
  list: () => api.get<ApiEnvelope<{ lists: TaskList[] }>>('/task-lists').then((r) => r.data),

  create: (payload: { name: string; isDone?: boolean }) =>
    api.post<ApiEnvelope<{ list: TaskList }>>('/task-lists', payload).then((r) => r.data),

  update: (id: string, payload: { name?: string; isDone?: boolean }) =>
    api.patch<ApiEnvelope<{ list: TaskList }>>(`/task-lists/${id}`, payload).then((r) => r.data),

  reorder: (ids: string[]) =>
    api.patch<ApiEnvelope<{ lists: TaskList[] }>>('/task-lists/reorder', { ids }).then((r) => r.data),

  remove: (id: string) =>
    api
      .delete<ApiEnvelope<{ deletedCards: number }>>(`/task-lists/${id}`)
      .then((r) => r.data),
}
