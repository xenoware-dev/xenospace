import { z } from 'zod';
import {
  PRIORITIES, PROJECT_STATUSES, SPRINT_STATUSES, STORY_POINTS, TASK_STATUSES,
  TASK_TYPES, ISSUE_KINDS, ISSUE_STATUSES, SEVERITIES,
} from '../domain.js';
import {
  csvEnum, dateOnly, hexColor, optionalText, paginationQuery, projectKey, queryBool, text, uuid,
} from './common.js';

/* ------------------------------------------------------------------ projects */

export const createProjectSchema = z.object({
  name: text(2, 120, 'Project name'),
  key: projectKey,
  description: optionalText(2000, 'Description'),
  status: z.enum(PROJECT_STATUSES).default('PLANNING'),
  color: hexColor.default('#6366f1'),
  startDate: dateOnly.optional(),
  targetDate: dateOnly.optional(),
  leadId: uuid.optional(),
  memberIds: z.array(uuid).max(200).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema
  .omit({ key: true, memberIds: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const projectListQuery = paginationQuery.extend({
  status: csvEnum(PROJECT_STATUSES),
  q: optionalText(120, 'Search'),
  sort: z.enum(['updatedAt', 'createdAt', 'name', 'targetDate']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const projectMemberSchema = z.object({
  userId: uuid,
  /** Project-scoped role, distinct from the workspace role. */
  projectRole: z.enum(['LEAD', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

/* --------------------------------------------------------------------- tasks */

export const createTaskSchema = z.object({
  projectId: uuid,
  title: text(3, 200, 'Title'),
  description: optionalText(20_000, 'Description'),
  type: z.enum(TASK_TYPES).default('FEATURE'),
  status: z.enum(TASK_STATUSES).default('TODO'),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  assigneeId: uuid.nullish(),
  sprintId: uuid.nullish(),
  parentTaskId: uuid.nullish(),
  /** Fibonacci story points; the allowed set lives in `STORY_POINTS`. */
  estimate: z.coerce
    .number()
    .int()
    .refine((v) => (STORY_POINTS as readonly number[]).includes(v), {
      message: `Estimate must be one of ${STORY_POINTS.join(', ')}`,
    })
    .nullish(),
  dueDate: dateOnly.nullish(),
  labels: z.array(text(1, 32, 'Label')).max(12).default([]),
  /** Ids of tasks that must reach DONE before this one may leave BLOCKED. */
  blockedByIds: z.array(uuid).max(20).optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = createTaskSchema
  .omit({ projectId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

/**
 * A drag on the Kanban board. `position` is the fractional rank within the
 * destination column, computed client-side from the neighbours it was dropped
 * between, which keeps a reorder to a single-row write.
 */
export const moveTaskSchema = z.object({
  status: z.enum(TASK_STATUSES),
  position: z.number().finite(),
  sprintId: uuid.nullish(),
});
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;

export const assignTaskSchema = z.object({ assigneeId: uuid.nullable() });

export const taskListQuery = paginationQuery.extend({
  projectId: uuid.optional(),
  sprintId: uuid.optional(),
  assigneeId: z.union([uuid, z.literal('me'), z.literal('unassigned')]).optional(),
  status: csvEnum(TASK_STATUSES),
  priority: csvEnum(PRIORITIES),
  type: csvEnum(TASK_TYPES),
  label: optionalText(32, 'Label'),
  q: optionalText(120, 'Search'),
  dueBefore: dateOnly.optional(),
  dueAfter: dateOnly.optional(),
  overdue: queryBool.optional(),
  /** Only tasks without a due date (the calendar's unscheduled tray). */
  unscheduled: queryBool.optional(),
  sort: z.enum(['position', 'updatedAt', 'createdAt', 'priority', 'dueDate']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type TaskListQuery = z.infer<typeof taskListQuery>;

export const taskCommentSchema = z.object({
  body: text(1, 10_000, 'Comment'),
  /** User ids mentioned in the body, used to fan out notifications. */
  mentions: z.array(uuid).max(50).default([]),
});

export const logTimeSchema = z.object({
  minutes: z.coerce.number().int().min(1).max(24 * 60),
  spentOn: dateOnly,
  note: optionalText(500, 'Note'),
});

/* ------------------------------------------------------------------- sprints */

export const createSprintSchema = z
  .object({
    projectId: uuid,
    name: text(2, 120, 'Sprint name'),
    goal: optionalText(1000, 'Goal'),
    startDate: dateOnly,
    endDate: dateOnly,
    status: z.enum(SPRINT_STATUSES).default('PLANNED'),
    capacityPoints: z.coerce.number().int().min(0).max(999).optional(),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });
export type CreateSprintInput = z.infer<typeof createSprintSchema>;

export const updateSprintSchema = z
  .object({
    name: text(2, 120, 'Sprint name').optional(),
    goal: optionalText(1000, 'Goal'),
    startDate: dateOnly.optional(),
    endDate: dateOnly.optional(),
    capacityPoints: z.coerce.number().int().min(0).max(999).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

/** Completing a sprint must say where unfinished work goes. */
export const completeSprintSchema = z.object({
  moveUnfinishedTo: z.union([z.literal('BACKLOG'), uuid]).default('BACKLOG'),
  retrospective: optionalText(10_000, 'Retrospective'),
});

/* ------------------------------------------------------------ issues & bugs */

export const createIssueSchema = z.object({
  projectId: uuid,
  title: text(3, 200, 'Title'),
  description: text(1, 20_000, 'Description'),
  kind: z.enum(ISSUE_KINDS).default('BUG'),
  severity: z.enum(SEVERITIES).default('S3'),
  status: z.enum(ISSUE_STATUSES).default('OPEN'),
  assigneeId: uuid.nullish(),
  stepsToReproduce: optionalText(10_000, 'Steps to reproduce'),
  expectedBehaviour: optionalText(5000, 'Expected behaviour'),
  actualBehaviour: optionalText(5000, 'Actual behaviour'),
  environment: optionalText(500, 'Environment'),
  affectedVersion: optionalText(60, 'Affected version'),
  labels: z.array(text(1, 32, 'Label')).max(12).default([]),
  linkedTaskId: uuid.nullish(),
});
export type CreateIssueInput = z.infer<typeof createIssueSchema>;

export const updateIssueSchema = createIssueSchema
  .omit({ projectId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const issueListQuery = paginationQuery.extend({
  projectId: uuid.optional(),
  assigneeId: z.union([uuid, z.literal('me'), z.literal('unassigned')]).optional(),
  reporterId: z.union([uuid, z.literal('me')]).optional(),
  status: csvEnum(ISSUE_STATUSES),
  severity: csvEnum(SEVERITIES),
  kind: csvEnum(ISSUE_KINDS),
  q: optionalText(120, 'Search'),
  sort: z.enum(['updatedAt', 'createdAt', 'severity', 'status']).default('updatedAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const resolveIssueSchema = z.object({
  resolution: text(1, 5000, 'Resolution'),
  status: z.enum(['RESOLVED', 'CLOSED', 'WONT_FIX']).default('RESOLVED'),
});
