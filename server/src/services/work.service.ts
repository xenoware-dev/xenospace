import { Types } from 'mongoose'

import { Task } from '@/models/Task.model'
import { User } from '@/models/User.model'
import { DUE_SOON_HOURS, WORKLOAD_VIEWER_ROLES, type Role } from '@/types/enums'
import { ApiError } from '@/utils/ApiError'
import { toUserRef, type UserRef } from '@/utils/refs'
import { serializeTask, type SafeTask } from '@/utils/serialize-task'

const USER_REF_FIELDS = 'name username avatarUrl role presenceStatus'

const POPULATE = [
  { path: 'assignee', select: USER_REF_FIELDS },
  { path: 'createdBy', select: USER_REF_FIELDS },
  { path: 'project', select: 'name key' },
  { path: 'list', select: 'name isDone' },
]

interface Actor {
  id: string
  role: Role
}

/** Local midnight, so "today" means the reader's day rather than UTC's. */
function startOfToday() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

function endOfToday() {
  const start = startOfToday()
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)
}

export interface MyWork {
  /** Past due and still open. The only bucket that is a problem. */
  overdue: SafeTask[]
  today: SafeTask[]
  thisWeek: SafeTask[]
  later: SafeTask[]
  /** Assigned but never dated — the backlog people forget they are holding. */
  undated: SafeTask[]
  /** Finished in the last seven days, so the page shows progress, not just debt. */
  recentlyCompleted: SafeTask[]
  counts: {
    open: number
    overdue: number
    dueToday: number
    completedThisWeek: number
  }
}

/**
 * One person's work, across every project, bucketed by when it is due.
 *
 * A board answers "what is in this project"; this answers "what do I do
 * next", which is the question people actually open the app with. The
 * buckets are cut on the server so every surface that shows them — the page,
 * the dashboard, a future digest email — agrees on where a task belongs.
 */
async function myWork(userId: string): Promise<MyWork> {
  const todayStart = startOfToday()
  const todayEnd = endOfToday()
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000)
  const weekAgo = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000)

  const mine = { assignee: userId }

  const [open, completed] = await Promise.all([
    Task.find({ ...mine, isDone: false })
      .populate(POPULATE)
      .sort({ dueDate: 1, priorityWeight: -1, createdAt: 1 }),
    Task.find({ ...mine, isDone: true, completedAt: { $gte: weekAgo } })
      .populate(POPULATE)
      .sort({ completedAt: -1 })
      .limit(20),
  ])

  const buckets: Record<'overdue' | 'today' | 'thisWeek' | 'later' | 'undated', SafeTask[]> = {
    overdue: [],
    today: [],
    thisWeek: [],
    later: [],
    undated: [],
  }

  for (const task of open) {
    const safe = serializeTask(task)
    const due = task.dueDate

    if (!due) buckets.undated.push(safe)
    else if (due < todayStart) buckets.overdue.push(safe)
    else if (due <= todayEnd) buckets.today.push(safe)
    else if (due <= weekEnd) buckets.thisWeek.push(safe)
    else buckets.later.push(safe)
  }

  return {
    ...buckets,
    recentlyCompleted: completed.map(serializeTask),
    counts: {
      open: open.length,
      overdue: buckets.overdue.length,
      dueToday: buckets.today.length,
      completedThisWeek: completed.length,
    },
  }
}

export interface WorkloadRow {
  user: UserRef
  open: number
  overdue: number
  dueSoon: number
  completedThisWeek: number
  /** Open work weighted by priority — a truer read than a flat card count. */
  load: number
}

export interface Workload {
  rows: WorkloadRow[]
  totals: {
    people: number
    open: number
    overdue: number
    unassigned: number
  }
}

/**
 * What everyone is carrying, so work is assigned on evidence rather than on
 * who answered last. `load` weights by priority because four urgent cards and
 * four low ones are not the same week.
 */
async function workload(actor: Actor): Promise<Workload> {
  if (!WORKLOAD_VIEWER_ROLES.includes(actor.role)) {
    throw ApiError.forbidden('You do not have permission to view the team workload')
  }

  const now = new Date()
  const dueSoonBy = new Date(now.getTime() + DUE_SOON_HOURS * 60 * 60 * 1000)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [people, rows, unassigned] = await Promise.all([
    User.find({ isActive: true }).select(USER_REF_FIELDS).sort({ name: 1 }),
    Task.aggregate<{
      _id: Types.ObjectId
      open: number
      overdue: number
      dueSoon: number
      load: number
      completedThisWeek: number
    }>([
      { $match: { assignee: { $ne: null } } },
      {
        $group: {
          _id: '$assignee',
          open: { $sum: { $cond: [{ $eq: ['$isDone', false] }, 1, 0] } },
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$isDone', false] },
                    { $ne: ['$dueDate', null] },
                    { $lt: ['$dueDate', now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          dueSoon: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$isDone', false] },
                    { $ne: ['$dueDate', null] },
                    { $gte: ['$dueDate', now] },
                    { $lte: ['$dueDate', dueSoonBy] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          load: {
            $sum: { $cond: [{ $eq: ['$isDone', false] }, '$priorityWeight', 0] },
          },
          completedThisWeek: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$isDone', true] },
                    { $ne: ['$completedAt', null] },
                    { $gte: ['$completedAt', weekAgo] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
    Task.countDocuments({ assignee: null, isDone: false }),
  ])

  const byUser = new Map(rows.map((row) => [String(row._id), row]))

  // Driven off the roster rather than the aggregate, so somebody with nothing
  // on their plate still appears — which is the whole point of the view.
  const result: WorkloadRow[] = people
    .map((person) => {
      const stats = byUser.get(String(person._id))
      return {
        user: toUserRef(person)!,
        open: stats?.open ?? 0,
        overdue: stats?.overdue ?? 0,
        dueSoon: stats?.dueSoon ?? 0,
        completedThisWeek: stats?.completedThisWeek ?? 0,
        load: stats?.load ?? 0,
      }
    })
    .sort((a, b) => b.load - a.load || a.user.name.localeCompare(b.user.name))

  return {
    rows: result,
    totals: {
      people: result.length,
      open: result.reduce((sum, row) => sum + row.open, 0),
      overdue: result.reduce((sum, row) => sum + row.overdue, 0),
      unassigned,
    },
  }
}

export const workService = { myWork, workload }
