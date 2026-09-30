import { AxiosError } from 'axios'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDebouncedCallback } from 'use-debounce'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
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
import { formatRole, getInitials } from '@/lib/format'
import { departmentApi } from '@/services/department.service'
import { userApi } from '@/services/user.service'
import { ROLES, type Role, type User } from '@/types/auth'
import type { Department, Pagination } from '@/types/team'
import { PageHeader } from '@/components/common/PageHeader'

const ALL = '__all__'

const presenceColor: Record<string, string> = {
  ONLINE: 'bg-success',
  AWAY: 'bg-warning',
  BUSY: 'bg-destructive',
  OFFLINE: 'bg-muted-foreground/40',
}

export default function TeamDirectoryPage() {
  const [users, setUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [role, setRole] = useState<Role | typeof ALL>(ALL)
  const [department, setDepartment] = useState(ALL)
  const [page, setPage] = useState(1)

  useEffect(() => {
    departmentApi
      .list()
      .then(({ data }) => setDepartments(data.departments))
      .catch(() => setDepartments([]))
  }, [])

  useEffect(() => {
    setIsLoading(true)
    userApi
      .list({
        page,
        limit: 12,
        search: search || undefined,
        role: role === ALL ? undefined : role,
        department: department === ALL ? undefined : department,
      })
      .then(({ data }) => {
        setUsers(data.users)
        setPagination(data.pagination)
      })
      .catch((error: unknown) => {
        const message =
          error instanceof AxiosError
            ? (error.response?.data?.message ?? 'Unable to load team members')
            : 'Unable to load team members'
        console.error(message)
      })
      .finally(() => setIsLoading(false))
  }, [page, search, role, department])

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setPage(1)
    setSearch(value)
  }, 350)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Team" description="Everyone working at Xenoware" />

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search by name, username or email..."
            className="pl-8"
            onChange={(e) => debouncedSetSearch(e.target.value)}
          />
        </div>
        <Select
          value={role}
          onValueChange={(value) => {
            setPage(1)
            setRole(value as Role | typeof ALL)
          }}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All roles</SelectItem>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {formatRole(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={department}
          onValueChange={(value) => {
            setPage(1)
            setDepartment(value)
          }}
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d._id} value={d._id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-10 text-center text-sm">
            No team members match your filters.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((member) => (
            <Link key={member.id} to={`/team/${member.id}`}>
              <Card className="h-full transition-colors hover:bg-accent/50">
                <CardContent className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <Avatar className="size-11">
                      <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                      <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                    </Avatar>
                    <span
                      className={`border-background absolute right-0 bottom-0 size-2.5 rounded-full border-2 ${presenceColor[member.presenceStatus]}`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{member.name}</p>
                    <p className="text-muted-foreground truncate text-xs">@{member.username}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="text-[11px]">
                        {formatRole(member.role)}
                      </Badge>
                      {member.department && (
                        <Badge variant="outline" className="text-[11px]">
                          {member.department.name}
                        </Badge>
                      )}
                      {!member.isActive && (
                        <Badge variant="destructive" className="text-[11px]">
                          Inactive
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
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
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  )
}
