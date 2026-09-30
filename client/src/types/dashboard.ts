import type { ProjectStatus } from '@/types/project'

/** A department or project row in the navigator tree. */
export interface WorkspaceNode {
  name: string
  count: number
  /** Present on leaf rows that navigate somewhere. */
  url?: string
  children?: WorkspaceNode[]
}

export interface Ratio {
  done: number
  total: number
}

export interface DashboardProject {
  id: string
  name: string
  key: string
  status: ProjectStatus
  progress: number
  leadName: string | null
  taskCount: number
}

export interface DashboardTask {
  id: string
  title: string
  reference: string | null
  projectName: string | null
}

export interface UpcomingTask extends DashboardTask {
  dueDate: string
}

export interface CompletedTask extends DashboardTask {
  completedAt: string
}

export interface DashboardOverview {
  completion: {
    /** Tasks completed inside the rolling 12-week window. */
    total: number
    /** Twelve weekly buckets, oldest first. */
    weekly: number[]
    /** This week against last week; null when last week had none to compare. */
    deltaPercent: number | null
  }
  thisWeek: {
    yours: Ratio
    due: Ratio
    board: Ratio
  }
  stats: {
    activeProjects: number
    openTasks: number
    openTasksTrend: number[]
    overdueTasks: number
  }
  projects: DashboardProject[]
  upcoming: UpcomingTask[]
  recentlyCompleted: CompletedTask[]
  counts: {
    projects: number
    tasks: number
  }
  tree: WorkspaceNode[]
}
