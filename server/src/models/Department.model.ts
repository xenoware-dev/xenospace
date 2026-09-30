import { Schema, model, type Document, type Types } from 'mongoose'

export interface IDepartment extends Document {
  _id: Types.ObjectId
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
}

const departmentSchema = new Schema<IDepartment>(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      unique: true,
      trim: true,
      maxlength: 80,
    },
    description: { type: String, default: '', maxlength: 300 },
  },
  { timestamps: true }
)

export const Department = model<IDepartment>('Department', departmentSchema)
