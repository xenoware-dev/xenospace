import { format, formatDistanceToNowStrict, parseISO } from 'date-fns'
import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Presentation,
  type LucideIcon,
} from 'lucide-react'

import type { FileCategory, FileNode, FileSort, FileVisibility } from '@/types/file'

export const categoryMeta: Record<FileCategory, { label: string; icon: LucideIcon }> = {
  FOLDER: { label: 'Folder', icon: Folder },
  IMAGE: { label: 'Image', icon: FileImage },
  VIDEO: { label: 'Video', icon: FileVideo },
  AUDIO: { label: 'Audio', icon: FileAudio },
  PDF: { label: 'PDF', icon: FileText },
  DOCUMENT: { label: 'Document', icon: FileText },
  SPREADSHEET: { label: 'Spreadsheet', icon: FileSpreadsheet },
  PRESENTATION: { label: 'Presentation', icon: Presentation },
  ARCHIVE: { label: 'Archive', icon: FileArchive },
  CODE: { label: 'Code', icon: FileCode },
  OTHER: { label: 'File', icon: FileIcon },
}

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'

export const visibilityMeta: Record<
  FileVisibility,
  { label: string; description: string; variant: BadgeVariant }
> = {
  PRIVATE: {
    label: 'Private',
    description: 'Only you and the people you share it with',
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

export const scopeLabels = {
  folder: 'Browse',
  mine: 'My files',
  shared: 'Shared with me',
  starred: 'Starred',
  recent: 'Recent',
  trash: 'Trash',
} as const

export const sortLabels: Record<FileSort, string> = {
  name: 'Name',
  recent: 'Recently updated',
  size: 'Largest first',
  kind: 'Type',
}

/** Byte counts in the units people read them in: 0 B, 812 KB, 1.4 GB. */
export function formatBytes(bytes: number) {
  if (bytes <= 0) return '0 B'

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  // Bytes and kilobytes are whole numbers; anything larger reads better with one decimal.
  const decimals = exponent === 0 ? 0 : value >= 100 || exponent === 1 ? 0 : 1

  return `${value.toFixed(decimals)} ${units[exponent]}`
}

export function formatFileDate(value: string) {
  return format(parseISO(value), 'd MMM yyyy, HH:mm')
}

/** "updated 3 hours ago", for the dense list and grid rows. */
export function relativeDate(value: string) {
  return `${formatDistanceToNowStrict(parseISO(value))} ago`
}

/** The label under a row: either the item count context or the file's size. */
export function metaLine(node: FileNode) {
  const type = node.kind === 'FOLDER' ? 'Folder' : categoryMeta[node.category].label
  return node.kind === 'FOLDER' ? type : `${type} · ${formatBytes(node.size)}`
}
