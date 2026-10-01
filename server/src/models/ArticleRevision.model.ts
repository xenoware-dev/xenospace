import { Schema, model, type Document, type Types } from 'mongoose'

/**
 * One saved version of an article's content. The whole body is kept rather than
 * a diff: articles are small next to the cost of reconstructing a page from a
 * chain of patches, and a reader restoring an old version wants exactly what
 * was there, not a replay.
 */
export interface IArticleRevision extends Document {
  _id: Types.ObjectId
  article: Types.ObjectId
  /** Matches the article's `version` at the moment this content was saved. */
  version: number
  title: string
  excerpt: string
  body: string
  /** What the editor said they changed, if anything. */
  changeNote: string
  wordCount: number
  editedBy: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const articleRevisionSchema = new Schema<IArticleRevision>(
  {
    article: { type: Schema.Types.ObjectId, ref: 'Article', required: true },
    version: { type: Number, required: true },
    title: { type: String, required: true },
    excerpt: { type: String, default: '' },
    body: { type: String, default: '' },
    changeNote: { type: String, default: '', maxlength: 300 },
    wordCount: { type: Number, default: 0 },
    editedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
)

// The history panel reads one article's versions, newest first.
articleRevisionSchema.index({ article: 1, version: -1 }, { unique: true })

export const ArticleRevision = model<IArticleRevision>('ArticleRevision', articleRevisionSchema)
