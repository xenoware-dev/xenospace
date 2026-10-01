import type { QueryFilter } from 'mongoose'

import { Project, type IProject } from '@/models/Project.model'
import { Task, type ITask } from '@/models/Task.model'
import {
  SETTLED_PROJECT_STATUSES,
  type CalendarEventKind,
  type ProjectStatus,
  type Role,
  type TaskPriority,
} from '@/types/enums'
import { toProjectRef, toUserRef, type ProjectRef, type UserRef } from '@/utils/refs'

const USER_REF_FIELDS = 'name username avatarUrl role presenceStatus'

/**
 * A window wide enough for a six-week month grid holds far fewer cards than
 * this in practice; the cap is only here so a pathological range cannot pull the
 * whole collection into memory.
 */
const MAX_TASKS = 600
const MAX_PROJECTS = 300

export interface CalendarEvent {
  /** Unique per event, not per row — `kind:rowId`, since a project yields two. */
  id: string
  kind: CalendarEventKind
  /** The task or project this event points back at. */
  sourceId: string
  title: string
  date: Date
  /** Whether the event is settled: a completed card, or a closed project. */
  isDone: boolean
  priority: TaskPriority
  reference: string | null
  /** The project the event belongs to — for a project event, itself. */
  project: ProjectRef | null
  /** The task's assignee, or the project's lead. */
  owner: UserRef | null
  /** Project events only. */
  status: ProjectStatus | null
  progress: number | null
}

export interface CalendarSummary {
  overdue: number
  dueToday: number
  dueThisWeek: number
  /** Open cards carrying no due date at all — the calendar's inbox. */
  unscheduled: number
  projectsDueThisWeek: number
}

interface RangeInput {
  from: Date
  to: Date
  project?: string
  assignee?: string
  mine?: boolean
  includeDone?: boolean
  kinds: CalendarEventKind[]
}

interface Actor {
  id: string
  role: Role
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** A card is "mine" if it is assigned to me, or it is my own unassigned todo. */
const minedBy = (actorId: string) => ({
  $or: [{ assignee: actorId }, { createdBy: actorId, assignee: null }],
})

async function taskEvents(input: RangeInput, actor: Actor): Promise<CalendarEvent[]> {
  const filter: QueryFilter<ITask> = { dueDate: { $gte: input.from, $lt: input.to } }

  if (!input.includeDone) filter.isDone = false
  if (input.project) filter.project = input.project === 'none' ? null : input.project
  if (input.assignee) filter.assignee = input.assignee === 'none' ? null : input.assignee
  if (input.mine) filter.$and = [minedBy(actor.id)]

  const tasks = await Task.find(filter)
    .populate([
      { path: 'project', select: 'name key' },
      { path: 'assignee', select: USER_REF_FIELDS },
    ])
    .sort({ dueDate: 1, priorityWeight: -1 })
    .limit(MAX_TASKS)

  return tasks.map((task) => ({
    id: `TASK:${String(task._id)}`,
    kind: 'TASK' as const,
    sourceId: String(task._id),
    title: task.title,
    date: task.dueDate!,
    isDone: task.isDone ?? false,
    priority: task.priority,
    reference: task.reference ?? null,
    project: toProjectRef(task.project),
    owner: toUserRef(task.assignee),
    status: null,
    progress: null,
  }))
}

async function projectEvents(input: RangeInput, actor: Actor): Promise<CalendarEvent[]> {
  const wantsStart = input.kinds.includes('PROJECT_START')
  const wantsDue = input.kinds.includes('PROJECT_DUE')
  if (!wantsStart && !wantsDue) return []
  // "No project" is a task-only notion, so that filter hides this layer entirely.
  if (input.project === 'none') return []

  const inRange = { $gte: input.from, $lt: input.to }
  // Only the milestones actually being drawn should pull a project in.
  const dateClauses = [
    ...(wantsStart ? [{ startDate: inRange }] : []),
    ...(wantsDue ? [{ dueDate: inRange }] : []),
  ]

  // Every clause below brings its own $or, so they are collected and $and-ed.
  const and: QueryFilter<IProject>[] = [{ $or: dateClauses }]

  if (input.mine) and.push({ $or: [{ lead: actor.id }, { members: actor.id }] })

  const filter: QueryFilter<IProject> = { $and: and }
  if (input.project) filter._id = input.project
  if (!input.includeDone) filter.status = { $ne: 'ARCHIVED' }

  const projects = await Project.find(filter)
    .populate([{ path: 'lead', select: USER_REF_FIELDS }])
    .sort({ dueDate: 1 })
    .limit(MAX_PROJECTS)

  const events: CalendarEvent[] = []

  for (const project of projects) {
    const settled = SETTLED_PROJECT_STATUSES.includes(project.status)
    const base = {
      sourceId: String(project._id),
      title: project.name,
      isDone: settled,
      priority: project.priority,
      reference: project.key,
      project: { id: String(project._id), name: project.name, key: project.key },
      owner: toUserRef(project.lead),
      status: project.status,
      progress: project.progress ?? 0,
    }

    const within = (value?: Date | null) =>
      !!value && value >= input.from && value < input.to

    if (wantsStart && within(project.startDate)) {
      events.push({ ...base, id: `PROJECT_START:${base.sourceId}`, kind: 'PROJECT_START', date: project.startDate! })
    }
    if (wantsDue && within(project.dueDate)) {
      events.push({ ...base, id: `PROJECT_DUE:${base.sourceId}`, kind: 'PROJECT_DUE', date: project.dueDate! })
    }
  }

  return events
}

async function events(input: RangeInput, actor: Actor) {
  const [tasks, projects] = await Promise.all([
    input.kinds.includes('TASK') ? taskEvents(input, actor) : Promise.resolve([]),
    projectEvents(input, actor),
  ])

  // One stream, chronological, so every view can slice it without re-sorting.
  const merged = [...tasks, ...projects].sort((a, b) => a.date.getTime() - b.date.getTime())
  return { events: merged }
}

/**
 * Counts for the header tiles. These are workspace-wide, like the task board's
 * own tiles, so they read the same whichever scope the calendar is filtered to.
 */
async function summary(): Promise<CalendarSummary> {
  const today = startOfToday()
  const weekEnd = addDays(today, 7)

  const [overdue, dueToday, dueThisWeek, unscheduled, projectsDueThisWeek] = await Promise.all([
    Task.countDocuments({ dueDate: { $ne: null, $lt: today }, isDone: false }),
    Task.countDocuments({ dueDate: { $gte: today, $lt: addDays(today, 1) }, isDone: false }),
    Task.countDocuments({ dueDate: { $gte: today, $lt: weekEnd }, isDone: false }),
    Task.countDocuments({ dueDate: null, isDone: false }),
    Project.countDocuments({
      dueDate: { $gte: today, $lt: weekEnd },
      status: { $nin: SETTLED_PROJECT_STATUSES },
    }),
  ])

  return { overdue, dueToday, dueThisWeek, unscheduled, projectsDueThisWeek }
}

export const calendarService = { events, summary }
