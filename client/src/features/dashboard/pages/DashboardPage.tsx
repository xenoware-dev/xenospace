import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  FolderKanban,
  ListTodo,
  MessagesSquare,
  Plus,
  Users,
} from 'lucide-react'

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
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/store/auth.store'

const stats = [
  { label: 'Active Projects', value: 8, icon: FolderKanban },
  { label: 'My Tasks', value: 12, icon: ListTodo },
  { label: 'Unread Messages', value: 4, icon: MessagesSquare },
  { label: 'Team Members', value: 24, icon: Users },
]

const activeProjects = [
  { name: 'Placement App', progress: 80 },
  { name: 'Student Portal', progress: 60 },
  { name: 'Xenobots', progress: 40 },
]

const recentDiscussions = [
  { title: 'API Architecture', category: 'Development', replies: 12 },
  { title: 'New Project Proposal', category: 'Ideas', replies: 5 },
  { title: 'Deployment Issue', category: 'Questions', replies: 8 },
]

const upcoming = [
  { title: 'Client Meeting', date: 'Today, 3:00 PM', type: 'Meeting' },
  { title: 'Project Review', date: 'Tomorrow, 11:00 AM', type: 'Meeting' },
  { title: 'Xenobots Deadline', date: 'Fri, Oct 3', type: 'Deadline' },
]

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const firstName = user?.name?.split(' ')[0] ?? 'there'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {getGreeting()}, {firstName}
          </h1>
          <p className="text-muted-foreground text-sm">
            Here&apos;s what&apos;s happening across Xenoware today.
          </p>
        </div>
        <Button size="sm">
          <Plus /> Quick action
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">{stat.label}</p>
                <p className="text-2xl font-semibold">{stat.value}</p>
              </div>
              <span className="bg-muted flex size-10 items-center justify-center rounded-full">
                <stat.icon className="text-muted-foreground size-5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Active Projects</CardTitle>
            <CardDescription>Progress across your current projects</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {activeProjects.map((project) => (
              <div key={project.name} className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{project.name}</span>
                  <span className="text-muted-foreground">{project.progress}%</span>
                </div>
                <Progress value={project.progress} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
            <CardDescription>Meetings and deadlines</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {upcoming.map((item, idx) => (
              <div key={item.title}>
                <div className="flex items-start gap-3">
                  <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
                    <Calendar className="text-muted-foreground size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-xs">{item.date}</p>
                  </div>
                  <Badge variant="outline" className="ml-auto">
                    {item.type}
                  </Badge>
                </div>
                {idx < upcoming.length - 1 && <Separator className="mt-4" />}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Discussions</CardTitle>
              <CardDescription>What the team is talking about</CardDescription>
            </div>
            <Button variant="ghost" size="sm">
              View all <ArrowUpRight />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {recentDiscussions.map((discussion, idx) => (
              <div key={discussion.title}>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium">{discussion.title}</p>
                    <p className="text-muted-foreground text-xs">{discussion.category}</p>
                  </div>
                  <Badge variant="secondary">{discussion.replies} replies</Badge>
                </div>
                {idx < recentDiscussions.length - 1 && <Separator />}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task Completion</CardTitle>
            <CardDescription>Your progress this week</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-6">
            <CheckCircle2 className="text-success size-10" />
            <p className="text-2xl font-semibold">8 / 12 tasks complete</p>
            <Progress value={66} className="w-full max-w-xs" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
