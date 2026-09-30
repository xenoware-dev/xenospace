import { AxiosError } from 'axios'
import { ChevronLeft, ChevronRight, Columns3, ListChecks, Rows3, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useDebouncedCallback } from 'use-debounce'

import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { QuickAddTask } from '@/features/tasks/components/QuickAddTask'
import { TaskBoard } from '@/features/tasks/components/TaskBoard'
import { TaskFormDialog } from '@/features/tasks/components/TaskFormDialog'
import { TaskRow } from '@/features/tasks/components/TaskRow'
import {
  dueFilterLabels,
  taskPriorityMeta,
  taskSortLabels,
} from '@/features/tasks/lib/task-meta'
import { projectApi } from '@/services/project.service'
import { taskApi, taskListApi } from '@/services/task.service'
import { userApi } from '@/services/user.service'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { User } from '@/types/auth'
import type { Project } from '@/types/project'
import {
  TASK_PRIORITIES,
  TASK_SORTS,
  type DueFilter,
  type ListTasksParams,
  type Pagination,
  type Task,
  type TaskList,
  type TaskPriority,
  type TaskSort,
  type TaskSummary,
} from '@/types/task'

const ALL = '__all__'
const NO_PROJECT = 'none'
const PAGE_SIZE = 25

export default function TasksPage() {
  const currentUser = useAuthStore((s) => s.user)

  const [view, setView] = useState<'board' | 'list'>('board')
  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const [search, setSearch] = useState('')
  const [listFilter, setListFilter] = useState<string>(ALL)
  const [priority, setPriority] = useState<TaskPriority | typeof ALL>(ALL)
  const [project, setProject] = useState<string>(ALL)
  const [due, setDue] = useState<DueFilter | typeof ALL>(ALL)
  const [sort, setSort] = useState<TaskSort>('recent')
  const [showCompleted, setShowCompleted] = useState(false)
  const [page, setPage] = useState(1)

  const [tasks, setTasks] = useState<Task[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [summary, setSummary] = useState<TaskSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [lists, setLists] = useState<TaskList[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [users, setUsers] = useState<User[]>([])

  const [editing, setEditing] = useState<Task | undefined>(undefined)
  const [draftTitle, setDraftTitle] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  /** Bumped whenever something outside the board changes a card. */
  const [refreshKey, setRefreshKey] = useState(0)

  const failed = (error: unknown, fallback: string) =>
    toast.error(
      error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
    )

  /** Filters shared by both views; the board adds its own paging on top. */
  const sharedParams = useMemo<ListTasksParams>(
    () => ({
      search: search || undefined,
      priority: priority === ALL ? undefined : priority,
      project: project === ALL ? undefined : project,
      due: due === ALL ? undefined : due,
      mine: scope === 'mine' || undefined,
    }),
    [search, priority, project, due, scope]
  )

  const loadSummary = useCallback(() => {
    taskApi
      .summary()
      .then(({ data }) => setSummary(data.summary))
      .catch(() => setSummary(null))
  }, [])

  useEffect(loadSummary, [loadSummary])

  // Anything that changes the board also moves the sidebar badges and the
  // dashboard totals, so the shared workspace payload is refreshed alongside.
  const refreshWorkspace = useWorkspaceStore((s) => s.load)
  const syncCounts = useCallback(() => {
    loadSummary()
    void refreshWorkspace()
  }, [loadSummary, refreshWorkspace])

  const loadLists = useCallback(() => {
    taskListApi
      .list()
      .then(({ data }) => setLists(data.lists))
      .catch(() => setLists([]))
  }, [])

  useEffect(loadLists, [loadLists, refreshKey])

  useEffect(() => {
    projectApi
      .list({ limit: 100, sort: 'name' })
      .then(({ data }) => setProjects(data.projects))
      .catch(() => setProjects([]))
    userApi
      .list({ limit: 100, status: 'active' })
      .then(({ data }) => setUsers(data.users))
      .catch(() => setUsers([]))
  }, [])

  // Only the list view fetches here — the board manages its own columns.
  const loadList = useCallback(() => {
    if (view !== 'list') return
    setIsLoading(true)
    taskApi
      .list({
        ...sharedParams,
        page,
        limit: PAGE_SIZE,
        list: listFilter === ALL ? undefined : listFilter,
        includeDone: showCompleted || undefined,
        sort,
      })
      .then(({ data }) => {
        setTasks(data.tasks)
        setPagination(data.pagination)
      })
      .catch((error: unknown) => failed(error, 'Unable to load tasks'))
      .finally(() => setIsLoading(false))
  }, [view, sharedParams, page, listFilter, showCompleted, sort])

  useEffect(loadList, [loadList, refreshKey])

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setPage(1)
    setSearch(value)
  }, 350)

  const replaceTask = (updated: Task) =>
    setTasks((previous) => previous.map((task) => (task.id === updated.id ? updated : task)))

  const defaultListId = listFilter === ALL ? lists[0]?.id : listFilter

  const handleQuickAdd = async (title: string) => {
    try {
      const { data } = await taskApi.create({
        title,
        list: defaultListId,
        // Adding while a project is selected files the task under it.
        project: project === ALL || project === NO_PROJECT ? null : project,
        assignee: scope === 'mine' ? (currentUser?.id ?? null) : null,
      })
      if (view === 'list') setTasks((previous) => [data.task, ...previous])
      else setRefreshKey((key) => key + 1)
      syncCounts()
    } catch (error) {
      failed(error, 'Unable to add that task')
    }
  }

  const moveToList = async (task: Task, listId: string) => {
    if (task.listId === listId) return

    const previous = task
    const target = lists.find((item) => item.id === listId)
    replaceTask({ ...task, listId, list: target ? { ...target } : task.list, isDone: !!target?.isDone })
    try {
      const { data } = await taskApi.move(task.id, { list: listId, index: 0 })
      replaceTask(data.task)
      syncCounts()
    } catch (error) {
      replaceTask(previous)
      failed(error, 'Unable to move that task')
    }
  }

  /** The checkbox sends a card to the first completing list, or back out of it. */
  const toggleDone = (task: Task) => {
    const target = task.isDone
      ? lists.find((item) => !item.isDone)
      : lists.find((item) => item.isDone)

    if (!target) {
      toast.error(
        task.isDone
          ? 'Add a list that does not complete cards first'
          : 'Mark a list as completing cards first'
      )
      return
    }
    void moveToList(task, target.id)
  }

  const handleDelete = async (task: Task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    try {
      await taskApi.remove(task.id)
      setTasks((previous) => previous.filter((item) => item.id !== task.id))
      toast.success('Task deleted')
      syncCounts()
    } catch (error) {
      failed(error, 'Unable to delete that task')
    }
  }

  const openCreate = (title: string) => {
    setEditing(undefined)
    setDraftTitle(title)
    setIsFormOpen(true)
  }

  const openEdit = (task: Task) => {
    setEditing(task)
    setDraftTitle('')
    setIsFormOpen(true)
  }

  const hasFilters =
    !!search || listFilter !== ALL || priority !== ALL || project !== ALL || due !== ALL

  // Any change of view replays the shared tab motion, matching route changes.
  const viewKey = `${view}-${scope}-${listFilter}-${priority}-${project}-${due}-${sort}-${page}`

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tasks"
        description="Your board — drag cards between lists, or work through them as a list"
        action={
          <Tabs value={view} onValueChange={(value) => setView(value as 'board' | 'list')}>
            <TabsList>
              <TabsTrigger value="board">
                <Columns3 />
                Board
              </TabsTrigger>
              <TabsTrigger value="list">
                <Rows3 />
                List
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Open" value={summary.open} />
          <StatTile label="Due today" value={summary.dueToday} />
          <StatTile label="Overdue" value={summary.overdue} />
          <StatTile label="On my plate" value={summary.mineOpen} />
        </div>
      )}

      <QuickAddTask
        onAdd={handleQuickAdd}
        onOpenDetails={openCreate}
        placeholder={
          scope === 'mine'
            ? 'Add a task for yourself and press Enter...'
            : 'Add a task and press Enter...'
        }
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={scope}
          onValueChange={(value) => {
            setPage(1)
            setScope(value as 'all' | 'mine')
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All tasks</TabsTrigger>
            <TabsTrigger value="mine">My tasks</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search tasks..."
            className="pl-8"
            onChange={(e) => debouncedSetSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Select
            value={project}
            onValueChange={(value) => {
              setPage(1)
              setProject(value)
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              <SelectItem value={NO_PROJECT}>No project</SelectItem>
              {projects.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {view === 'list' && (
            <Select
              value={listFilter}
              onValueChange={(value) => {
                setPage(1)
                setListFilter(value)
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="List" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All lists</SelectItem>
                {lists.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select
            value={priority}
            onValueChange={(value) => {
              setPage(1)
              setPriority(value as TaskPriority | typeof ALL)
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All priorities</SelectItem>
              {TASK_PRIORITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {taskPriorityMeta[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={due}
            onValueChange={(value) => {
              setPage(1)
              setDue(value as DueFilter | typeof ALL)
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Due" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any due date</SelectItem>
              {(Object.keys(dueFilterLabels) as DueFilter[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {dueFilterLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {view === 'list' && (
            <Select value={sort} onValueChange={(value) => setSort(value as TaskSort)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {TASK_SORTS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {taskSortLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {view === 'board' ? (
        <TaskBoard
          key={`${scope}-${project}-${priority}-${due}-${search}`}
          params={sharedParams}
          refreshKey={refreshKey}
          onEditCard={openEdit}
          onChanged={syncCounts}
          quickAddDefaults={{
            project: project === ALL || project === NO_PROJECT ? null : project,
            assignee: scope === 'mine' ? (currentUser?.id ?? null) : null,
          }}
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Switch
              id="show-completed"
              checked={showCompleted}
              onCheckedChange={(checked) => {
                setPage(1)
                setShowCompleted(checked)
              }}
            />
            <Label htmlFor="show-completed" className="text-muted-foreground text-sm">
              Show completed
            </Label>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : tasks.length === 0 ? (
            <Card variant="elevated">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <span className="glass-tile flex size-12 items-center justify-center rounded-full">
                  <ListChecks className="text-muted-foreground size-6" />
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {hasFilters ? 'Nothing matches those filters' : 'Nothing on the list'}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {hasFilters
                      ? 'Try clearing a filter to see more.'
                      : 'Add your first task with the box above.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card key={viewKey} className="animate-tab-enter py-3">
              <CardContent className="flex flex-col px-3">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    lists={lists}
                    onToggleDone={toggleDone}
                    onMoveToList={moveToList}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {pagination && pagination.pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="icon"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
              >
                <ChevronLeft />
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                variant="outline"
                size="icon"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                <ChevronRight />
              </Button>
            </div>
          )}
        </>
      )}

      <TaskFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        task={editing}
        initialTitle={draftTitle}
        defaultListId={defaultListId}
        defaultProjectId={project === ALL || project === NO_PROJECT ? undefined : project}
        defaultAssigneeId={scope === 'mine' ? currentUser?.id : undefined}
        lists={lists}
        projects={projects}
        users={users}
        onSaved={(task) => {
          if (view === 'list') {
            if (editing) replaceTask(task)
            else setTasks((previous) => [task, ...previous])
          } else {
            setRefreshKey((key) => key + 1)
          }
          syncCounts()
        }}
      />
    </div>
  )
}
