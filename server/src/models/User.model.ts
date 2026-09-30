import { Schema, model, type Document, type Types } from 'mongoose'

import { PRESENCE_STATUSES, ROLES, type PresenceStatus, type Role } from '@/types/enums'

export interface IUser extends Document {
  _id: Types.ObjectId
  name: string
  username: string
  email: string
  password: string
  role: Role
  avatarUrl?: string
  department?: string
  bio?: string
  skills: string[]
  presenceStatus: PresenceStatus
  isActive: boolean
  isEmailVerified: boolean
  emailVerificationTokenHash?: string | null
  emailVerificationExpires?: Date | null
  passwordResetTokenHash?: string | null
  passwordResetExpires?: Date | null
  refreshTokenHash?: string | null
  refreshTokenExpires?: Date | null
  lastLoginAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 32,
      match: [/^[a-z0-9._-]+$/, 'Username can only contain letters, numbers, dots, dashes and underscores'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false,
    },
    role: {
      type: String,
      enum: ROLES,
      default: 'MEMBER',
    },
    avatarUrl: { type: String, default: null },
    department: { type: String, default: null, trim: true },
    bio: { type: String, default: '', maxlength: 500 },
    skills: { type: [String], default: [] },
    presenceStatus: {
      type: String,
      enum: PRESENCE_STATUSES,
      default: 'OFFLINE',
    },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationTokenHash: { type: String, default: null, select: false },
    emailVerificationExpires: { type: Date, default: null, select: false },
    passwordResetTokenHash: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false },
    refreshTokenHash: { type: String, default: null, select: false },
    refreshTokenExpires: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
)

userSchema.index({ role: 1 })

export const User = model<IUser>('User', userSchema)
