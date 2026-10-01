import type { HydratedDocument } from 'mongoose'

import type { IFileNode } from '@/models/FileNode.model'
import { INLINE_PREVIEW_CATEGORIES } from '@/types/enums'
import {
  toProjectRef,
  toUserRef,
  type ProjectRef,
  type UserRef,
} from '@/utils/refs'

export interface SafeFileNode {
  id: string
  name: string
  kind: string
  parent: string | null
  depth: number
  owner: UserRef | null
  visibility: string
  project: ProjectRef | null
  sharedWith: UserRef[]
  description: string
  tags: string[]
  category: string
  size: number
  mimeType: string | null
  extension: string | null
  downloadCount: number
  isTrashed: boolean
  trashedAt: Date | null
  /** Whether the caller starred this node, rather than the whole roster. */
  isStarred: boolean
  /** Whether the browser can render it in a preview pane. */
  isPreviewable: boolean
  /** Whether the caller may rename, move, trash or delete it. */
  canManage: boolean
  createdAt: Date
  updatedAt: Date
}

interface SerializeOptions {
  /** The signed-in person, so `isStarred` and `canManage` are theirs. */
  viewerId: string
  canManage: boolean
}

export function serializeFileNode(
  node: HydratedDocument<IFileNode>,
  { viewerId, canManage }: SerializeOptions
): SafeFileNode {
  const sharedWith = (node.sharedWith as unknown[])
    .map(toUserRef)
    .filter((user): user is UserRef => !!user)

  return {
    id: String(node._id),
    name: node.name,
    kind: node.kind,
    parent: node.parent ? String(node.parent) : null,
    depth: node.depth,
    owner: toUserRef(node.owner),
    visibility: node.visibility,
    project: toProjectRef(node.project),
    sharedWith,
    description: node.description ?? '',
    tags: node.tags ?? [],
    category: node.category,
    size: node.size ?? 0,
    mimeType: node.mimeType ?? null,
    extension: node.extension ?? null,
    downloadCount: node.downloadCount ?? 0,
    isTrashed: node.isTrashed,
    trashedAt: node.trashedAt ?? null,
    isStarred: (node.starredBy ?? []).some((id) => String(id) === viewerId),
    isPreviewable:
      node.kind === 'FILE' && INLINE_PREVIEW_CATEGORIES.includes(node.category),
    canManage,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }
}

/** A trail of ancestors for the breadcrumb, root first. */
export interface FileBreadcrumb {
  id: string
  name: string
}

export function serializeBreadcrumb(node: HydratedDocument<IFileNode>): FileBreadcrumb {
  return { id: String(node._id), name: node.name }
}
