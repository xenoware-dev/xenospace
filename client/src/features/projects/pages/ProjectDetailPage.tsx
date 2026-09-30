import { AxiosError } from 'axios'
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  Crown,
  Pencil,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProjectFormDialog } from '@/features/projects/components/ProjectFormDialog'
import {
  dueLabel,
  formatDate,
  isOverdue,
  priorityMeta,
  statusMeta,
} from '@/features/projects/lib/project-meta'
import { formatRole, getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { departmentApi } from '@/services/department.service'
import { projectApi } from '@/services/project.service'
import { userApi } from '@/services/user.service'
import { useAuthStore } from '@/store/auth.store'
import type { User } from '@/types/auth'
import type { Department } from '@/types/team'
import type { Project, ProjectUserRef } from '@/types/project'

function errorMessage(error: unknown, fallback: string) {
  return error instanceof AxiosError
    ? (error.response?.data?.message ?? fallback)
    : fallback
}

/** A labelled fact in the details grid. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <div className="text-sm font-medium">{children}</div>
    </div>
  )
}

function MemberRow({
  member,
  isLead,
  canRemove,
  onRemove,
}: {
  member: ProjectUserRef
  isLead: boolean
  canRemove: boolean
  onRemove: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-3 last:border-b-0">
      <Link to={`/team/${member.id}`} className="flex min-w-0 items-center gap-3">
        <Avatar className="size-9 shrink-0">
          <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
          <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            {member.name}
            {isLead && <Crown className="text-warning size-3.5" aria-label="Project lead" />}
          </p>
          <p className="text-muted-foreground truncate text-xs">@{member.username}</p>
        </div>
      </Link>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[11px]">
          {formatRole(member.role)}
        </Badge>
        {canRemove && !isLead && (
          <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${member.name}`}>
            <X className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const currentUser = useAuthStore((s) => s.user)

  const [project, setProject] = useState<Project | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [memberToAdd, setMemberToAdd] = useState('')

  const load = useCallback(() => {
    if (!id) return
    setIsLoading(true)
    projectApi
      .get(id)
      .then(({ data }) => {
        setProject(data.project)
        setCanManage(data.canManage)
      })
      .catch((error: unknown) => {
        if (error instanceof AxiosError && error.response?.status === 404) {
          setNotFound(true)
          return
        }
        toast.error(errorMessage(error, 'Unable to load this project'))
      })
      .finally(() => setIsLoading(false))
  }, [id])

  useEffect(load, [load])

  // The lead select and the add-member picker both need the directory.
  useEffect(() => {
    if (!canManage) return
    userApi
      .list({ limit: 100, status: 'active' })
      .then(({ data }) => setUsers(data.users))
      .catch(() => setUsers([]))
    departmentApi
      .list()
      .then(({ data }) => setDepartments(data.departments))
      .catch(() => setDepartments([]))
  }, [canManage])

  const addableUsers = useMemo(() => {
    if (!project) return []
    const existing = new Set(project.members.map((member) => member.id))
    return users.filter((user) => !existing.has(user.id))
  }, [project, users])

  const handleAddMember = async (userId: string) => {
    if (!project) return
    try {
      const { data } = await projectApi.addMember(project.id, userId)
      setProject(data.project)
      setMemberToAdd('')
      toast.success('Member added')
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to add that member'))
    }
  }

  const handleRemoveMember = async (member: ProjectUserRef) => {
    if (!project) return
    try {
      const { data } = await projectApi.removeMember(project.id, member.id)
      setProject(data.project)
      toast.success(`${member.name} removed`)
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to remove that member'))
    }
  }

  const handleDelete = async () => {
    if (!project) return
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return
    try {
      await projectApi.remove(project.id)
      toast.success('Project deleted')
      navigate('/projects')
    } catch (error) {
      toast.error(errorMessage(error, 'Unable to delete this project'))
    }
  }

  if (notFound) {
    return (
      <Card variant="elevated" className="mx-auto max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm font-medium">Project not found</p>
          <p className="text-muted-foreground text-sm">
            It may have been deleted or you followed an old link.
          </p>
          <Button variant="outline" asChild>
            <Link to="/projects">
              <ArrowLeft />
              Back to projects
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (isLoading || !project) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-40 rounded-xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    )
  }

  const status = statusMeta[project.status]
  const priority = priorityMeta[project.priority]
  const due = dueLabel(project.dueDate, project.status)
  const overdue = isOverdue(project.dueDate, project.status)

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit -ml-2" asChild>
        <Link to="/projects">
          <ArrowLeft />
          Projects
        </Link>
      </Button>

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground font-mono text-xs tracking-wider">{project.key}</p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{project.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            <Badge variant={priority.variant}>{priority.label} priority</Badge>
            {project.department && <Badge variant="outline">{project.department.name}</Badge>}
            {due && (
              <span
                className={cn(
                  'flex items-center gap-1.5 text-xs',
                  overdue ? 'text-destructive font-medium' : 'text-muted-foreground'
                )}
              >
                <CalendarClock className="size-3.5" aria-hidden />
                {due}
              </span>
            )}
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Pencil />
              Edit
            </Button>
            <Button variant="outline" onClick={handleDelete} aria-label="Delete project">
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        )}
      </header>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="team">Team ({project.members.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">About</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <p className="text-muted-foreground text-sm whitespace-pre-line">
                  {project.description || 'No description has been added yet.'}
                </p>

                {project.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {project.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[11px]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Fact label="Start date">{formatDate(project.startDate) ?? '—'}</Fact>
                  <Fact label="Due date">{formatDate(project.dueDate) ?? '—'}</Fact>
                  <Fact label="Created">{formatDate(project.createdAt) ?? '—'}</Fact>
                  <Fact label="Last updated">{formatDate(project.updatedAt) ?? '—'}</Fact>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Progress</CardTitle>
                  <CardDescription>{project.progress}% complete</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Progress value={project.progress} />
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <CalendarDays className="size-3.5" aria-hidden />
                    {project.dueDate
                      ? `Target ${formatDate(project.dueDate)}`
                      : 'No target date set'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Project lead</CardTitle>
                </CardHeader>
                <CardContent>
                  {project.lead ? (
                    <Link to={`/team/${project.lead.id}`} className="flex items-center gap-3">
                      <Avatar className="size-10">
                        <AvatarImage
                          src={project.lead.avatarUrl ?? undefined}
                          alt={project.lead.name}
                        />
                        <AvatarFallback>{getInitials(project.lead.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{project.lead.name}</p>
                        <p className="text-muted-foreground truncate text-xs">
                          {formatRole(project.lead.role)}
                        </p>
                      </div>
                    </Link>
                  ) : (
                    <p className="text-muted-foreground text-sm">No lead assigned.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Members</CardTitle>
              <CardDescription>
                {project.members.length} {project.members.length === 1 ? 'person' : 'people'} on
                this project
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {canManage && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select value={memberToAdd} onValueChange={setMemberToAdd}>
                    <SelectTrigger className="sm:w-72">
                      <SelectValue placeholder="Add someone to this project" />
                    </SelectTrigger>
                    <SelectContent>
                      {addableUsers.length === 0 ? (
                        <div className="text-muted-foreground px-2 py-1.5 text-sm">
                          Everyone is already on it
                        </div>
                      ) : (
                        addableUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button disabled={!memberToAdd} onClick={() => handleAddMember(memberToAdd)}>
                    <UserPlus />
                    Add member
                  </Button>
                </div>
              )}

              <div className="flex flex-col">
                {project.members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isLead={member.id === project.lead?.id}
                    canRemove={canManage}
                    onRemove={() => handleRemoveMember(member)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {currentUser && canManage && (
        <ProjectFormDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          project={project}
          users={users}
          departments={departments}
          currentUserId={currentUser.id}
          onSaved={(updated) => setProject(updated)}
        />
      )}
    </div>
  )
}
