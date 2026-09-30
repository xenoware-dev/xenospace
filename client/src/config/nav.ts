import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  Bell,
  Calendar,
  Clock,
  FileText,
  FolderKanban,
  FolderOpen,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  MessagesSquare,
  ScrollText,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  User,
  Users,
} from 'lucide-react'

import type { Role } from '@/types/auth'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  /** Optional trailing count shown on the right edge of the navigator row. */
  count?: number
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/** Icons on the far-left rail: the few places people jump between all day. */
export const railNavItems: NavItem[] = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Forum', url: '/forum', icon: MessagesSquare },
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
      { title: 'Forum', url: '/forum', icon: MessagesSquare, count: 6 },
      { title: 'Projects', url: '/projects', icon: FolderKanban, count: 8 },
      { title: 'Tasks', url: '/tasks', icon: ListTodo, count: 12 },
    ],
  },
  {
    label: 'Activity',
    items: [
      { title: 'Messages', url: '/messages', icon: MessageSquare, count: 4 },
      { title: 'Notifications', url: '/notifications', icon: Bell, count: 3 },
      { title: 'Team', url: '/team', icon: Users },
    ],
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

export interface WorkspaceNode {
  name: string
  count: number
  children?: WorkspaceNode[]
}

/** Placeholder workspace tree until the projects API lands. */
export const workspaceTree: WorkspaceNode[] = [
  {
    name: 'Client Delivery',
    count: 12,
    children: [
      { name: 'Placement App', count: 4 },
      { name: 'Student Portal', count: 3 },
      { name: 'Xenobots', count: 5 },
    ],
  },
  {
    name: 'Internal',
    count: 7,
    children: [
      { name: 'Design System', count: 4 },
      { name: 'Hiring Process', count: 3 },
    ],
  },
  { name: 'Operations', count: 5 },
]

export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN']
