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

/**
 * Knowledge base articles move through these states. Only PUBLISHED is on the
 * shelf for everyone; a draft stays with the people who can edit it, and an
 * archived article keeps its link working without turning up in browsing.
 */
export const ARTICLE_STATUSES = ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED'] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

/** The states an article has to be in before anyone outside its editors sees it. */
export const READABLE_ARTICLE_STATUSES: ArticleStatus[] = ['PUBLISHED', 'ARCHIVED']

/** Who an article is written for. The same vocabulary the file library uses. */
export const ARTICLE_VISIBILITIES = ['PRIVATE', 'TEAM', 'PROJECT'] as const
export type ArticleVisibility = (typeof ARTICLE_VISIBILITIES)[number]

/** Roles that may edit any article, curate the shelf and pin things to the top. */
export const KNOWLEDGE_MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD']

/** Roles that may add, rename and retire the categories articles are filed under. */
export const CATEGORY_MANAGER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER']

/**
 * The icon a category carries on the shelf. Stored as a key rather than a
 * component name so the server never dictates which icon set the client draws.
 */
export const CATEGORY_ICONS = [
  'book',
  'compass',
  'rocket',
  'shield',
  'wrench',
  'sparkles',
  'users',
  'code',
  'lifebuoy',
  'scale',
] as const
export type CategoryIcon = (typeof CATEGORY_ICONS)[number]

/** Average prose reading speed, behind the "4 min read" line on every article. */
export const WORDS_READ_PER_MINUTE = 220

/** A comment thread is one level deep: a comment, and replies to it. */
export const MAX_COMMENT_DEPTH = 1

/**
 * The ceiling on one graph render. Past a few hundred nodes a force layout
 * stops being readable long before it stops being computable, so the view
 * caps and says so rather than drawing a hairball.
 */
export const MAX_GRAPH_NODES = 400

/** How far the local graph on an article page reaches by default. */
export const DEFAULT_GRAPH_DEPTH = 1

/**
 * What a notification is about. The type drives the icon, the sentence and
 * where clicking it lands, so adding a kind of event means adding it here
 * rather than writing prose at the call site.
 */
export const NOTIFICATION_TYPES = [
  'TASK_ASSIGNED',
  'TASK_UNASSIGNED',
  'TASK_DUE_SOON',
  'TASK_OVERDUE',
  'TASK_COMPLETED',
  'TASK_REOPENED',
  'PROJECT_MEMBER_ADDED',
  'PROJECT_MEMBER_REMOVED',
  'ARTICLE_COMMENTED',
  'ARTICLE_MENTIONED',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** The thing a notification points at, so the client knows where to send a click. */
export const NOTIFICATION_ENTITIES = ['TASK', 'PROJECT', 'ARTICLE'] as const
export type NotificationEntity = (typeof NOTIFICATION_ENTITIES)[number]

/**
 * Read notifications are swept after this long. A notification is a nudge,
 * not a record — the audit log is what keeps history.
 */
export const NOTIFICATION_RETENTION_DAYS = 60

/** Roles that can see what the whole team is carrying, not just their own work. */
export const WORKLOAD_VIEWER_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD']

/** A task is "due soon" once it falls inside this window. */
export const DUE_SOON_HOURS = 48

/**
 * What the audit log records. Only the consequential, organisation-wide acts
 * are here — the ones an administrator would be asked to account for later.
 * Ordinary work (creating a task, uploading a file) is deliberately absent:
 * the log is for governance, not for activity.
 */
export const AUDIT_ACTIONS = [
  'USER_ROLE_CHANGED',
  'USER_ACTIVATED',
  'USER_DEACTIVATED',
  'USER_REGISTERED',
  'DEPARTMENT_CREATED',
  'DEPARTMENT_UPDATED',
  'DEPARTMENT_DELETED',
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/** The kind of thing an entry is about, so the client knows where to link. */
export const AUDIT_ENTITIES = ['USER', 'DEPARTMENT'] as const
export type AuditEntity = (typeof AUDIT_ENTITIES)[number]

/**
 * How loudly an entry should read. Severity is a property of the action, not
 * of the row, so it is resolved here rather than stored — otherwise a later
 * change of judgement would only apply to entries written after it.
 */
export const AUDIT_SEVERITIES = ['INFO', 'NOTICE', 'ALERT'] as const
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number]

export const AUDIT_ACTION_SEVERITY: Record<AuditAction, AuditSeverity> = {
  USER_ROLE_CHANGED: 'ALERT',
  USER_DEACTIVATED: 'ALERT',
  USER_ACTIVATED: 'NOTICE',
  DEPARTMENT_DELETED: 'NOTICE',
  DEPARTMENT_CREATED: 'INFO',
  DEPARTMENT_UPDATED: 'INFO',
  USER_REGISTERED: 'INFO',
}

/**
 * The log is a record, so it is kept far longer than a notification — but not
 * forever, because nothing here sweeps it by hand.
 */
export const AUDIT_RETENTION_DAYS = 365
