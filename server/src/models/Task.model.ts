import { Schema, model, type Document, type Types } from 'mongoose'

import { TASK_PRIORITIES, type TaskPriority } from '@/types/enums'

export interface ITask extends Document {
  _id: Types.ObjectId
  title: string
  description: string
  /** Human handle minted from the project key, e.g. PLAC-12. Null for cards with no project. */
  reference?: string | null
  /** The board column this card sits in. */
  list: Types.ObjectId
  /** Order within the list, renumbered from 0 on every move. */
  position: number
  /** Mirrors the list's `isDone`, denormalised so queries do not need a join. */
  isDone: boolean
  project?: Types.ObjectId | null
  assignee?: Types.ObjectId | null
  createdBy: Types.ObjectId
  priority: TaskPriority
  /** Mirror of `priority` as a number, kept in sync by the service so Mongo can sort by it. */
  priorityWeight: number
  dueDate?: Date | null
  tags: string[]
  completedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const taskSchema = new Schema<ITask>(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: 200,
    },
    description: { type: String, default: '', maxlength: 5000 },
    reference: { type: String, default: null, trim: true, uppercase: true },
    list: { type: Schema.Types.ObjectId, ref: 'TaskList', required: true },
    position: { type: Number, default: 0 },
    isDone: { type: Boolean, default: false },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    assignee: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'MEDIUM' },
    priorityWeight: { type: Number, default: 2 },
    dueDate: { type: Date, default: null },
    tags: { type: [String], default: [] },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

taskSchema.index({ list: 1, position: 1 })
taskSchema.index({ assignee: 1, isDone: 1 })
taskSchema.index({ createdBy: 1 })
taskSchema.index({ project: 1 })
taskSchema.index({ dueDate: 1 })
// Unique only among tasks that actually have a reference. This must be a partial
// index rather than a sparse one: sparse skips missing fields but still indexes
// an explicit null, so a second project-less task would collide.
taskSchema.index(
  { reference: 1 },
  { unique: true, partialFilterExpression: { reference: { $type: 'string' } } }
)
taskSchema.index({ title: 'text', description: 'text' })

export const Task = model<ITask>('Task', taskSchema)
