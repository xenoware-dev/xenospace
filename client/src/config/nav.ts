import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  Bell,
  Calendar,
  Clock,
  FileText,
  FolderKanban,
  FolderOpen,
  Gauge,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  MessagesSquare,
  ScrollText,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkle,
  Sparkles,
  User,
  Users,
} from 'lucide-react'

import type { Role } from '@/types/auth'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/** Icons on the far-left rail: the few places people jump between all day. */
export const railNavItems: NavItem[] = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'My Work', url: '/my-work', icon: Sparkle },
  { title: 'Projects', url: '/projects', icon: FolderKanban },
  { title: 'Tasks', url: '/tasks', icon: ListTodo },
  { title: 'Messages', url: '/messages', icon: MessageSquare },
  { title: 'Team', url: '/team', icon: Users },
  { title: 'Calendar', url: '/calendar', icon: Calendar },
]

export const mainNavGroups: NavGroup[] = [
  {
    label: 'Workspace',
    items: [
      { title: 'Dashboard', url: '/', icon: LayoutDashboard },
      { title: 'My Work', url: '/my-work', icon: Sparkle },
      { title: 'Projects', url: '/projects', icon: FolderKanban },
      { title: 'Tasks', url: '/tasks', icon: ListTodo },
      { title: 'Forum', url: '/forum', icon: MessagesSquare },
    ],
  },
  {
    label: 'Activity',
    items: [
      { title: 'Messages', url: '/messages', icon: MessageSquare },
      { title: 'Notifications', url: '/notifications', icon: Bell },
      { title: 'Team', url: '/team', icon: Users },
    ],
  },
  {
    label: 'Oversight',
    items: [{ title: 'Team Workload', url: '/workload', icon: Gauge }],
  },
  {
    label: 'Library',
    items: [
      { title: 'Knowledge Base', url: '/knowledge-base', icon: FileText },
      { title: 'Files', url: '/files', icon: FolderOpen },
      { title: 'Calendar', url: '/calendar', icon: Calendar },
    ],
  },
]

export const userNavItems: NavItem[] = [
  { title: 'Profile', url: '/profile', icon: User },
  { title: 'Settings', url: '/settings', icon: Settings },
]

export const adminNavItems: NavItem[] = [
  { title: 'Admin Dashboard', url: '/admin', icon: Sparkles },
  { title: 'User Management', url: '/admin/users', icon: Users },
  { title: 'Role Management', url: '/admin/roles', icon: Shield },
  { title: 'Organization', url: '/admin/organization', icon: SlidersHorizontal },
  { title: 'Audit Logs', url: '/admin/audit-logs', icon: ScrollText },
  { title: 'System Settings', url: '/admin/system', icon: Settings },
]

/** Recent-context shortcuts pinned under the navigator tree. */
export const historyNavItems: NavItem[] = [
  { title: 'Recently Viewed', url: '/files', icon: Clock },
  { title: 'Archive', url: '/files', icon: Archive },
]

export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN']

/**
 * Who sees the Oversight group. Leads need the workload view to assign work,
 * so it reaches further down than the admin area does.
 */
export const OVERSIGHT_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'TEAM_LEAD']

/** Nav groups only some roles should see at all. */
export const ROLE_GATED_GROUPS: Record<string, Role[]> = {
  Oversight: OVERSIGHT_ROLES,
}

/**
 * Nav urls that are a prefix of another nav url, such as `/admin` sitting above
 * `/admin/users`. `NavLink` matches by prefix unless told otherwise, so without
 * this both the parent and the child would be marked `aria-current="page"` —
 * which reads as two active rows and parks the sliding pill on the parent,
 * since the indicator takes the first match in the document.
 */
export const PARENT_NAV_URLS = new Set(
  [...mainNavGroups.flatMap((group) => group.items), ...userNavItems, ...adminNavItems]
    .map((item) => item.url)
    .filter((url, _index, urls) => urls.some((other) => other !== url && other.startsWith(`${url}/`)))
)
