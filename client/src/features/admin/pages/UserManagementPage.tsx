import { AxiosError } from 'axios'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useDebouncedCallback } from 'use-debounce'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { formatRole, getInitials } from '@/lib/format'
import { userApi } from '@/services/user.service'
import { useAuthStore } from '@/store/auth.store'
import { ADMIN_ROLES, ROLES, type Role, type User } from '@/types/auth'
import type { Pagination } from '@/types/team'
import { PageHeader } from '@/components/common/PageHeader'

export default function UserManagementPage() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers] = useState<User[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN'
  const assignableRoles = isSuperAdmin ? ROLES : ROLES.filter((r) => !ADMIN_ROLES.includes(r))

  const load = () => {
    setIsLoading(true)
    userApi
      .list({ page, limit: 15, search: search || undefined })
      .then(({ data }) => {
        setUsers(data.users)
        setPagination(data.pagination)
      })
      .catch(() => toast.error('Unable to load users'))
      .finally(() => setIsLoading(false))
  }

  useEffect(load, [page, search])

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setPage(1)
    setSearch(value)
  }, 350)

  const handleRoleChange = async (userId: string, role: Role) => {
    try {
      const { data } = await userApi.updateRole(userId, role)
      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)))
      toast.success('Role updated')
    } catch (error) {
      const message =
        error instanceof AxiosError
          ? (error.response?.data?.message ?? 'Unable to update role')
          : 'Unable to update role'
      toast.error(message)
    }
  }

  const handleStatusToggle = async (userId: string, isActive: boolean) => {
    try {
      const { data } = await userApi.updateStatus(userId, isActive)
      setUsers((prev) => prev.map((u) => (u.id === userId ? data.user : u)))
      toast.success(isActive ? 'Account activated' : 'Account deactivated')
    } catch (error) {
      const message =
        error instanceof AxiosError
          ? (error.response?.data?.message ?? 'Unable to update status')
          : 'Unable to update status'
      toast.error(message)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="User Management" description="Manage roles and account status" />

      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search users..."
          className="pl-8"
          onChange={(e) => debouncedSetSearch(e.target.value)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-md" />
            ))
          ) : users.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">No users found.</p>
          ) : (
            users.map((user) => {
              const isSelf = user.id === currentUser?.id
              const isTargetAdmin = ADMIN_ROLES.includes(user.role)
              const disabled = isSelf || (isTargetAdmin && !isSuperAdmin)

              return (
                <div
                  key={user.id}
                  className="flex flex-col gap-3 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-9 shrink-0">
                      <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
                      <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {user.name} {isSelf && <span className="text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">{user.email}</p>
                    </div>
                    {!user.isActive && <Badge variant="destructive">Inactive</Badge>}
                  </div>

                  <div className="flex items-center gap-3">
                    <Select
                      value={user.role}
                      disabled={disabled}
                      onValueChange={(value) => handleRoleChange(user.id, value as Role)}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {assignableRoles.includes(user.role) ? null : (
                          <SelectItem value={user.role} disabled>
                            {formatRole(user.role)}
                          </SelectItem>
                        )}
                        {assignableRoles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {formatRole(role)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={user.isActive}
                        disabled={disabled}
                        onCheckedChange={(checked) => handleStatusToggle(user.id, checked)}
                      />
                      <span className="text-muted-foreground w-14 text-xs">
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

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
