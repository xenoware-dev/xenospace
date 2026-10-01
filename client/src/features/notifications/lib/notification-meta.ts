import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import {
  AlarmClock,
  CheckCircle2,
  CircleUser,
  FolderKanban,
  FolderMinus,
  MessageSquare,
  RotateCcw,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'

import type { NotificationType } from '@/types/notification'

/**
 * The icon per event. The sentence itself is written by the server at the
 * moment the event happened, so nothing here has to re-derive what was said.
 */
export const notificationIcons: Record<NotificationType, LucideIcon> = {
  TASK_ASSIGNED: UserPlus,
  TASK_UNASSIGNED: UserMinus,
  TASK_DUE_SOON: AlarmClock,
  TASK_OVERDUE: AlarmClock,
  TASK_COMPLETED: CheckCircle2,
  TASK_REOPENED: RotateCcw,
  PROJECT_MEMBER_ADDED: FolderKanban,
  PROJECT_MEMBER_REMOVED: FolderMinus,
  ARTICLE_COMMENTED: MessageSquare,
  ARTICLE_MENTIONED: CircleUser,
}

/** The few events that are a problem rather than news. */
export const URGENT_NOTIFICATIONS: NotificationType[] = ['TASK_OVERDUE', 'TASK_DUE_SOON']

export function notificationTime(value: string) {
  return `${formatDistanceToNowStrict(parseISO(value))} ago`
}
