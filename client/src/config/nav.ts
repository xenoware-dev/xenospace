import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  Calendar,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  MessageSquare,
  MessagesSquare,
  Settings,
  User,
  Users,
} from 'lucide-react'

import type { Role } from '@/types/auth'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
}

export const mainNavItems: NavItem[] = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Forum', url: '/forum', icon: MessagesSquare },
  { title: 'Projects', url: '/projects', icon: FolderKanban },
  { title: 'Tasks', url: '/tasks', icon: ListTodo },
  { title: 'Team', url: '/team', icon: Users },
  { title: 'Messages', url: '/messages', icon: MessageSquare },
  { title: 'Knowledge Base', url: '/knowledge-base', icon: FileText },
  { title: 'Files', url: '/files', icon: FolderKanban },
  { title: 'Calendar', url: '/calendar', icon: Calendar },
  { title: 'Notifications', url: '/notifications', icon: Bell },
]

export const userNavItems: NavItem[] = [
  { title: 'Profile', url: '/profile', icon: User },
  { title: 'Settings', url: '/settings', icon: Settings },
]

export const adminNavItems: NavItem[] = [
  { title: 'Admin Dashboard', url: '/admin', icon: LayoutDashboard },
  { title: 'User Management', url: '/admin/users', icon: Users },
  { title: 'Role Management', url: '/admin/roles', icon: Settings },
  { title: 'Organization Settings', url: '/admin/organization', icon: Settings },
  { title: 'Audit Logs', url: '/admin/audit-logs', icon: FileText },
  { title: 'System Settings', url: '/admin/system', icon: Settings },
]

export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN']
