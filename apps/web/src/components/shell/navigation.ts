import type { ComponentType } from 'react';
import type { Permission } from '@xenospace/shared';
import {
  Activity, Bell, Bug, Calendar, Chat, Dashboard, Deploy, Files, Git, Kanban,
  Knowledge, Projects, Reports, Review, Shield, Sprint, Tasks, Team,
  type IconProps,
} from '../icons.jsx';

/**
 * Navigation model.
 *
 * One declarative list drives the rail, the navigator and the command palette.
 * Each entry names the permission that reveals it, so the menu is derived from
 * the same RBAC matrix the API enforces: nobody is shown a link the server would
 * refuse, and adding a permission cannot leave the navigation out of step.
 */

export type NavBadge = 'projects' | 'tasks' | 'notifications' | 'reviews' | 'chat';

export interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<IconProps>;
  permission?: Permission;
  /** Workspace-wide by nature, so shown to a team lead only. */
  adminOnly?: boolean;
  badge?: NavBadge;
  /** Label for a developer, where the page is scoped to their own work. */
  developerLabel?: string;
  /** Also pinned to the icon rail — the few places people jump between all day. */
  rail?: boolean;
}

export interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'workspace',
    title: 'Workspace',
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: Dashboard, rail: true },
      { to: '/projects', label: 'Projects', icon: Projects, developerLabel: 'My Projects', permission: 'project:read', badge: 'projects', rail: true },
      { to: '/tasks', label: 'Tasks', icon: Tasks, developerLabel: 'My Tasks', permission: 'task:read', badge: 'tasks', rail: true },
      { to: '/board', label: 'Kanban Board', icon: Kanban, permission: 'task:read', rail: true },
      { to: '/sprints', label: 'Sprints', icon: Sprint, permission: 'sprint:read' },
    ],
  },
  {
    id: 'activity',
    title: 'Activity',
    items: [
      { to: '/chat', label: 'Team Chat', icon: Chat, permission: 'chat:read', badge: 'chat', rail: true },
      { to: '/notifications', label: 'Notifications', icon: Bell, permission: 'notification:read', badge: 'notifications' },
      { to: '/team', label: 'Team Members', icon: Team, permission: 'member:invite', adminOnly: true, rail: true },
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery',
    items: [
      { to: '/issues', label: 'Issues & Bugs', icon: Bug, permission: 'issue:read' },
      { to: '/code-review', label: 'Code Review', icon: Review, permission: 'review:read', badge: 'reviews' },
      { to: '/repositories', label: 'Git Repositories', icon: Git, permission: 'repo:read' },
      { to: '/deployments', label: 'Deployments', icon: Deploy, permission: 'deploy:read' },
    ],
  },
  {
    id: 'library',
    title: 'Library',
    items: [
      { to: '/knowledge', label: 'Knowledge Base', icon: Knowledge, permission: 'kb:read' },
      { to: '/files', label: 'Files & Docs', icon: Files, permission: 'file:read' },
      { to: '/calendar', label: 'Calendar', icon: Calendar, permission: 'calendar:read', rail: true },
    ],
  },
  {
    id: 'insight',
    title: 'Insight',
    items: [
      { to: '/activity', label: 'Activity', icon: Activity, permission: 'activity:read' },
      { to: '/reports', label: 'Reports & Docs', icon: Reports, permission: 'report:read_all', adminOnly: true },
      { to: '/audit', label: 'Security Audit', icon: Shield, permission: 'audit:read', adminOnly: true },
    ],
  },
];

/** Filters the navigation to what the signed-in role may actually reach. */
export function visibleSections(allows: (permission: Permission) => boolean, isAdmin: boolean): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.adminOnly && !isAdmin) return false;
      if (item.permission && !allows(item.permission)) return false;
      return true;
    }),
  })).filter((section) => section.items.length > 0);
}

export function railItems(allows: (permission: Permission) => boolean, isAdmin: boolean): NavItem[] {
  return visibleSections(allows, isAdmin).flatMap((section) => section.items.filter((item) => item.rail));
}

export function navLabel(item: NavItem, isAdmin: boolean): string {
  return !isAdmin && item.developerLabel ? item.developerLabel : item.label;
}
