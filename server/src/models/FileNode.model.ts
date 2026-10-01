import { Schema, model, type Document, type Types } from 'mongoose'

import {
  FILE_CATEGORIES,
  FILE_NODE_KINDS,
  FILE_VISIBILITIES,
  type FileCategory,
  type FileNodeKind,
  type FileVisibility,
} from '@/types/enums'

export interface IFileNode extends Document {
  _id: Types.ObjectId
  name: string
  kind: FileNodeKind
  parent?: Types.ObjectId | null
  /**
   * Comma-wrapped ids of every ancestor, root first (",a,b,"). A materialized
   * path turns "everything under this folder" — which trashing, restoring and
   * deleting all need — into one indexed prefix match instead of a recursive
   * walk, and makes a move that would put a folder inside itself detectable
   * without loading the tree.
   */
  path: string
  depth: number
  owner: Types.ObjectId
  createdBy: Types.ObjectId
  updatedBy: Types.ObjectId
  visibility: FileVisibility
  project?: Types.ObjectId | null
  /** Extra people let into a PRIVATE node, beyond its owner. */
  sharedWith: Types.ObjectId[]
  description: string
  tags: string[]
  /** Starring is per person, so the flag lives on the node as a roster. */
  starredBy: Types.ObjectId[]
  category: FileCategory
  isTrashed: boolean
  /**
   * True only on the node someone actually trashed, not on the descendants that
   * went with it, so the trash lists a folder once instead of listing every
   * file inside it — and so restoring puts the whole subtree back.
   */
  trashedRoot: boolean
  trashedAt?: Date | null
  trashedBy?: Types.ObjectId | null
  downloadCount: number

  // Files only — a folder carries no bytes.
  /** Path of the stored blob, relative to the upload directory. */
  storageKey?: string | null
  mimeType?: string | null
  extension?: string | null
  size: number

  createdAt: Date
  updatedAt: Date
}

const fileNodeSchema = new Schema<IFileNode>(
  {
    name: {
      type: String,
      required: [true, 'A name is required'],
      trim: true,
      maxlength: 255,
    },
    kind: { type: String, enum: FILE_NODE_KINDS, required: true },
    parent: { type: Schema.Types.ObjectId, ref: 'FileNode', default: null },
    path: { type: String, default: ',' },
    depth: { type: Number, default: 0 },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    visibility: { type: String, enum: FILE_VISIBILITIES, default: 'TEAM' },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    sharedWith: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    description: { type: String, default: '', maxlength: 1000 },
    tags: { type: [String], default: [] },
    starredBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    category: { type: String, enum: FILE_CATEGORIES, default: 'OTHER' },
    isTrashed: { type: Boolean, default: false },
    trashedRoot: { type: Boolean, default: false },
    trashedAt: { type: Date, default: null },
    trashedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    downloadCount: { type: Number, default: 0 },
    storageKey: { type: String, default: null },
    mimeType: { type: String, default: null },
    extension: { type: String, default: null },
    size: { type: Number, default: 0 },
  },
  { timestamps: true }
)

// Listing one folder, which is what every page view does first.
fileNodeSchema.index({ parent: 1, isTrashed: 1, kind: 1, name: 1 })
// Subtree reads behind trash, restore and delete.
fileNodeSchema.index({ path: 1 })
fileNodeSchema.index({ owner: 1, isTrashed: 1 })
fileNodeSchema.index({ starredBy: 1 })
fileNodeSchema.index({ project: 1 })
fileNodeSchema.index({ visibility: 1 })
fileNodeSchema.index({ isTrashed: 1, trashedRoot: 1, trashedAt: -1 })
fileNodeSchema.index({ name: 'text', description: 'text', tags: 'text' })

export const FileNode = model<IFileNode>('FileNode', fileNodeSchema)
