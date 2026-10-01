import { Schema, model, type Document, type Types } from 'mongoose'

import {
  ARTICLE_STATUSES,
  ARTICLE_VISIBILITIES,
  type ArticleStatus,
  type ArticleVisibility,
} from '@/types/enums'

export interface IArticle extends Document {
  _id: Types.ObjectId
  title: string
  /**
   * The readable half of the article's URL. It is minted from the first title
   * and then left alone, so a link shared in chat a year ago still resolves
   * after the article has been renamed twice.
   */
  slug: string
  /** The blurb on a card. Written by hand, or cut from the opening paragraph. */
  excerpt: string
  /** Markdown, rendered by the client — no HTML is ever stored or trusted. */
  body: string
  category: Types.ObjectId
  tags: string[]
  status: ArticleStatus
  visibility: ArticleVisibility
  project?: Types.ObjectId | null
  author: Types.ObjectId
  lastEditedBy: Types.ObjectId
  /** Everyone who has saved a change, author first — the byline on a long page. */
  contributors: Types.ObjectId[]
  /** Bookmarking and the helpful vote are per person, so both live as rosters. */
  bookmarkedBy: Types.ObjectId[]
  helpfulBy: Types.ObjectId[]
  views: number
  /**
   * Articles this one points at through `[[wiki links]]`, resolved at save
   * time. Storing the edge rather than re-parsing every body on each read is
   * what makes the graph view a single query.
   */
  links: Types.ObjectId[]
  /**
   * Link targets with nothing behind them yet, folded to lowercase. Keeping
   * them lets a newly written article wire up the pages that were already
   * pointing at it, which is how a wiki fills in rather than fragments.
   */
  unresolvedLinks: string[]
  /** Bumped on every content save; the revision log is keyed on it. */
  version: number
  wordCount: number
  readingMinutes: number
  /** Pinned articles head the shelf regardless of how it is sorted. */
  isPinned: boolean
  publishedAt?: Date | null
  archivedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

const articleSchema = new Schema<IArticle>(
  {
    title: {
      type: String,
      required: [true, 'A title is required'],
      trim: true,
      maxlength: 180,
    },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    excerpt: { type: String, default: '', maxlength: 400 },
    body: { type: String, default: '' },
    category: { type: Schema.Types.ObjectId, ref: 'ArticleCategory', required: true },
    tags: { type: [String], default: [] },
    status: { type: String, enum: ARTICLE_STATUSES, default: 'DRAFT' },
    visibility: { type: String, enum: ARTICLE_VISIBILITIES, default: 'TEAM' },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastEditedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    contributors: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    bookmarkedBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    helpfulBy: { type: [{ type: Schema.Types.ObjectId, ref: 'User' }], default: [] },
    links: { type: [{ type: Schema.Types.ObjectId, ref: 'Article' }], default: [] },
    unresolvedLinks: { type: [String], default: [] },
    views: { type: Number, default: 0 },
    version: { type: Number, default: 1 },
    wordCount: { type: Number, default: 0 },
    readingMinutes: { type: Number, default: 1 },
    isPinned: { type: Boolean, default: false },
    publishedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true }
)

// Browsing a shelf, which is what the landing page does first.
articleSchema.index({ status: 1, category: 1, isPinned: -1, publishedAt: -1 })
articleSchema.index({ author: 1, status: 1 })
articleSchema.index({ tags: 1 })
articleSchema.index({ bookmarkedBy: 1 })
articleSchema.index({ visibility: 1 })
articleSchema.index({ project: 1 })
// Backlinks ("what points here"), and the edge list behind the graph view.
articleSchema.index({ links: 1 })
// Finding the pages that were waiting on an article that has just been written.
articleSchema.index({ unresolvedLinks: 1 })
// Searching is a partial, as-you-type match rather than whole words, so it runs
// as a regex scan over the shelf the caller can reach — a text index would not
// match "deplo" against "deployment", which is what people actually type, and
// would cost a write on every save for a shelf this size.

export const Article = model<IArticle>('Article', articleSchema)
