import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ProjectUserRef } from '@/types/project'

interface MemberStackProps {
  members: ProjectUserRef[]
  /** How many faces to show before collapsing the rest into a +N chip. */
  max?: number
  className?: string
}

export function MemberStack({ members, max = 4, className }: MemberStackProps) {
  const shown = members.slice(0, max)
  const overflow = members.length - shown.length

  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {shown.map((member) => (
        <Avatar
          key={member.id}
          className="ring-background size-7 ring-2"
          title={`${member.name} (@${member.username})`}
        >
          <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
          <AvatarFallback className="text-[10px]">{getInitials(member.name)}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <span className="glass-tile text-muted-foreground ring-background flex size-7 items-center justify-center rounded-full text-[10px] font-medium ring-2">
          +{overflow}
        </span>
      )}
    </div>
  )
}
