import { Schema, model, type Document, type Types } from 'mongoose'

/**
 * A note under an article. Threads are one level deep — a comment and the
 * replies to it — which is enough to answer a question without the page
 * turning into a tree nobody reads to the bottom of.
 */
export interface IArticleComment extends Document {
  _id: Types.ObjectId
  article: Types.ObjectId
  author: Types.ObjectId
  body: string
  /** Null on a top-level comment; the comment being answered on a reply. */
  parent?: Types.ObjectId | null
  isEdited: boolean
  editedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const articleCommentSchema = new Schema<IArticleComment>(
  {
    article: { type: Schema.Types.ObjectId, ref: 'Article', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: {
      type: String,
      required: [true, 'A comment cannot be empty'],
      trim: true,
      maxlength: 4000,
    },
    parent: { type: Schema.Types.ObjectId, ref: 'ArticleComment', default: null },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

articleCommentSchema.index({ article: 1, createdAt: 1 })
articleCommentSchema.index({ parent: 1 })

export const ArticleComment = model<IArticleComment>('ArticleComment', articleCommentSchema)
