/** Domain vocabulary shared by the API, the database check constraints and the UI. */

export const TASK_STATUSES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Columns rendered on the Kanban board, in order, left to right. */
export const KANBAN_COLUMNS: readonly TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'DONE'];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG: 'Backlog',
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  IN_REVIEW: 'In Review',
  BLOCKED: 'Blocked',
  DONE: 'Done',
};

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent',
};

/** Ordering weight for "most urgent first" sorts. */
export const PRIORITY_WEIGHT: Record<Priority, number> = {
  URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
};

export const TASK_TYPES = ['FEATURE', 'BUG', 'CHORE', 'SPIKE', 'DOCS'] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const PROJECT_STATUSES = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  PLANNING: 'Planning', ACTIVE: 'Active', ON_HOLD: 'On Hold',
  COMPLETED: 'Completed', ARCHIVED: 'Archived',
};

export const SPRINT_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED'] as const;
export type SprintStatus = (typeof SPRINT_STATUSES)[number];

export const ISSUE_KINDS = ['BUG', 'INCIDENT', 'VULNERABILITY', 'REGRESSION', 'QUESTION'] as const;
export type IssueKind = (typeof ISSUE_KINDS)[number];

export const ISSUE_STATUSES = ['OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  OPEN: 'Open', TRIAGED: 'Triaged', IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved', CLOSED: 'Closed', WONT_FIX: "Won't Fix",
};

export const SEVERITIES = ['S1', 'S2', 'S3', 'S4'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_LABEL: Record<Severity, string> = {
  S1: 'S1 · Critical', S2: 'S2 · Major', S3: 'S3 · Minor', S4: 'S4 · Trivial',
};

export const REVIEW_STATUSES = ['OPEN', 'APPROVED', 'CHANGES_REQUESTED', 'MERGED', 'CLOSED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  OPEN: 'Open', APPROVED: 'Approved', CHANGES_REQUESTED: 'Changes Requested',
  MERGED: 'Merged', CLOSED: 'Closed',
};

export const DEPLOY_ENVIRONMENTS = ['DEVELOPMENT', 'STAGING', 'PRODUCTION'] as const;
export type DeployEnvironment = (typeof DEPLOY_ENVIRONMENTS)[number];

export const DEPLOY_STATUSES = ['QUEUED', 'BUILDING', 'DEPLOYING', 'SUCCEEDED', 'FAILED', 'ROLLED_BACK'] as const;
export type DeployStatus = (typeof DEPLOY_STATUSES)[number];

export const DEPLOY_STATUS_LABEL: Record<DeployStatus, string> = {
  QUEUED: 'Queued', BUILDING: 'Building', DEPLOYING: 'Deploying',
  SUCCEEDED: 'Succeeded', FAILED: 'Failed', ROLLED_BACK: 'Rolled Back',
};

export const GIT_PROVIDERS = ['GITHUB', 'GITLAB', 'BITBUCKET', 'OTHER'] as const;
export type GitProvider = (typeof GIT_PROVIDERS)[number];

export const CHANNEL_KINDS = ['PUBLIC', 'PRIVATE', 'DIRECT'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export const EVENT_KINDS = ['MEETING', 'STANDUP', 'REVIEW', 'RETRO', 'RELEASE', 'DEADLINE', 'LEAVE', 'OTHER'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const NOTIFICATION_KINDS = [
  'TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_COMMENT', 'MENTION', 'REVIEW_REQUESTED',
  'REVIEW_APPROVED', 'REVIEW_CHANGES', 'ISSUE_ASSIGNED', 'DEPLOY_STATUS',
  'SPRINT_STARTED', 'SPRINT_COMPLETED', 'EVENT_REMINDER', 'CHANNEL_MESSAGE', 'SYSTEM',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const DOC_VISIBILITIES = ['PRIVATE', 'TEAM', 'PUBLIC'] as const;
export type DocVisibility = (typeof DOC_VISIBILITIES)[number];

export const USER_STATUSES = ['ACTIVE', 'INVITED', 'SUSPENDED', 'DEACTIVATED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PRESENCE_STATES = ['ONLINE', 'AWAY', 'BUSY', 'OFFLINE'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

/**
 * Legal Kanban transitions. Enforced server-side so a crafted PATCH cannot move
 * a task from BACKLOG straight to DONE and skip review.
 */
export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  BACKLOG: ['TODO'],
  TODO: ['BACKLOG', 'IN_PROGRESS', 'BLOCKED'],
  IN_PROGRESS: ['TODO', 'IN_REVIEW', 'BLOCKED', 'DONE'],
  IN_REVIEW: ['IN_PROGRESS', 'BLOCKED', 'DONE'],
  BLOCKED: ['TODO', 'IN_PROGRESS', 'IN_REVIEW'],
  DONE: ['IN_REVIEW', 'IN_PROGRESS'],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return TASK_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Fibonacci story points, the only values the estimate field accepts. */
export const STORY_POINTS = [0, 1, 2, 3, 5, 8, 13, 21] as const;
export type StoryPoint = (typeof STORY_POINTS)[number];
