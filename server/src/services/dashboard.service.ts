import { Department } from '@/models/Department.model'
import { Project } from '@/models/Project.model'
import { Task } from '@/models/Task.model'
import type { Role } from '@/types/enums'
import { idOf } from '@/utils/refs'
import { addUtcDays, alignWeekly, recentWeekStarts } from '@/utils/weeks'

interface Actor {
  id: string
  role: Role
}

/** Counts per week for a date field, aligned to `weeks` and zero-filled. */
async function weeklyCounts(field: 'completedAt' | 'createdAt', weeks: Date[]) {
  const rows = await Task.aggregate<{ _id: Date; count: number }>([
    { $match: { [field]: { $ne: null, $gte: weeks[0] } } },
    {
      $group: {
        _id: { $dateTrunc: { date: `$${field}`, unit: 'week', startOfWeek: 'monday' } },
        count: { $sum: 1 },
      },
    },
  ])

  return alignWeekly(rows, weeks)
}

function startOfToday() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export async function overview(actor: Actor) {
  const weeks = recentWeekStarts()
  const windowStart = weeks[0]
  const thisWeekStart = weeks[weeks.length - 1]
  const thisWeekEnd = addUtcDays(thisWeekStart, 7)
  const today = startOfToday()

  /** A task is "mine" if it is assigned to me, or it is my own unassigned todo. */
  const mine = { $or: [{ assignee: actor.id }, { createdBy: actor.id, assignee: null }] }

  const [
    completedWeekly,
    createdWeekly,
    createdBefore,
    completedBefore,
    activeProjects,
    totalProjects,
    openTasks,
    totalTasks,
    doneTasks,
    overdueTasks,
    myOpen,
    myDoneThisWeek,
    dueThisWeekTotal,
    dueThisWeekDone,
    projectRows,
    taskCountRows,
    upcoming,
    recentlyCompleted,
    departments,
  ] = await Promise.all([
    weeklyCounts('completedAt', weeks),
    weeklyCounts('createdAt', weeks),
    Task.countDocuments({ createdAt: { $lt: windowStart } }),
    Task.countDocuments({ completedAt: { $ne: null, $lt: windowStart } }),
    Project.countDocuments({ status: 'ACTIVE' }),
    Project.countDocuments({ status: { $ne: 'ARCHIVED' } }),
    Task.countDocuments({ isDone: false }),
    Task.countDocuments({}),
    Task.countDocuments({ isDone: true }),
    Task.countDocuments({ dueDate: { $ne: null, $lt: today }, isDone: false }),
    Task.countDocuments({ $and: [mine, { isDone: false }] }),
    Task.countDocuments({
      $and: [mine, { completedAt: { $gte: thisWeekStart, $lt: thisWeekEnd } }],
    }),
    Task.countDocuments({ dueDate: { $gte: thisWeekStart, $lt: thisWeekEnd } }),
    Task.countDocuments({
      dueDate: { $gte: thisWeekStart, $lt: thisWeekEnd },
      isDone: true,
    }),
    Project.find({ status: { $ne: 'ARCHIVED' } })
      .populate('lead', 'name')
      .populate('department', 'name')
      .sort({ updatedAt: -1 })
      .limit(6),
    Task.aggregate<{ _id: string | null; count: number }>([
      { $group: { _id: '$project', count: { $sum: 1 } } },
    ]),
    Task.find({ isDone: false, dueDate: { $ne: null, $gte: today } })
      .populate('project', 'name key')
      .sort({ dueDate: 1 })
      .limit(5),
    Task.find({ isDone: true, completedAt: { $ne: null } })
      .populate('project', 'name key')
      .sort({ completedAt: -1 })
      .limit(5),
    Department.find().sort({ name: 1 }),
  ])

  const tasksPerProject = new Map(
    taskCountRows.map((row) => [row._id ? String(row._id) : 'none', row.count])
  )

  // Open tasks at the end of each week: everything created by then, minus
  // everything completed by then. Reconstructed from the two timestamps, since
  // nothing records the open count historically.
  let runningCreated = createdBefore
  let runningCompleted = completedBefore
  const openTasksTrend = weeks.map((_, index) => {
    runningCreated += createdWeekly[index]
    runningCompleted += completedWeekly[index]
    return Math.max(0, runningCreated - runningCompleted)
  })

  const thisWeekCompleted = completedWeekly[completedWeekly.length - 1]
  const lastWeekCompleted = completedWeekly[completedWeekly.length - 2] ?? 0

  // Every project, grouped under its department, for the navigator tree.
  const allProjects = await Project.find({ status: { $ne: 'ARCHIVED' } })
    .select('name department')
    .sort({ name: 1 })

  const tree = departments
    .map((department) => {
      const children = allProjects
        .filter((project) => idOf(project.department) === String(department._id))
        .map((project) => ({
          name: project.name,
          count: tasksPerProject.get(String(project._id)) ?? 0,
          url: `/projects/${String(project._id)}`,
        }))

      return {
        name: department.name,
        count: children.reduce((sum, child) => sum + child.count, 0),
        children,
      }
    })
    .filter((node) => node.children.length > 0)

  const unfiled = allProjects
    .filter((project) => !project.department)
    .map((project) => ({
      name: project.name,
      count: tasksPerProject.get(String(project._id)) ?? 0,
      url: `/projects/${String(project._id)}`,
    }))

  if (unfiled.length > 0) {
    tree.push({
      name: 'No department',
      count: unfiled.reduce((sum, child) => sum + child.count, 0),
      children: unfiled,
    })
  }

  return {
    completion: {
      total: completedWeekly.reduce((sum, count) => sum + count, 0),
      weekly: completedWeekly,
      deltaPercent: percentChange(thisWeekCompleted, lastWeekCompleted),
    },
    thisWeek: {
      yours: { done: myDoneThisWeek, total: myOpen + myDoneThisWeek },
      due: { done: dueThisWeekDone, total: dueThisWeekTotal },
      board: { done: doneTasks, total: totalTasks },
    },
    stats: {
      activeProjects,
      openTasks,
      openTasksTrend,
      overdueTasks,
    },
    projects: projectRows.map((project) => ({
      id: String(project._id),
      name: project.name,
      key: project.key,
      status: project.status,
      progress: project.progress ?? 0,
      leadName:
        project.lead && typeof project.lead === 'object' && 'name' in project.lead
          ? String((project.lead as { name: unknown }).name)
          : null,
      taskCount: tasksPerProject.get(String(project._id)) ?? 0,
    })),
    upcoming: upcoming.map((task) => ({
      id: String(task._id),
      title: task.title,
      dueDate: task.dueDate,
      reference: task.reference ?? null,
      projectName:
        task.project && typeof task.project === 'object' && 'name' in task.project
          ? String((task.project as { name: unknown }).name)
          : null,
    })),
    recentlyCompleted: recentlyCompleted.map((task) => ({
      id: String(task._id),
      title: task.title,
      completedAt: task.completedAt,
      reference: task.reference ?? null,
      projectName:
        task.project && typeof task.project === 'object' && 'name' in task.project
          ? String((task.project as { name: unknown }).name)
          : null,
    })),
    counts: { projects: totalProjects, tasks: openTasks },
    tree,
  }
}

export const dashboardService = { overview }
