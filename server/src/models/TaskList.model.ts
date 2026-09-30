import { Schema, model, type Document, type Types } from 'mongoose'

export interface ITaskList extends Document {
  _id: Types.ObjectId
  name: string
  /** Left-to-right order on the board. */
  position: number
  /** Cards dropped here count as complete, the way a "Done" column does. */
  isDone: boolean
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const taskListSchema = new Schema<ITaskList>(
  {
    name: {
      type: String,
      required: [true, 'List name is required'],
      trim: true,
      maxlength: 60,
    },
    position: { type: Number, default: 0 },
    isDone: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

taskListSchema.index({ position: 1 })

export const TaskList = model<ITaskList>('TaskList', taskListSchema)
