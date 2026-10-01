import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import {
  Book,
  Code,
  Compass,
  LifeBuoy,
  Rocket,
  Scale,
  Shield,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

import type {
  ArticleScope,
  ArticleSort,
  ArticleStatus,
  ArticleVisibility,
  CategoryIcon,
} from '@/types/knowledge'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

/** The icon a shelf carries. The server stores the key; the set lives here. */
export const categoryIcons: Record<CategoryIcon, LucideIcon> = {
  book: Book,
  compass: Compass,
  rocket: Rocket,
  shield: Shield,
  wrench: Wrench,
  sparkles: Sparkles,
  users: Users,
  code: Code,
  lifebuoy: LifeBuoy,
  scale: Scale,
}

export const categoryIconLabels: Record<CategoryIcon, string> = {
  book: 'Handbook',
  compass: 'Orientation',
  rocket: 'Getting started',
  shield: 'Security',
  wrench: 'Engineering',
  sparkles: 'Product',
  users: 'People',
  code: 'Code',
  lifebuoy: 'Support',
  scale: 'Policy',
}

export const statusMeta: Record<
  ArticleStatus,
  { label: string; description: string; variant: BadgeVariant }
> = {
  DRAFT: {
    label: 'Draft',
    description: 'Only you and the knowledge managers can see it',
    variant: 'outline',
  },
  IN_REVIEW: {
    label: 'In review',
    description: 'Waiting on a read-through before it goes on the shelf',
    variant: 'warning',
  },
  PUBLISHED: {
    label: 'Published',
    description: 'On the shelf for everyone it is addressed to',
    variant: 'success',
  },
  ARCHIVED: {
    label: 'Archived',
    description: 'Off the shelf, but old links still resolve',
    variant: 'secondary',
  },
}

export const visibilityMeta: Record<
  ArticleVisibility,
  { label: string; description: string; variant: BadgeVariant }
> = {
  PRIVATE: {
    label: 'Private',
    description: 'Only you and the knowledge managers',
    variant: 'outline',
  },
  TEAM: {
    label: 'Team',
    description: 'Everyone signed in to Xenospace',
    variant: 'secondary',
  },
  PROJECT: {
    label: 'Project',
    description: 'Only the people on the chosen project',
    variant: 'default',
  },
}

export const scopeLabels: Record<ArticleScope, string> = {
  all: 'Browse',
  mine: 'Written by me',
  bookmarks: 'Bookmarks',
  drafts: 'Drafts',
  archived: 'Archive',
}

export const sortLabels: Record<ArticleSort, string> = {
  recent: 'Recently published',
  updated: 'Recently updated',
  popular: 'Most read',
  title: 'Title',
}

export function formatArticleDate(value: string) {
  return format(parseISO(value), 'd MMM yyyy')
}

export function formatArticleDateTime(value: string) {
  return format(parseISO(value), 'd MMM yyyy, HH:mm')
}

/** "updated 3 hours ago", for cards and the history log. */
export function relativeDate(value: string) {
  return `${formatDistanceToNowStrict(parseISO(value))} ago`
}

export function readingTime(minutes: number) {
  return `${minutes} min read`
}

/** Large view counts read better folded: 1,240 becomes 1.2k. */
export function formatViews(views: number) {
  if (views < 1000) return String(views)
  return `${(views / 1000).toFixed(views < 10_000 ? 1 : 0)}k`
}
