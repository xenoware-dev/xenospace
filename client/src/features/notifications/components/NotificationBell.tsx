import { Bell, CheckCheck } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { NotificationRow } from '@/features/notifications/components/NotificationRow'
import { useNotificationStore } from '@/store/notification.store'

/**
 * The bell. Its contents arrive over the socket, so the count is live rather
 * than polled — the one fetch on mount is only there to fill in whatever
 * happened while this tab was closed.
 */
export function NotificationBell() {
  const { items, unread, isLoading, fetch, subscribe, markRead, markAllRead, remove } =
    useNotificationStore()

  useEffect(() => {
    void fetch()
    subscribe()
  }, [fetch, subscribe])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell className="size-[18px]" />
          {unread > 0 && (
            <span className="bg-destructive text-destructive-foreground ring-card absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-semibold ring-2">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <p className="text-sm font-semibold">
            Notifications
            {unread > 0 && <span className="text-muted-foreground font-normal"> · {unread} new</span>}
          </p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void markAllRead()}>
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <Separator />

        <div className="scrollbar-slim max-h-[22rem] overflow-y-auto p-1.5">
          {isLoading && !items.length ? (
            <div className="flex flex-col gap-1.5 p-1">
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </div>
          ) : items.length ? (
            items.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onRead={(id) => void markRead(id)}
                onRemove={(id) => void remove(id)}
                compact
              />
            ))
          ) : (
            <p className="text-muted-foreground px-3 py-8 text-center text-sm">
              Nothing yet. Work assigned to you shows up here.
            </p>
          )}
        </div>

        <Separator />

        <Link
          to="/notifications"
          className="hover:bg-glass-tile block px-3 py-2.5 text-center text-xs font-medium transition-colors duration-[var(--motion-control)]"
        >
          See all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
