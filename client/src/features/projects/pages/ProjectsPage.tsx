import { AxiosError } from 'axios'
import { ChevronLeft, ChevronRight, FolderKanban, Plus, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useDebouncedCallback } from 'use-debounce'

import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProjectCard } from '@/features/projects/components/ProjectCard'
import { ProjectFormDialog } from '@/features/projects/components/ProjectFormDialog'
import {
  priorityMeta,
  sortLabels,
  statusMeta,
} from '@/features/projects/lib/project-meta'
import { departmentApi } from '@/services/department.service'
import { projectApi } from '@/services/project.service'
import { userApi } from '@/services/user.service'
import { useAuthStore } from '@/store/auth.store'
import { useWorkspaceStore } from '@/store/workspace.store'
import type { User } from '@/types/auth'
import type { Department } from '@/types/team'
import {
  PROJECT_MANAGER_ROLES,
  PROJECT_PRIORITIES,
  PROJECT_SORTS,
  PROJECT_STATUSES,
  type Pagination,
  type Project,
  type ProjectPriority,
  type ProjectSort,
  type ProjectStatus,
  type ProjectSummary,
} from '@/types/project'

const ALL = '__all__'
const PAGE_SIZE = 9

export default function ProjectsPage() {
  const currentUser = useAuthStore((s) => s.user)
  const canCreate = !!currentUser && PROJECT_MANAGER_ROLES.includes(currentUser.role)

  const [projects, setProjects] = useState<Project[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [summary, setSummary] = useState<ProjectSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [scope, setScope] = useState<'all' | 'mine'>('all')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<ProjectStatus | typeof ALL>(ALL)
  const [priority, setPriority] = useState<ProjectPriority | typeof ALL>(ALL)
  const [sort, setSort] = useState<ProjectSort>('recent')
  const [page, setPage] = useState(1)

  // Only needed by the create/edit dialog, so they load once alongside the list.
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isFormOpen, setIsFormOpen] = useState(false)

  const load = useCallback(() => {
    setIsLoading(true)
    projectApi
      .list({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        status: status === ALL ? undefined : status,
        priority: priority === ALL ? undefined : priority,
        mine: scope === 'mine' || undefined,
        sort,
        includeArchived: status === 'ARCHIVED' || undefined,
      })
      .then(({ data }) => {
        setProjects(data.projects)
        setPagination(data.pagination)
      })
      .catch((error: unknown) => {
        const message =
          error instanceof AxiosError
            ? (error.response?.data?.message ?? 'Unable to load projects')
            : 'Unable to load projects'
        toast.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [page, search, status, priority, scope, sort])

  useEffect(load, [load])

  const loadSummary = useCallback(() => {
    projectApi
      .summary()
      .then(({ data }) => setSummary(data.summary))
      .catch(() => setSummary(null))
  }, [])

  useEffect(loadSummary, [loadSummary])

  useEffect(() => {
    if (!canCreate) return
    userApi
      .list({ limit: 100, status: 'active' })
      .then(({ data }) => setUsers(data.users))
      .catch(() => setUsers([]))
    departmentApi
      .list()
      .then(({ data }) => setDepartments(data.departments))
      .catch(() => setDepartments([]))
  }, [canCreate])

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setPage(1)
    setSearch(value)
  }, 350)

  // Any change of view replays the shared tab motion, matching route changes.
  const viewKey = useMemo(
    () => `${scope}-${status}-${priority}-${sort}-${page}`,
    [scope, status, priority, sort, page]
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description="Everything Xenoware is building, and who is on it"
        action={
          canCreate && (
            <Button onClick={() => setIsFormOpen(true)}>
              <Plus />
              New project
            </Button>
          )
        }
      />

      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="All projects" value={summary.total} />
          <StatTile label="Active" value={summary.active} />
          <StatTile label="Overdue" value={summary.overdue} />
          <StatTile label="Mine" value={summary.mine} />
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={scope}
          onValueChange={(value) => {
            setPage(1)
            setScope(value as 'all' | 'mine')
          }}
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="mine">My projects</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search projects by name, key or tag..."
            className="pl-8"
            onChange={(e) => debouncedSetSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Select
            value={status}
            onValueChange={(value) => {
              setPage(1)
              setStatus(value as ProjectStatus | typeof ALL)
            }}
          >
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {PROJECT_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {statusMeta[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={priority}
            onValueChange={(value) => {
              setPage(1)
              setPriority(value as ProjectPriority | typeof ALL)
            }}
          >
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All priorities</SelectItem>
              {PROJECT_PRIORITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {priorityMeta[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(value) => setSort(value as ProjectSort)}>
            <SelectTrigger className="sm:w-48">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              {PROJECT_SORTS.map((value) => (
                <SelectItem key={value} value={value}>
                  {sortLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-2xl" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <Card variant="elevated">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="glass-tile flex size-12 items-center justify-center rounded-full">
              <FolderKanban className="text-muted-foreground size-6" />
            </span>
            <div>
              <p className="text-sm font-medium">No projects here yet</p>
              <p className="text-muted-foreground text-sm">
                {search || status !== ALL || priority !== ALL || scope === 'mine'
                  ? 'Try clearing the filters to see everything.'
                  : canCreate
                    ? 'Create the first project to get the team started.'
                    : 'Projects will appear here once a manager sets them up.'}
              </p>
            </div>
            {canCreate && (
              <Button variant="outline" onClick={() => setIsFormOpen(true)}>
                <Plus />
                New project
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div
          key={viewKey}
          className="animate-tab-enter grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
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

      {currentUser && canCreate && (
        <ProjectFormDialog
          open={isFormOpen}
          onOpenChange={setIsFormOpen}
          users={users}
          departments={departments}
          currentUserId={currentUser.id}
          onSaved={() => {
            load()
            loadSummary()
            // Keeps the sidebar badge and navigator tree in step.
            void useWorkspaceStore.getState().load()
          }}
        />
      )}
    </div>
  )
}
