import { AxiosError } from 'axios'
import { BellOff, CheckCheck, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageHeader } from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NotificationRow } from '@/features/notifications/components/NotificationRow'
import { notificationApi } from '@/services/notification.service'
import { useNotificationStore } from '@/store/notification.store'
import type { AppNotification } from '@/types/notification'

export default function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([])
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const [isLoading, setIsLoading] = useState(true)

  // The page owns its own list — it is filtered and unpaged differently from
  // the bell — but writes go through the store so the badge stays in step.
  const refreshBell = useNotificationStore((s) => s.fetch)
  const markAllRead = useNotificationStore((s) => s.markAllRead)

  const load = useCallback(() => {
    setIsLoading(true)
    notificationApi
      .list({ filter, limit: 50 })
      .then(({ data }) => setItems(data.items))
      .catch((error: unknown) => {
        const fallback = 'Unable to load your notifications'
        toast.error(
          error instanceof AxiosError ? (error.response?.data?.message ?? fallback) : fallback
        )
      })
      .finally(() => setIsLoading(false))
  }, [filter])

  useEffect(load, [load])

  const onRead = (id: string) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, isRead: true } : item))
    )
    notificationApi
      .markRead(id)
      .then(() => void refreshBell())
      .catch(() => load())
  }

  const onRemove = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
    notificationApi
      .remove(id)
      .then(() => void refreshBell())
      .catch(() => load())
  }

  const onClearRead = () => {
    if (!window.confirm('Remove every notification you have already read?')) return

    notificationApi
      .clearRead()
      .then(({ data, message }) => {
        toast.success(data.deleted ? message : 'Nothing to clear')
        void refreshBell()
        load()
      })
      .catch(() => toast.error('Unable to clear your notifications'))
  }

  const unread = items.filter((item) => !item.isRead).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Work assigned to you, due dates coming up, and what the team finished"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!unread}
              onClick={() => {
                void markAllRead()
                setItems((current) => current.map((item) => ({ ...item, isRead: true })))
              }}
            >
              <CheckCheck />
              Mark all read
            </Button>
            <Button variant="outline" onClick={onClearRead}>
              <Trash2 />
              Clear read
            </Button>
          </div>
        }
      />

      <Tabs value={filter} onValueChange={(value) => setFilter(value as 'all' | 'unread')}>
        <TabsList>
          <TabsTrigger value="all">Everything</TabsTrigger>
          <TabsTrigger value="unread">Unread</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-[4.5rem] rounded-2xl" />
          ))}
        </div>
      ) : items.length ? (
        <div key={filter} className="animate-tab-enter flex flex-col gap-2">
          {items.map((notification) => (
            <NotificationRow
              key={notification.id}
              notification={notification}
              onRead={onRead}
              onRemove={onRemove}
            />
          ))}
        </div>
      ) : (
        <Card variant="elevated">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BellOff className="text-muted-foreground size-8" aria-hidden />
            <p className="font-medium">
              {filter === 'unread' ? 'You are all caught up' : 'Nothing here yet'}
            </p>
            <p className="text-muted-foreground max-w-sm text-sm">
              When someone assigns you a task or adds you to a project, it lands here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
