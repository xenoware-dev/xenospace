import { z } from 'zod';
import {
  CHANNEL_KINDS, DEPLOY_ENVIRONMENTS, DEPLOY_STATUSES, DOC_VISIBILITIES,
  EVENT_KINDS, GIT_PROVIDERS, NOTIFICATION_KINDS, PRESENCE_STATES, REVIEW_STATUSES,
} from '../domain.js';
import {
  csvEnum, cursorQuery, hexColor, isoDate, optionalText, paginationQuery, queryBool, text, uuid,
} from './common.js';

/* --------------------------------------------------------------- code review */

export const createReviewSchema = z.object({
  projectId: uuid,
  repositoryId: uuid.optional(),
  title: text(3, 200, 'Title'),
  description: optionalText(20_000, 'Description'),
  sourceBranch: text(1, 255, 'Source branch'),
  targetBranch: text(1, 255, 'Target branch').default('main'),
  /** Upstream pull/merge request number, when the repo is connected. */
  externalNumber: z.coerce.number().int().min(1).optional(),
  externalUrl: z.string().url().max(2048).optional(),
  reviewerIds: z.array(uuid).max(20).default([]),
  linkedTaskId: uuid.nullish(),
  additions: z.coerce.number().int().min(0).optional(),
  deletions: z.coerce.number().int().min(0).optional(),
  changedFiles: z.coerce.number().int().min(0).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const reviewListQuery = paginationQuery.extend({
  projectId: uuid.optional(),
  authorId: z.union([uuid, z.literal('me')]).optional(),
  reviewerId: z.union([uuid, z.literal('me')]).optional(),
  status: csvEnum(REVIEW_STATUSES),
  q: optionalText(120, 'Search'),
});

/** A review verdict. APPROVED needs no body; CHANGES_REQUESTED must explain. */
export const reviewVerdictSchema = z
  .object({
    verdict: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']),
    body: optionalText(10_000, 'Comment'),
  })
  .refine((d) => d.verdict !== 'REQUEST_CHANGES' || (d.body && d.body.length > 0), {
    message: 'Say what needs changing',
    path: ['body'],
  });

export const reviewCommentSchema = z.object({
  body: text(1, 10_000, 'Comment'),
  filePath: optionalText(1024, 'File path'),
  line: z.coerce.number().int().min(1).optional(),
  /** Reply target, for threaded inline discussion. */
  parentId: uuid.nullish(),
  mentions: z.array(uuid).max(50).default([]),
});

/* -------------------------------------------------------------- repositories */

export const connectRepoSchema = z.object({
  projectId: uuid,
  provider: z.enum(GIT_PROVIDERS).default('GITHUB'),
  name: text(1, 200, 'Repository name'),
  /** `owner/repo` for GitHub-style providers. */
  fullName: text(1, 255, 'Full name'),
  url: z.string().url().max(2048),
  defaultBranch: text(1, 255, 'Default branch').default('main'),
  isPrivate: z.boolean().default(true),
  /**
   * Personal access token. Write-only: it is encrypted at rest and never
   * returned by any read endpoint.
   */
  accessToken: z.string().min(8).max(512).optional(),
});
export type ConnectRepoInput = z.infer<typeof connectRepoSchema>;

export const updateRepoSchema = connectRepoSchema
  .omit({ projectId: true, provider: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

/* --------------------------------------------------------------- deployments */

export const createDeploymentSchema = z.object({
  projectId: uuid,
  repositoryId: uuid.nullish(),
  environment: z.enum(DEPLOY_ENVIRONMENTS),
  version: text(1, 80, 'Version'),
  commitSha: z.string().trim().regex(/^[0-9a-f]{7,40}$/i, 'Expected a commit SHA').optional(),
  branch: optionalText(255, 'Branch'),
  notes: optionalText(5000, 'Notes'),
});
export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>;

export const updateDeploymentSchema = z.object({
  status: z.enum(DEPLOY_STATUSES),
  logUrl: z.string().url().max(2048).optional(),
  durationSeconds: z.coerce.number().int().min(0).max(86_400).optional(),
  notes: optionalText(5000, 'Notes'),
});

export const deploymentListQuery = paginationQuery.extend({
  projectId: uuid.optional(),
  environment: csvEnum(DEPLOY_ENVIRONMENTS),
  status: csvEnum(DEPLOY_STATUSES),
});

/* ------------------------------------------------------------------ calendar */

export const createEventSchema = z
  .object({
    projectId: uuid.nullish(),
    title: text(2, 200, 'Title'),
    description: optionalText(5000, 'Description'),
    kind: z.enum(EVENT_KINDS).default('MEETING'),
    startsAt: isoDate,
    endsAt: isoDate,
    allDay: z.boolean().default(false),
    location: optionalText(255, 'Location'),
    meetingUrl: z.string().url().max(2048).optional(),
    attendeeIds: z.array(uuid).max(200).default([]),
    /** RFC 5545 recurrence rule, e.g. `FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR`. */
    recurrenceRule: optionalText(255, 'Recurrence'),
    reminderMinutes: z.coerce.number().int().min(0).max(10_080).nullish(),
  })
  .refine((d) => new Date(d.endsAt) > new Date(d.startsAt), {
    message: 'The event must end after it starts',
    path: ['endsAt'],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = z
  .object({
    title: text(2, 200, 'Title').optional(),
    description: optionalText(5000, 'Description'),
    kind: z.enum(EVENT_KINDS).optional(),
    startsAt: isoDate.optional(),
    endsAt: isoDate.optional(),
    allDay: z.boolean().optional(),
    location: optionalText(255, 'Location'),
    meetingUrl: z.string().url().max(2048).optional(),
    attendeeIds: z.array(uuid).max(200).optional(),
    reminderMinutes: z.coerce.number().int().min(0).max(10_080).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const eventRangeQuery = z
  .object({ from: isoDate, to: isoDate, projectId: uuid.optional() })
  .refine((d) => new Date(d.to) > new Date(d.from), {
    message: '`to` must be after `from`',
    path: ['to'],
  });

export const rsvpSchema = z.object({ response: z.enum(['ACCEPTED', 'DECLINED', 'TENTATIVE']) });

/* ------------------------------------------------------------ knowledge base */

export const createKbNoteSchema = z.object({
  projectId: uuid.nullish(),
  title: text(1, 200, 'Title'),
  /** Markdown body; `[[wiki links]]` inside it build the graph. */
  content: z.string().max(200_000).default(''),
  tags: z.array(text(1, 32, 'Tag')).max(20).default([]),
  visibility: z.enum(DOC_VISIBILITIES).default('TEAM'),
  folder: optionalText(255, 'Folder'),
  icon: optionalText(32, 'Icon'),
});
export type CreateKbNoteInput = z.infer<typeof createKbNoteSchema>;

export const updateKbNoteSchema = createKbNoteSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const kbListQuery = paginationQuery.extend({
  projectId: uuid.optional(),
  tag: optionalText(32, 'Tag'),
  folder: optionalText(255, 'Folder'),
  q: optionalText(120, 'Search'),
  visibility: csvEnum(DOC_VISIBILITIES),
});

/** Node/edge payload powering the Obsidian-style graph view. */
export interface KbGraph {
  nodes: Array<{
    id: string;
    title: string;
    tags: string[];
    /** Number of inbound links, used to size the node. */
    inbound: number;
    outbound: number;
    folder: string | null;
    updatedAt: string;
  }>;
  edges: Array<{ source: string; target: string }>;
  /** Link targets that do not resolve to a note yet. */
  orphanLinks: Array<{ source: string; title: string }>;
}

/* ---------------------------------------------------------------------- chat */

export const createChannelSchema = z.object({
  name: text(1, 80, 'Channel name'),
  topic: optionalText(255, 'Topic'),
  kind: z.enum(CHANNEL_KINDS).default('PUBLIC'),
  projectId: uuid.nullish(),
  memberIds: z.array(uuid).max(500).default([]),
});
export type CreateChannelInput = z.infer<typeof createChannelSchema>;

export const sendMessageSchema = z
  .object({
    body: z.string().trim().max(10_000),
    /** Client-generated id, so an optimistic bubble can be reconciled and a retry deduped. */
    clientId: z.string().min(8).max(64),
    parentId: uuid.nullish(),
    mentions: z.array(uuid).max(50).default([]),
    attachmentIds: z.array(uuid).max(10).default([]),
  })
  .refine((d) => d.body.length > 0 || d.attachmentIds.length > 0, {
    message: 'Write a message or attach a file',
    path: ['body'],
  });
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const editMessageSchema = z.object({ body: text(1, 10_000, 'Message') });

export const messageListQuery = cursorQuery.extend({ before: isoDate.optional() });

export const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
});

export const typingSchema = z.object({ channelId: uuid, isTyping: z.boolean() });

export const presenceSchema = z.object({ state: z.enum(PRESENCE_STATES) });

/* --------------------------------------------------------------- files & docs */

/** Upload ceiling, mirrored by the multipart limit on the API. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_UPLOAD_MIME = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'text/plain', 'text/markdown', 'text/csv',
  'application/json', 'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export const fileMetaSchema = z.object({
  projectId: uuid.nullish(),
  folder: optionalText(255, 'Folder'),
  description: optionalText(1000, 'Description'),
  visibility: z.enum(DOC_VISIBILITIES).default('TEAM'),
});

export const fileListQuery = paginationQuery.extend({
  projectId: uuid.optional(),
  folder: optionalText(255, 'Folder'),
  q: optionalText(120, 'Search'),
  mimeGroup: z.enum(['image', 'document', 'archive', 'other']).optional(),
});

/* ------------------------------------------------------------- notifications */

export const notificationListQuery = cursorQuery.extend({
  unreadOnly: queryBool.default(false),
  kind: csvEnum(NOTIFICATION_KINDS),
});

export const markNotificationsSchema = z.object({
  ids: z.array(uuid).max(500).optional(),
  /** Omitting `ids` marks everything read. */
  all: z.boolean().default(false),
});

/* ------------------------------------------------------------------ settings */

export const updateProfileSchema = z
  .object({
    name: text(2, 80, 'Name').optional(),
    jobTitle: optionalText(80, 'Job title'),
    bio: optionalText(1000, 'Bio'),
    timezone: optionalText(64, 'Timezone'),
    phone: optionalText(32, 'Phone'),
    location: optionalText(120, 'Location'),
    githubHandle: optionalText(64, 'GitHub handle'),
    skills: z.array(text(1, 32, 'Skill')).max(40).optional(),
    avatarColor: hexColor.optional(),
    /** Daily availability used for sprint capacity maths. */
    weeklyHours: z.coerce.number().int().min(0).max(80).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updatePreferencesSchema = z
  .object({
    theme: z.enum(['light', 'dark', 'system']).optional(),
    density: z.enum(['comfortable', 'compact']).optional(),
    accent: hexColor.optional(),
    reducedMotion: z.boolean().optional(),
    emailDigest: z.enum(['off', 'daily', 'weekly']).optional(),
    /** Per-kind opt-out map; absent keys fall back to the kind's default. */
    notifyOn: z.record(z.enum(NOTIFICATION_KINDS), z.boolean()).optional(),
    defaultProjectId: uuid.nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const updateMemberSchema = z
  .object({
    name: text(2, 80, 'Name').optional(),
    jobTitle: optionalText(80, 'Job title'),
    weeklyHours: z.coerce.number().int().min(0).max(80).optional(),
    skills: z.array(text(1, 32, 'Skill')).max(40).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const memberListQuery = paginationQuery.extend({
  q: optionalText(120, 'Search'),
  role: csvEnum(['ADMIN', 'DEVELOPER'] as const),
  status: csvEnum(['ACTIVE', 'INVITED', 'SUSPENDED', 'DEACTIVATED'] as const),
  projectId: uuid.optional(),
  sort: z.enum(['name', 'createdAt', 'openTasks']).default('name'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

/* ----------------------------------------------------------- activity & audit */

export const activityListQuery = cursorQuery.extend({
  projectId: uuid.optional(),
  actorId: z.union([uuid, z.literal('me')]).optional(),
  entityType: optionalText(40, 'Entity type'),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const reportQuery = z.object({
  projectId: uuid.optional(),
  sprintId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  granularity: z.enum(['day', 'week', 'month']).default('week'),
});
