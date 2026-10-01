import type { PresenceStatus, Role } from '@/types/auth'
import type { Pagination } from '@/types/team'

export const FILE_VISIBILITIES = ['PRIVATE', 'TEAM', 'PROJECT'] as const
export type FileVisibility = (typeof FILE_VISIBILITIES)[number]

export const FILE_CATEGORIES = [
  'FOLDER',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'PDF',
  'DOCUMENT',
  'SPREADSHEET',
  'PRESENTATION',
  'ARCHIVE',
  'CODE',
  'OTHER',
] as const
export type FileCategory = (typeof FILE_CATEGORIES)[number]

/** Categories offered in the filter row — FOLDER is not a filter people want. */
export const FILE_FILTER_CATEGORIES = FILE_CATEGORIES.filter(
  (category) => category !== 'FOLDER'
) as Exclude<FileCategory, 'FOLDER'>[]

export const FILE_SORTS = ['name', 'recent', 'size', 'kind'] as const
export type FileSort = (typeof FILE_SORTS)[number]

/** Which slice of the library the page is showing. */
export const FILE_SCOPES = ['folder', 'mine', 'shared', 'starred', 'recent', 'trash'] as const
export type FileScope = (typeof FILE_SCOPES)[number]

/** Roles that may manage any node, not only their own. */
export const FILE_MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER']

export interface FileUserRef {
  id: string
  name: string
  username: string
  avatarUrl: string | null
  role: Role
  presenceStatus: PresenceStatus
}

export interface FileProjectRef {
  id: string
  name: string
  key: string
}

export interface FileNode {
  id: string
  name: string
  kind: 'FOLDER' | 'FILE'
  parent: string | null
  depth: number
  owner: FileUserRef | null
  visibility: FileVisibility
  project: FileProjectRef | null
  sharedWith: FileUserRef[]
  description: string
  tags: string[]
  category: FileCategory
  size: number
  mimeType: string | null
  extension: string | null
  downloadCount: number
  isTrashed: boolean
  trashedAt: string | null
  isStarred: boolean
  isPreviewable: boolean
  canManage: boolean
  createdAt: string
  updatedAt: string
}

export interface FileBreadcrumb {
  id: string
  name: string
}

export interface FileTreeNode {
  id: string
  name: string
  count: number
  children: FileTreeNode[]
}

export interface FileCategoryUsage {
  category: FileCategory
  count: number
  size: number
}

export interface FileSummary {
  files: number
  folders: number
  totalSize: number
  trashed: number
  trashedSize: number
  starred: number
  mine: number
  uploadedThisWeek: number
  byCategory: FileCategoryUsage[]
}

export interface ListFilesParams {
  page?: number
  limit?: number
  folder?: string
  scope?: FileScope
  search?: string
  category?: FileCategory
  project?: string
  sort?: FileSort
}

export interface ListFilesResult {
  items: FileNode[]
  breadcrumb: FileBreadcrumb[]
  folder: FileNode | null
  pagination: Pagination
}

export interface CreateFolderPayload {
  name: string
  parent?: string | null
  description?: string
  tags?: string[]
  visibility?: FileVisibility
  project?: string | null
  sharedWith?: string[]
}

export interface UpdateFilePayload {
  name?: string
  description?: string
  tags?: string[]
  visibility?: FileVisibility
  project?: string | null
  sharedWith?: string[]
}

/** The metadata that rides along with a multipart upload. */
export interface UploadFilesPayload {
  files: File[]
  parent?: string | null
  description?: string
  tags?: string[]
  visibility?: FileVisibility
  project?: string | null
}

export type { Pagination }
