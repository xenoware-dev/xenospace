// Central place for RBAC roles and other shared enums.
// Roles are ordered from highest to lowest privilege.
export const ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'MANAGER',
  'TEAM_LEAD',
  'DEVELOPER',
  'DESIGNER',
  'MARKETING',
  'INTERN',
  'MEMBER',
] as const

export type Role = (typeof ROLES)[number]

export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN']

export const PRESENCE_STATUSES = ['ONLINE', 'AWAY', 'BUSY', 'OFFLINE'] as const
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number]

// Projects move through these states; ARCHIVED is hidden from the default list.
export const PROJECT_STATUSES = [
  'PLANNING',
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'ARCHIVED',
] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const
export type ProjectPriority = (typeof PROJECT_PRIORITIES)[number]

/** Roles that may create a project and manage any project they do not lead. */
export const PROJECT_MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD']

/** Seeded onto a brand new board so it is usable straight away. */
export const DEFAULT_TASK_LISTS = [
  { name: 'To do', isDone: false },
  { name: 'In progress', isDone: false },
  { name: 'In review', isDone: false },
  { name: 'Done', isDone: true },
]

/** Tasks and projects share one priority vocabulary. */
export const TASK_PRIORITIES = PROJECT_PRIORITIES
export type TaskPriority = ProjectPriority

/** Sortable weights, so "most urgent first" is a plain index sort in Mongo. */
export const TASK_PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
}

/**
 * What the calendar draws. A project contributes up to two events — its kickoff
 * and its deadline — so the kind, not the row, is what identifies an event.
 */
export const CALENDAR_EVENT_KINDS = ['TASK', 'PROJECT_START', 'PROJECT_DUE'] as const
export type CalendarEventKind = (typeof CALENDAR_EVENT_KINDS)[number]

/** Statuses that take a project off the "still running" reckoning. */
export const SETTLED_PROJECT_STATUSES: ProjectStatus[] = ['COMPLETED', 'ARCHIVED']

/**
 * The file library stores folders and files in one tree, the way a filesystem
 * does, so a node's kind is what separates a container from a payload.
 */
export const FILE_NODE_KINDS = ['FOLDER', 'FILE'] as const
export type FileNodeKind = (typeof FILE_NODE_KINDS)[number]

/**
 * Who can see a node. A folder passes its visibility down to whatever is
 * created inside it, so people drop a file in the right place rather than
 * setting permissions per upload.
 */
export const FILE_VISIBILITIES = ['PRIVATE', 'TEAM', 'PROJECT'] as const
export type FileVisibility = (typeof FILE_VISIBILITIES)[number]

/** Coarse buckets behind the icon, the filter row and the storage breakdown. */
export const FILE_CATEGORIES = [
  'FOLDER',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'PDF',
  'DOCUMENT',
  'SPREADSHEET',
  'PRESENTATION',
  'ARCHIVE',
  'CODE',
  'OTHER',
] as const
export type FileCategory = (typeof FILE_CATEGORIES)[number]

/** Roles that may manage any node, not only the ones they own. */
export const FILE_MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER']

/** Extensions mapped onto a category; anything unlisted falls back to OTHER. */
export const FILE_CATEGORY_BY_EXTENSION: Record<string, FileCategory> = {
  // Images
  png: 'IMAGE', jpg: 'IMAGE', jpeg: 'IMAGE', gif: 'IMAGE', webp: 'IMAGE',
  svg: 'IMAGE', avif: 'IMAGE', bmp: 'IMAGE', ico: 'IMAGE', heic: 'IMAGE',
  // Video
  mp4: 'VIDEO', mov: 'VIDEO', webm: 'VIDEO', avi: 'VIDEO', mkv: 'VIDEO', m4v: 'VIDEO',
  // Audio
  mp3: 'AUDIO', wav: 'AUDIO', ogg: 'AUDIO', m4a: 'AUDIO', flac: 'AUDIO', aac: 'AUDIO',
  // Documents
  pdf: 'PDF',
  doc: 'DOCUMENT', docx: 'DOCUMENT', odt: 'DOCUMENT', rtf: 'DOCUMENT',
  txt: 'DOCUMENT', md: 'DOCUMENT',
  xls: 'SPREADSHEET', xlsx: 'SPREADSHEET', ods: 'SPREADSHEET', csv: 'SPREADSHEET',
  ppt: 'PRESENTATION', pptx: 'PRESENTATION', odp: 'PRESENTATION', key: 'PRESENTATION',
  // Archives
  zip: 'ARCHIVE', rar: 'ARCHIVE', '7z': 'ARCHIVE', tar: 'ARCHIVE', gz: 'ARCHIVE', bz2: 'ARCHIVE',
  // Code
  js: 'CODE', jsx: 'CODE', ts: 'CODE', tsx: 'CODE', json: 'CODE', html: 'CODE',
  css: 'CODE', scss: 'CODE', py: 'CODE', java: 'CODE', go: 'CODE', rs: 'CODE',
  rb: 'CODE', php: 'CODE', c: 'CODE', cpp: 'CODE', sh: 'CODE', yml: 'CODE',
  yaml: 'CODE', xml: 'CODE', sql: 'CODE',
}

/** Previews are rendered inline in the browser only for types it can display. */
export const INLINE_PREVIEW_CATEGORIES: FileCategory[] = ['IMAGE', 'PDF', 'VIDEO', 'AUDIO']

/** Folders nest this deep and no deeper, so a pathological tree cannot be built. */
export const MAX_FOLDER_DEPTH = 10
