import { api } from '@/lib/axios'
import type { ApiEnvelope } from '@/types/auth'
import type {
  CreateFolderPayload,
  FileNode,
  FileSummary,
  FileTreeNode,
  ListFilesParams,
  ListFilesResult,
  UpdateFilePayload,
  UploadFilesPayload,
} from '@/types/file'

/** `root` is how the API spells "the top of the library" in a query string. */
const ROOT = 'root'

export const fileApi = {
  list: (params: ListFilesParams) =>
    api.get<ApiEnvelope<ListFilesResult>>('/files', { params }).then((r) => r.data),

  tree: () =>
    api
      .get<ApiEnvelope<{ tree: FileTreeNode[]; rootFileCount: number }>>('/files/tree')
      .then((r) => r.data),

  summary: () =>
    api.get<ApiEnvelope<{ summary: FileSummary }>>('/files/summary').then((r) => r.data),

  get: (id: string) =>
    api
      .get<ApiEnvelope<{ node: FileNode; breadcrumb: { id: string; name: string }[] }>>(
        `/files/${id}`
      )
      .then((r) => r.data),

  createFolder: (payload: CreateFolderPayload) =>
    api
      .post<ApiEnvelope<{ node: FileNode }>>('/files/folders', {
        ...payload,
        parent: payload.parent ?? null,
      })
      .then((r) => r.data),

  /**
   * Multipart, so the metadata travels as form fields rather than JSON — tags
   * go over comma-separated, which is all a form field can carry. `onProgress`
   * drives the upload meter.
   */
  upload: (payload: UploadFilesPayload, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    payload.files.forEach((file) => form.append('files', file))
    if (payload.parent) form.append('parent', payload.parent)
    if (payload.description) form.append('description', payload.description)
    if (payload.tags?.length) form.append('tags', payload.tags.join(','))
    if (payload.visibility) form.append('visibility', payload.visibility)
    if (payload.project) form.append('project', payload.project)

    return api
      .post<ApiEnvelope<{ nodes: FileNode[] }>>('/files/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (!onProgress || !event.total) return
          onProgress(Math.round((event.loaded / event.total) * 100))
        },
      })
      .then((r) => r.data)
  },

  update: (id: string, payload: UpdateFilePayload) =>
    api.patch<ApiEnvelope<{ node: FileNode }>>(`/files/${id}`, payload).then((r) => r.data),

  move: (id: string, parent: string | null) =>
    api
      .patch<ApiEnvelope<{ node: FileNode }>>(`/files/${id}/move`, { parent: parent ?? ROOT })
      .then((r) => r.data),

  star: (id: string) =>
    api.post<ApiEnvelope<{ node: FileNode }>>(`/files/${id}/star`).then((r) => r.data),

  trash: (id: string) =>
    api.post<ApiEnvelope<{ node: FileNode }>>(`/files/${id}/trash`).then((r) => r.data),

  restore: (id: string) =>
    api.post<ApiEnvelope<{ node: FileNode }>>(`/files/${id}/restore`).then((r) => r.data),

  remove: (id: string) =>
    api.delete<ApiEnvelope<{ deleted: number }>>(`/files/${id}`).then((r) => r.data),

  emptyTrash: () =>
    api.post<ApiEnvelope<{ deleted: number }>>('/files/trash/empty').then((r) => r.data),

  /** Browser-navigable URLs, so a download is a plain link with cookies attached. */
  downloadUrl: (id: string) => `/api/v1/files/${id}/download`,
  previewUrl: (id: string) => `/api/v1/files/${id}/download?disposition=inline`,
}
