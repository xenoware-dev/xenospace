import { AxiosError } from 'axios'
import { ArrowLeft, Calendar, Mail, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRole, getInitials } from '@/lib/format'
import { userApi } from '@/services/user.service'
import type { User } from '@/types/auth'

const presenceLabel: Record<string, string> = {
  ONLINE: 'Online',
  AWAY: 'Away',
  BUSY: 'Busy',
  OFFLINE: 'Offline',
}

export default function TeamMemberPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [member, setMember] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setIsLoading(true)
    userApi
      .get(id)
      .then(({ data }) => setMember(data.user))
      .catch((err: unknown) => {
        const message =
          err instanceof AxiosError ? (err.response?.data?.message ?? 'User not found') : 'User not found'
        setError(message)
      })
      .finally(() => setIsLoading(false))
  }, [id])

  if (isLoading) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    )
  }

  if (error || !member) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-muted-foreground text-sm">{error ?? 'User not found'}</p>
        <Button variant="outline" onClick={() => navigate('/team')}>
          <ArrowLeft /> Back to team
        </Button>
      </div>
    )
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Link
        to="/team"
        className="text-muted-foreground flex w-fit items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" /> Back to team
      </Link>

      <Card>
        <CardContent className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Avatar className="size-20">
            <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
            <AvatarFallback className="text-lg">{getInitials(member.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{member.name}</h1>
            <p className="text-muted-foreground text-sm">@{member.username}</p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
              <Badge>{formatRole(member.role)}</Badge>
              {member.department && <Badge variant="outline">{member.department.name}</Badge>}
              <Badge variant="secondary">{presenceLabel[member.presenceStatus]}</Badge>
              {!member.isActive && <Badge variant="destructive">Inactive</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      {member.bio && (
        <Card>
          <CardContent>
            <p className="text-sm leading-relaxed">{member.bio}</p>
          </CardContent>
        </Card>
      )}

      {member.skills.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap gap-2">
            {member.skills.map((skill) => (
              <Badge key={skill} variant="outline">
                {skill}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center gap-3">
            <Mail className="text-muted-foreground size-4" />
            <span>{member.email}</span>
          </div>
          {member.phone && (
            <>
              <Separator />
              <div className="flex items-center gap-3">
                <Phone className="text-muted-foreground size-4" />
                <span>{member.phone}</span>
              </div>
            </>
          )}
          <Separator />
          <div className="flex items-center gap-3">
            <Calendar className="text-muted-foreground size-4" />
            <span>Joined {new Date(member.createdAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
