import { CalendarClock, Users } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { MemberStack } from '@/features/projects/components/MemberStack'
import { dueLabel, isOverdue, priorityMeta, statusMeta } from '@/features/projects/lib/project-meta'
import { cn } from '@/lib/utils'
import type { Project } from '@/types/project'

export function ProjectCard({ project }: { project: Project }) {
  const status = statusMeta[project.status]
  const priority = priorityMeta[project.priority]
  const due = dueLabel(project.dueDate, project.status)
  const overdue = isOverdue(project.dueDate, project.status)

  return (
    <Link to={`/projects/${project.id}`} className="group rounded-2xl outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px]">
      <Card
        className={cn(
          'h-full gap-4 py-5 transition-all duration-[var(--motion-control)] ease-[var(--ease-glass)]',
          'group-hover:-translate-y-0.5 group-hover:shadow-[var(--glass-shadow)]'
        )}
      >
        <CardContent className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-muted-foreground font-mono text-[11px] tracking-wider">
                {project.key}
              </p>
              <h3 className="truncate text-base font-semibold">{project.name}</h3>
            </div>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>

          <p className="text-muted-foreground line-clamp-2 min-h-[2.5rem] text-sm">
            {project.description || 'No description yet.'}
          </p>

          <div className="flex flex-col gap-1.5">
            <div className="text-muted-foreground flex items-center justify-between text-xs">
              <span>Progress</span>
              <span className="text-foreground font-medium">{project.progress}%</span>
            </div>
            <Progress value={project.progress} />
          </div>

          <div className="mt-auto flex items-end justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge variant={priority.variant} className="text-[11px]">
                  {priority.label}
                </Badge>
                {project.department && (
                  <Badge variant="outline" className="text-[11px]">
                    {project.department.name}
                  </Badge>
                )}
              </div>
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

            {project.members.length > 0 ? (
              <MemberStack members={project.members} />
            ) : (
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Users className="size-3.5" aria-hidden />
                No members
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
