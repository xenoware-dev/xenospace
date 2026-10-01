import { X } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  notificationIcons,
  notificationTime,
  URGENT_NOTIFICATIONS,
} from '@/features/notifications/lib/notification-meta'
import { getInitials } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { AppNotification } from '@/types/notification'

interface NotificationRowProps {
  notification: AppNotification
  onRead: (id: string) => void
  onRemove?: (id: string) => void
  /** The bell's rows are tighter than the page's. */
  compact?: boolean
}

export function NotificationRow({
  notification,
  onRead,
  onRemove,
  compact = false,
}: NotificationRowProps) {
  const Icon = notificationIcons[notification.type]
  const isUrgent = URGENT_NOTIFICATIONS.includes(notification.type)

  return (
    <div
      className={cn(
        'group/notification relative flex items-start gap-3 rounded-xl transition-colors duration-[var(--motion-control)]',
        compact ? 'p-2.5' : 'glass-tile p-3.5',
        !notification.isRead && 'bg-glass-tile'
      )}
    >
      {/* Unread is carried by a marker as well as the weight of the text, so
          it does not depend on noticing a background tint. */}
      {!notification.isRead && (
        <span
          className="bg-data absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full"
          aria-hidden
        />
      )}

      {notification.actor ? (
        <Avatar className="size-8 shrink-0">
          <AvatarImage
            src={notification.actor.avatarUrl ?? undefined}
            alt={notification.actor.name}
          />
          <AvatarFallback className="text-[10px]">
            {getInitials(notification.actor.name)}
          </AvatarFallback>
        </Avatar>
      ) : (
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-full',
            isUrgent ? 'bg-warning/15 text-warning' : 'glass-control text-muted-foreground'
          )}
        >
          <Icon className="size-4" aria-hidden />
        </span>
      )}

      <Link
        to={notification.url}
        onClick={() => onRead(notification.id)}
        className="min-w-0 flex-1 outline-none"
      >
        <p className={cn('text-sm leading-5', !notification.isRead && 'font-medium')}>
          {notification.actor && (
            <span className="font-semibold">{notification.actor.name} </span>
          )}
          <span className={notification.actor ? 'text-muted-foreground' : undefined}>
            {notification.message}
          </span>
        </p>
        <p className="text-muted-foreground/70 mt-0.5 flex items-center gap-1.5 text-[11px]">
          <Icon className="size-3" aria-hidden />
          {notificationTime(notification.createdAt)}
        </p>
      </Link>

      {onRemove && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 opacity-0 transition-opacity duration-[var(--motion-control)] group-hover/notification:opacity-100 group-focus-within/notification:opacity-100"
          onClick={() => onRemove(notification.id)}
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  )
}
