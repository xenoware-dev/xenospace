import { Schema, model, type Document, type Types } from 'mongoose'

import { CATEGORY_ICONS, type CategoryIcon } from '@/types/enums'

/**
 * A shelf in the knowledge base. Categories are deliberately flat — a wiki that
 * nests its sections ends up with articles nobody can find, so the depth people
 * need comes from tags instead.
 */
export interface IArticleCategory extends Document {
  _id: Types.ObjectId
  name: string
  /** Stable, lowercase, URL-safe; what the browse page filters on. */
  slug: string
  description: string
  icon: CategoryIcon
  /** Hand-set running order on the shelf; ties break by name. */
  order: number
  createdBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const articleCategorySchema = new Schema<IArticleCategory>(
  {
    name: {
      type: String,
      required: [true, 'A category name is required'],
      trim: true,
      maxlength: 60,
    },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '', maxlength: 300 },
    icon: { type: String, enum: CATEGORY_ICONS, default: 'book' },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

articleCategorySchema.index({ order: 1, name: 1 })

export const ArticleCategory = model<IArticleCategory>('ArticleCategory', articleCategorySchema)
