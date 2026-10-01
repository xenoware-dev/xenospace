import { Schema, model, type Document, type Types } from 'mongoose'

import {
  PROJECT_PRIORITIES,
  PROJECT_STATUSES,
  type ProjectPriority,
  type ProjectStatus,
} from '@/types/enums'

export interface IProject extends Document {
  _id: Types.ObjectId
  name: string
  /** Short uppercase handle used as a prefix for task ids, e.g. XENO-142. */
  key: string
  description: string
  status: ProjectStatus
  priority: ProjectPriority
  lead: Types.ObjectId
  members: Types.ObjectId[]
  department?: Types.ObjectId | null
  tags: string[]
  startDate?: Date | null
  dueDate?: Date | null
  progress: number
  /** Monotonic counter behind task references (PLAC-1, PLAC-2, ...). */
  taskSequence: number
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const projectSchema = new Schema<IProject>(
  {
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: 120,
    },
    key: {
      type: String,
      required: [true, 'Project key is required'],
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 10,
      match: [/^[A-Z0-9]+$/, 'Project key can only contain letters and numbers'],
    },
    description: { type: String, default: '', maxlength: 2000 },
    status: { type: String, enum: PROJECT_STATUSES, default: 'PLANNING' },
    priority: { type: String, enum: PROJECT_PRIORITIES, default: 'MEDIUM' },
    lead: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    department: { type: Schema.Types.ObjectId, ref: 'Department', default: null },
    tags: { type: [String], default: [] },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    taskSequence: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

projectSchema.index({ status: 1, priority: 1 })
projectSchema.index({ lead: 1 })
projectSchema.index({ members: 1 })
projectSchema.index({ department: 1 })
projectSchema.index({ name: 'text', key: 'text', description: 'text' })

export const Project = model<IProject>('Project', projectSchema)
