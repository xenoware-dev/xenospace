import { Types } from 'mongoose'
import type { HydratedDocument, QueryFilter, SortOrder } from 'mongoose'

import { FileNode, type IFileNode } from '@/models/FileNode.model'
import { Project } from '@/models/Project.model'
import { User } from '@/models/User.model'
import {
  FILE_MANAGER_ROLES,
  MAX_FOLDER_DEPTH,
  type FileCategory,
  type FileVisibility,
  type Role,
} from '@/types/enums'
import { ApiError } from '@/utils/ApiError'
import { idOf } from '@/utils/refs'
import {
  serializeBreadcrumb,
  serializeFileNode,
  type SafeFileNode,
} from '@/utils/serialize-file'
import {
  categoryFor,
  extensionOf,
  removeStoredFiles,
  sanitizeName,
  storedFileExists,
} from '@/utils/storage'

/** What a query hands back: the model's shape plus Mongoose's document methods. */
type FileDoc = HydratedDocument<IFileNode>

const USER_REF_FIELDS = 'name username avatarUrl role presenceStatus'

const POPULATE = [
  { path: 'owner', select: USER_REF_FIELDS },
  { path: 'sharedWith', select: USER_REF_FIELDS },
  { path: 'project', select: 'name key' },
]

/** Folders always sort above files, so a column never mixes the two. */
const SORTS = {
  name: { kind: 1, name: 1 },
  recent: { kind: 1, updatedAt: -1 },
  size: { kind: 1, size: -1 },
  kind: { kind: 1, category: 1, name: 1 },
} as const satisfies Record<string, Record<string, SortOrder>>

export type FileSort = keyof typeof SORTS

/** Which slice of the library a request is looking at. */
export type FileScope = 'folder' | 'mine' | 'shared' | 'starred' | 'recent' | 'trash'

interface Actor {
  id: string
  role: Role
}

interface ListFilesInput {
  page: number
  limit: number
  /** Null means the root of the library. Ignored outside the `folder` scope. */
  folder?: string | null
  scope: FileScope
  search?: string
  category?: FileCategory
  project?: string
  sort: FileSort
}

interface NodeInput {
  name?: string
  description?: string
  tags?: string[]
  visibility?: FileVisibility
  project?: string | null
  sharedWith?: string[]
}

interface UploadedFile {
  originalName: string
  storageKey: string
  mimeType: string
  size: number
}

function isAdmin(actor: Actor) {
  return FILE_MANAGER_ROLES.includes(actor.role)
}

/** Renaming, moving, trashing and deleting belong to the owner or a manager. */
function canManage(node: FileDoc, actor: Actor) {
  return isAdmin(actor) || idOf(node.owner) === actor.id
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The materialized path a child of `parent` carries; ',' at the root. */
function childPathOf(parent: FileDoc | null) {
  return parent ? `${parent.path}${String(parent._id)},` : ','
}

/** The prefix every descendant of `node` shares. */
function subtreePrefix(node: FileDoc) {
  return `${node.path}${String(node._id)},`
}

function subtreeFilter(node: FileDoc): QueryFilter<IFileNode> {
  return { path: new RegExp(`^${escapeRegex(subtreePrefix(node))}`) }
}

/** Project ids the actor leads or belongs to, behind PROJECT visibility. */
async function visibleProjectIds(actor: Actor) {
  const ids = await Project.find({
    $or: [{ lead: actor.id }, { members: actor.id }],
  }).distinct('_id')

  return ids
}

/**
 * The reach of one person over the library, as a Mongo filter: their own nodes,
 * everything shared with the team, anything explicitly shared with them, and
 * the private-to-a-project nodes of projects they are on. Managers see it all.
 *
 * The ids are real ObjectIds rather than strings, because this filter is also
 * spliced into `$match` stages — and an aggregation pipeline is passed through
 * untouched by Mongoose, so a string id there silently matches nothing.
 */
async function reachFilter(actor: Actor): Promise<QueryFilter<IFileNode>> {
  if (isAdmin(actor)) return {}

  const viewerId = new Types.ObjectId(actor.id)
  const projectIds = await visibleProjectIds(actor)

  return {
    $or: [
      { owner: viewerId },
      { visibility: 'TEAM' },
      { sharedWith: viewerId },
      { visibility: 'PROJECT', project: { $in: projectIds } },
    ],
  }
}

async function canView(node: FileDoc, actor: Actor) {
  if (canManage(node, actor)) return true
  if (node.visibility === 'TEAM') return true
  if (node.sharedWith.some((id) => String(id) === actor.id)) return true
  if (node.visibility === 'PROJECT' && node.project) {
    const member = await Project.exists({
      _id: node.project,
      $or: [{ lead: actor.id }, { members: actor.id }],
    })
    return !!member
  }
  return false
}

async function loadViewable(id: string, actor: Actor) {
  const node = await FileNode.findById(id)
  if (!node) {
    throw ApiError.notFound('That file or folder no longer exists')
  }
  if (!(await canView(node, actor))) {
    throw ApiError.forbidden('You do not have access to this item')
  }
  return node
}

async function loadManageable(id: string, actor: Actor) {
  const node = await FileNode.findById(id)
  if (!node) {
    throw ApiError.notFound('That file or folder no longer exists')
  }
  if (!canManage(node, actor)) {
    throw ApiError.forbidden('Only the owner or a manager can change this item')
  }
  return node
}

/** A destination folder the caller may drop things into. */
async function loadParentFolder(parentId: string | null | undefined, actor: Actor) {
  if (!parentId) return null

  const parent = await FileNode.findById(parentId)
  if (!parent || parent.kind !== 'FOLDER') {
    throw ApiError.badRequest('The destination folder does not exist')
  }
  if (parent.isTrashed) {
    throw ApiError.badRequest('That folder is in the trash — restore it first')
  }
  if (!(await canView(parent, actor))) {
    throw ApiError.forbidden('You do not have access to that folder')
  }
  if (parent.depth + 1 > MAX_FOLDER_DEPTH) {
    throw ApiError.badRequest(`Folders can only be nested ${MAX_FOLDER_DEPTH} levels deep`)
  }

  return parent
}

async function assertReferencesExist(input: NodeInput) {
  if (input.project) {
    const project = await Project.exists({ _id: input.project })
    if (!project) throw ApiError.badRequest('The selected project does not exist')
  }

  if (input.sharedWith?.length) {
    const found = await User.countDocuments({ _id: { $in: input.sharedWith }, isActive: true })
    if (found !== new Set(input.sharedWith).size) {
      throw ApiError.badRequest('One or more of the people you shared with do not exist')
    }
  }
}

/** PROJECT visibility without a project would hide a node from everyone. */
function assertVisibilityIsCoherent(visibility: FileVisibility, project?: string | null) {
  if (visibility === 'PROJECT' && !project) {
    throw ApiError.badRequest('Pick a project for project-only visibility')
  }
}

/**
 * A name nothing else in the folder already uses. Uploads get a numbered
 * suffix — re-sending `report.pdf` should land beside the first one rather than
 * failing — while folders, which people name deliberately, report the clash.
 */
async function uniqueNameIn(
  parentId: string | null,
  name: string,
  kind: 'FOLDER' | 'FILE',
  { suffixOnClash }: { suffixOnClash: boolean }
) {
  const taken = async (candidate: string) =>
    !!(await FileNode.exists({
      parent: parentId,
      kind,
      isTrashed: false,
      name: new RegExp(`^${escapeRegex(candidate)}$`, 'i'),
    }))

  if (!(await taken(name))) return name

  if (!suffixOnClash) {
    throw ApiError.conflict(
      kind === 'FOLDER'
        ? 'A folder with this name is already here'
        : 'A file with this name is already here'
    )
  }

  const ext = extensionOf(name)
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name

  for (let n = 2; n < 500; n += 1) {
    const candidate = ext ? `${stem} (${n}).${ext}` : `${stem} (${n})`
    if (!(await taken(candidate))) return candidate
  }

  throw ApiError.conflict('Too many files here share that name')
}

async function serialize(node: FileDoc, actor: Actor) {
  await node.populate(POPULATE)
  return serializeFileNode(node, { viewerId: actor.id, canManage: canManage(node, actor) })
}

// ---------------------------------------------------------------- reads

async function list(input: ListFilesInput, actor: Actor) {
  const reach = await reachFilter(actor)
  const filter: QueryFilter<IFileNode> = { ...reach }
  const and: QueryFilter<IFileNode>[] = []

  if (input.scope === 'trash') {
    // One entry per trashed subtree, so a folder does not list its contents too.
    filter.isTrashed = true
    filter.trashedRoot = true
    if (!isAdmin(actor)) and.push({ owner: actor.id })
  } else {
    filter.isTrashed = false

    if (input.scope === 'mine') filter.owner = actor.id
    if (input.scope === 'starred') filter.starredBy = actor.id
    if (input.scope === 'shared') {
      and.push({ owner: { $ne: actor.id } })
      and.push({ $or: [{ visibility: 'TEAM' }, { sharedWith: actor.id }] })
    }
    if (input.scope === 'recent') filter.kind = 'FILE'
    // Browsing stays inside one folder — unless a search is running, which
    // people expect to reach the whole library rather than the open folder.
    if (input.scope === 'folder' && !input.search) {
      filter.parent = input.folder ?? null
    }
  }

  if (input.search) {
    const regex = new RegExp(escapeRegex(input.search), 'i')
    and.push({ $or: [{ name: regex }, { description: regex }, { tags: regex }] })
  }
  if (input.category) filter.category = input.category
  if (input.project) filter.project = input.project

  if (and.length) filter.$and = and

  const sort: Record<string, SortOrder> =
    input.scope === 'trash' ? { trashedAt: -1 } : SORTS[input.sort]
  const skip = (input.page - 1) * input.limit

  const [nodes, total] = await Promise.all([
    FileNode.find(filter).populate(POPULATE).sort(sort).skip(skip).limit(input.limit),
    FileNode.countDocuments(filter),
  ])

  const items: SafeFileNode[] = nodes.map((node) =>
    serializeFileNode(node, { viewerId: actor.id, canManage: canManage(node, actor) })
  )

  return {
    items,
    breadcrumb:
      input.scope === 'folder' && input.folder ? await breadcrumb(input.folder, actor) : [],
    folder:
      input.scope === 'folder' && input.folder
        ? await serialize(await loadViewable(input.folder, actor), actor)
        : null,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      pages: Math.ceil(total / input.limit) || 1,
    },
  }
}

/** The trail from the root down to (and including) one folder. */
async function breadcrumb(folderId: string, actor: Actor) {
  const folder = await loadViewable(folderId, actor)

  const ancestorIds = folder.path.split(',').filter(Boolean)
  const ancestors = ancestorIds.length
    ? await FileNode.find({ _id: { $in: ancestorIds } })
    : []

  // $in returns them in storage order, so the trail is rebuilt from the path.
  const byId = new Map(ancestors.map((node) => [String(node._id), node]))
  const trail = ancestorIds
    .map((id) => byId.get(id))
    .filter((node): node is FileDoc => !!node)

  return [...trail, folder].map(serializeBreadcrumb)
}

export interface FileTreeNode {
  id: string
  name: string
  count: number
  children: FileTreeNode[]
}

/** Every folder the caller can reach, nested, for the library's own navigator. */
async function tree(actor: Actor) {
  const reach = await reachFilter(actor)

  const folders = await FileNode.find({ ...reach, kind: 'FOLDER', isTrashed: false })
    .select('name parent path depth')
    .sort({ depth: 1, name: 1 })

  const fileCounts = await FileNode.aggregate<{ _id: string | null; count: number }>([
    { $match: { ...reach, kind: 'FILE', isTrashed: false } },
    { $group: { _id: '$parent', count: { $sum: 1 } } },
  ])

  const counts = new Map(fileCounts.map((row) => [row._id ? String(row._id) : 'root', row.count]))

  const nodes = new Map<string, FileTreeNode>()
  for (const folder of folders) {
    const id = String(folder._id)
    nodes.set(id, { id, name: folder.name, count: counts.get(id) ?? 0, children: [] })
  }

  const roots: FileTreeNode[] = []
  for (const folder of folders) {
    const node = nodes.get(String(folder._id))!
    const parentId = folder.parent ? String(folder.parent) : null
    const parent = parentId ? nodes.get(parentId) : undefined

    // A folder whose parent is out of reach is shown at the top level rather
    // than dropped, so nothing the caller owns becomes unreachable.
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return { tree: roots, rootFileCount: counts.get('root') ?? 0 }
}

/** The header tiles and the storage breakdown. */
async function summary(actor: Actor) {
  const reach = await reachFilter(actor)
  const live = { ...reach, isTrashed: false }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [byKind, byCategory, trashed, starred, mine, recent] = await Promise.all([
    FileNode.aggregate<{ _id: string; count: number; size: number }>([
      { $match: live },
      { $group: { _id: '$kind', count: { $sum: 1 }, size: { $sum: '$size' } } },
    ]),
    FileNode.aggregate<{ _id: FileCategory; count: number; size: number }>([
      { $match: { ...live, kind: 'FILE' } },
      { $group: { _id: '$category', count: { $sum: 1 }, size: { $sum: '$size' } } },
      { $sort: { size: -1 } },
    ]),
    FileNode.aggregate<{ _id: null; count: number; size: number }>([
      { $match: { ...reach, isTrashed: true } },
      { $group: { _id: null, count: { $sum: 1 }, size: { $sum: '$size' } } },
    ]),
    FileNode.countDocuments({ ...live, starredBy: actor.id }),
    FileNode.countDocuments({ ...live, owner: actor.id }),
    FileNode.countDocuments({ ...live, kind: 'FILE', createdAt: { $gte: sevenDaysAgo } }),
  ])

  const files = byKind.find((row) => row._id === 'FILE')
  const folders = byKind.find((row) => row._id === 'FOLDER')

  return {
    files: files?.count ?? 0,
    folders: folders?.count ?? 0,
    totalSize: files?.size ?? 0,
    trashed: trashed[0]?.count ?? 0,
    trashedSize: trashed[0]?.size ?? 0,
    starred,
    mine,
    uploadedThisWeek: recent,
    byCategory: byCategory.map((row) => ({
      category: row._id,
      count: row.count,
      size: row.size,
    })),
  }
}

async function getById(id: string, actor: Actor) {
  const node = await loadViewable(id, actor)

  return {
    node: await serialize(node, actor),
    breadcrumb: node.parent ? await breadcrumb(String(node.parent), actor) : [],
  }
}

/** Everything a download needs, with the view check already done. */
async function getDownload(id: string, actor: Actor) {
  const node = await loadViewable(id, actor)

  if (node.kind !== 'FILE' || !node.storageKey) {
    throw ApiError.badRequest('Folders cannot be downloaded')
  }
  if (!storedFileExists(node.storageKey)) {
    throw ApiError.notFound('The stored copy of this file is missing')
  }

  // Not awaited: a failed counter must not fail the download itself.
  void FileNode.updateOne({ _id: node._id }, { $inc: { downloadCount: 1 } }).catch(() => {})

  return {
    storageKey: node.storageKey,
    name: node.name,
    mimeType: node.mimeType ?? 'application/octet-stream',
    size: node.size,
  }
}

// ---------------------------------------------------------------- writes

async function createFolder(
  input: NodeInput & { name: string; parent?: string | null },
  actor: Actor
) {
  const parent = await loadParentFolder(input.parent, actor)
  await assertReferencesExist(input)

  // A new folder inherits where it sits, so dropping it into a project folder
  // does not quietly make it visible to the whole team.
  const visibility = input.visibility ?? parent?.visibility ?? 'TEAM'
  const project = input.project ?? (parent ? idOf(parent.project) || null : null)
  assertVisibilityIsCoherent(visibility, project)

  const parentId = parent ? String(parent._id) : null
  const name = await uniqueNameIn(parentId, sanitizeName(input.name), 'FOLDER', {
    suffixOnClash: false,
  })

  const folder = await FileNode.create({
    name,
    kind: 'FOLDER',
    parent: parentId,
    path: childPathOf(parent),
    depth: parent ? parent.depth + 1 : 0,
    owner: actor.id,
    createdBy: actor.id,
    updatedBy: actor.id,
    visibility,
    project,
    sharedWith: input.sharedWith ?? [],
    description: input.description ?? '',
    tags: input.tags ?? [],
    category: 'FOLDER',
  })

  return serialize(folder, actor)
}

/**
 * Writes one metadata row per uploaded blob. The bytes are already on disk by
 * the time this runs, so anything that fails here takes its blob with it rather
 * than leaving an orphan in the store.
 */
async function upload(
  files: UploadedFile[],
  input: NodeInput & { parent?: string | null },
  actor: Actor
) {
  if (!files.length) {
    throw ApiError.badRequest('No files were uploaded')
  }

  try {
    const parent = await loadParentFolder(input.parent, actor)
    await assertReferencesExist(input)

    const visibility = input.visibility ?? parent?.visibility ?? 'TEAM'
    const project = input.project ?? (parent ? idOf(parent.project) || null : null)
    assertVisibilityIsCoherent(visibility, project)

    const parentId = parent ? String(parent._id) : null
    const created: SafeFileNode[] = []

    for (const file of files) {
      const name = await uniqueNameIn(parentId, sanitizeName(file.originalName), 'FILE', {
        suffixOnClash: true,
      })

      const node = await FileNode.create({
        name,
        kind: 'FILE',
        parent: parentId,
        path: childPathOf(parent),
        depth: parent ? parent.depth + 1 : 0,
        owner: actor.id,
        createdBy: actor.id,
        updatedBy: actor.id,
        visibility,
        project,
        sharedWith: input.sharedWith ?? [],
        description: input.description ?? '',
        tags: input.tags ?? [],
        category: categoryFor(file.originalName, file.mimeType),
        storageKey: file.storageKey,
        mimeType: file.mimeType,
        extension: extensionOf(file.originalName) || null,
        size: file.size,
      })

      created.push(await serialize(node, actor))
    }

    return created
  } catch (error) {
    await removeStoredFiles(files.map((file) => file.storageKey))
    throw error
  }
}

async function update(id: string, input: NodeInput, actor: Actor) {
  const node = await loadManageable(id, actor)
  await assertReferencesExist(input)

  const patch: Record<string, unknown> = { updatedBy: actor.id }

  if (input.name !== undefined) {
    const name = sanitizeName(input.name)
    if (name.toLowerCase() !== node.name.toLowerCase()) {
      patch.name = await uniqueNameIn(
        node.parent ? String(node.parent) : null,
        name,
        node.kind,
        { suffixOnClash: false }
      )
    } else {
      // Same name, different case — a rename people expect to be allowed.
      patch.name = name
    }
  }

  if (input.description !== undefined) patch.description = input.description
  if (input.tags !== undefined) patch.tags = input.tags
  if (input.sharedWith !== undefined) patch.sharedWith = input.sharedWith

  const visibility = input.visibility ?? node.visibility
  const project = input.project !== undefined ? input.project : idOf(node.project) || null
  if (input.visibility !== undefined || input.project !== undefined) {
    assertVisibilityIsCoherent(visibility, project)
    patch.visibility = visibility
    patch.project = project
  }

  const updated = await FileNode.findByIdAndUpdate(id, patch, {
    returnDocument: 'after',
    runValidators: true,
  })

  // A folder hands its visibility down, so everything inside follows the change
  // rather than keeping whatever it inherited when it was created.
  if (node.kind === 'FOLDER' && (input.visibility !== undefined || input.project !== undefined)) {
    await FileNode.updateMany(subtreeFilter(node), {
      visibility,
      project,
      updatedBy: actor.id,
    })
  }

  return serialize(updated!, actor)
}

/** Moves a node, and the subtree under it, into another folder. */
async function move(id: string, parentId: string | null, actor: Actor) {
  const node = await loadManageable(id, actor)

  if (node.isTrashed) {
    throw ApiError.badRequest('Restore this item before moving it')
  }
  if (parentId === id) {
    throw ApiError.badRequest('A folder cannot be moved into itself')
  }

  const parent = await loadParentFolder(parentId, actor)
  const nextParentId = parent ? String(parent._id) : null

  if ((node.parent ? String(node.parent) : null) === nextParentId) {
    return serialize(node, actor)
  }

  // The destination's own path spells out its ancestors, so a move that would
  // bury a folder inside its own subtree is caught without walking the tree.
  if (parent && node.kind === 'FOLDER' && parent.path.includes(`,${id},`)) {
    throw ApiError.badRequest('A folder cannot be moved into one of its own subfolders')
  }

  const nextPath = childPathOf(parent)
  const nextDepth = parent ? parent.depth + 1 : 0

  const descendants =
    node.kind === 'FOLDER' ? await FileNode.find(subtreeFilter(node)).select('path depth') : []

  const deepest = descendants.reduce((max, child) => Math.max(max, child.depth), node.depth)
  if (nextDepth + (deepest - node.depth) > MAX_FOLDER_DEPTH) {
    throw ApiError.badRequest(
      `That move would nest folders more than ${MAX_FOLDER_DEPTH} levels deep`
    )
  }

  const name = await uniqueNameIn(nextParentId, node.name, node.kind, { suffixOnClash: true })

  const oldPrefix = subtreePrefix(node)
  const newPrefix = `${nextPath}${id},`
  const shift = nextDepth - node.depth

  await FileNode.updateOne(
    { _id: node._id },
    { parent: nextParentId, path: nextPath, depth: nextDepth, name, updatedBy: actor.id }
  )

  // Rewriting each descendant's path keeps the materialized prefix true, which
  // is what every later subtree query relies on.
  if (descendants.length) {
    await FileNode.bulkWrite(
      descendants.map((child) => ({
        updateOne: {
          filter: { _id: child._id },
          update: {
            path: `${newPrefix}${child.path.slice(oldPrefix.length)}`,
            depth: child.depth + shift,
          },
        },
      }))
    )
  }

  const moved = await FileNode.findById(id)
  return serialize(moved!, actor)
}

/** Starring is per person, so this toggles the caller's own star. */
async function toggleStar(id: string, actor: Actor) {
  const node = await loadViewable(id, actor)
  const starred = node.starredBy.some((userId) => String(userId) === actor.id)

  const updated = await FileNode.findByIdAndUpdate(
    id,
    starred ? { $pull: { starredBy: actor.id } } : { $addToSet: { starredBy: actor.id } },
    { returnDocument: 'after' }
  )

  return serialize(updated!, actor)
}

/** Soft delete: the subtree goes with it, and only this node is the trash root. */
async function trash(id: string, actor: Actor) {
  const node = await loadManageable(id, actor)
  if (node.isTrashed) {
    return serialize(node, actor)
  }

  const trashedAt = new Date()

  if (node.kind === 'FOLDER') {
    await FileNode.updateMany(subtreeFilter(node), {
      isTrashed: true,
      trashedRoot: false,
      trashedAt,
      trashedBy: actor.id,
    })
  }

  const updated = await FileNode.findByIdAndUpdate(
    id,
    { isTrashed: true, trashedRoot: true, trashedAt, trashedBy: actor.id },
    { returnDocument: 'after' }
  )

  return serialize(updated!, actor)
}

/**
 * Puts a trashed subtree back. If the folder it came from was itself trashed or
 * deleted in the meantime, it lands at the root rather than nowhere.
 */
async function restore(id: string, actor: Actor) {
  const node = await loadManageable(id, actor)
  if (!node.isTrashed) {
    return serialize(node, actor)
  }

  let parentId = node.parent ? String(node.parent) : null
  let path = node.path
  let depth = node.depth

  if (parentId) {
    const parent = await FileNode.findById(parentId)
    if (!parent || parent.isTrashed) {
      parentId = null
      path = ','
      depth = 0
    }
  }

  const movedToRoot = depth !== node.depth
  const descendants = node.kind === 'FOLDER' ? await FileNode.find(subtreeFilter(node)) : []

  const name = await uniqueNameIn(parentId, node.name, node.kind, { suffixOnClash: true })

  await FileNode.updateOne(
    { _id: node._id },
    {
      isTrashed: false,
      trashedRoot: false,
      trashedAt: null,
      trashedBy: null,
      parent: parentId,
      path,
      depth,
      name,
      updatedBy: actor.id,
    }
  )

  if (descendants.length) {
    const oldPrefix = subtreePrefix(node)
    const newPrefix = `${path}${id},`
    const shift = depth - node.depth

    await FileNode.bulkWrite(
      descendants.map((child) => ({
        updateOne: {
          filter: { _id: child._id },
          update: {
            isTrashed: false,
            trashedRoot: false,
            trashedAt: null,
            trashedBy: null,
            ...(movedToRoot
              ? {
                  path: `${newPrefix}${child.path.slice(oldPrefix.length)}`,
                  depth: child.depth + shift,
                }
              : {}),
          },
        },
      }))
    )
  }

  const restored = await FileNode.findById(id)
  return serialize(restored!, actor)
}

/** Permanent delete: the metadata rows go, and so do the blobs behind them. */
async function remove(id: string, actor: Actor) {
  const node = await loadManageable(id, actor)

  const descendants = node.kind === 'FOLDER' ? await FileNode.find(subtreeFilter(node)) : []
  const keys = [node, ...descendants].map((row) => row.storageKey)

  if (descendants.length) {
    await FileNode.deleteMany({ _id: { $in: descendants.map((row) => row._id) } })
  }
  await FileNode.deleteOne({ _id: node._id })

  // The rows are already gone, so a missing blob cannot strand a visible item.
  await removeStoredFiles(keys)

  return { deleted: descendants.length + 1 }
}

/** Empties the trash of everything the caller is allowed to delete. */
async function emptyTrash(actor: Actor) {
  const filter: QueryFilter<IFileNode> = isAdmin(actor)
    ? { isTrashed: true }
    : { isTrashed: true, owner: actor.id }

  const nodes = await FileNode.find(filter).select('storageKey')
  if (!nodes.length) return { deleted: 0 }

  await FileNode.deleteMany({ _id: { $in: nodes.map((node) => node._id) } })
  await removeStoredFiles(nodes.map((node) => node.storageKey))

  return { deleted: nodes.length }
}

export const fileService = {
  list,
  tree,
  summary,
  getById,
  getDownload,
  createFolder,
  upload,
  update,
  move,
  toggleStar,
  trash,
  restore,
  remove,
  emptyTrash,
}
