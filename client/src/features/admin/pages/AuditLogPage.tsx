import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldAlert,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useDebouncedCallback } from 'use-debounce'

import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { softSurface } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionCard } from '@/features/admin/components/SectionCard'
import { formatFileDate, relativeDate } from '@/features/files/lib/file-meta'
import { formatRole } from '@/lib/format'
import { cn } from '@/lib/utils'
import { adminApi } from '@/services/admin.service'
import { AUDIT_ACTIONS, type AuditAction, type AuditEntry, type AuditLogPage as AuditLogData } from '@/types/admin'

/** Icon and sentence-case label per action, so the filter and the rows agree. */
const actionMeta: Record<AuditAction, { label: string; icon: typeof UserPlus }> = {
  USER_ROLE_CHANGED: { label: 'Role changed', icon: ShieldAlert },
  USER_ACTIVATED: { label: 'Account activated', icon: UserCheck },
  USER_DEACTIVATED: { label: 'Account deactivated', icon: UserX },
  USER_REGISTERED: { label: 'Account created', icon: UserPlus },
  DEPARTMENT_CREATED: { label: 'Department created', icon: Building2 },
  DEPARTMENT_UPDATED: { label: 'Department updated', icon: Building2 },
  DEPARTMENT_DELETED: { label: 'Department deleted', icon: Building2 },
}

const ALL = 'all'

/**
 * One entry. The severity shows as a hairline down the left edge rather than a
 * tinted row — the log is read as a column of sentences, and a filled background
 * on every other row would fight that.
 */
function LogRow({ entry }: { entry: AuditEntry }) {
  const meta = actionMeta[entry.action]
  const Icon = meta.icon

  const edgeTone =
    entry.severity === 'ALERT'
      ? 'bg-destructive'
      : entry.severity === 'NOTICE'
        ? 'bg-warning'
        : 'bg-border'

  return (
    <li className="hover:bg-glass-tile relative flex gap-3 rounded-2xl py-3 pr-3 pl-4 transition-colors duration-[var(--motion-control)] ease-[var(--ease-glass)]">
      <span
        aria-hidden
        className={cn('absolute top-4 bottom-4 left-0 w-0.5 rounded-full', edgeTone)}
      />

      <span className="glass-tile mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl">
        <Icon className="text-muted-foreground size-3.5" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm leading-snug">{entry.summary}</p>

        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <span>
            {entry.actorName}
            <span className="text-muted-foreground/70"> · {formatRole(entry.actorRole)}</span>
          </span>
          <span aria-hidden>·</span>
          <time dateTime={entry.createdAt} title={formatFileDate(entry.createdAt)}>
            {relativeDate(entry.createdAt)}
          </time>
          {entry.ip && (
            <>
              <span aria-hidden>·</span>
              <span className="font-mono text-[11px]">{entry.ip}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <Badge variant="outline" className="rounded-full text-[11px] whitespace-nowrap">
          {meta.label}
        </Badge>
        {entry.before && entry.after && entry.before !== entry.after && (
          <span className="text-muted-foreground text-[11px] whitespace-nowrap">
            {/* Only a role change holds enum constants either side; a rename
                holds names, which must not be pushed through formatRole. */}
            {entry.action === 'USER_ROLE_CHANGED'
              ? `${formatRole(entry.before)} → ${formatRole(entry.after)}`
              : `${entry.before} → ${entry.after}`}
          </span>
        )}
      </div>
    </li>
  )
}

export default function AuditLogPage() {
  const [data, setData] = useState<AuditLogData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<string>(ALL)
  const [actor, setActor] = useState<string>(ALL)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setIsLoading(true)
    adminApi
      .auditLog({
        page,
        limit: 25,
        action: action === ALL ? undefined : (action as AuditAction),
        actor: actor === ALL ? undefined : actor,
        search: search || undefined,
      })
      .then(({ data }) => setData(data))
      .catch(() => toast.error('Unable to load the audit log'))
      .finally(() => setIsLoading(false))
  }, [page, action, actor, search])

  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setPage(1)
    setSearch(value)
  }, 350)

  const summary = data?.summary
  const isFiltered = action !== ALL || actor !== ALL || search !== ''

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Audit Logs"
        description={
          summary?.oldestEntryAt
            ? `Every governing act on this workspace, back to ${relativeDate(summary.oldestEntryAt)}.`
            : 'Every governing act on this workspace — role changes, account status and department structure.'
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Entries recorded" value={summary?.total ?? 0} />
        <StatTile label="Privilege changes" value={summary?.alerts ?? 0} />
        <StatTile label="People who acted" value={summary?.distinctActors ?? 0} />
        <StatTile label="Days retained" value={365} />
      </div>

      <SectionCard
        title="Activity"
        description={
          data
            ? `${data.pagination.total} ${data.pagination.total === 1 ? 'entry' : 'entries'}${isFiltered ? ' matching the filter' : ''}`
            : 'Loading'
        }
        action={
          isFiltered ? (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full px-3"
              onClick={() => {
                setAction(ALL)
                setActor(ALL)
                setSearch('')
                setPage(1)
              }}
            >
              Clear filters
            </Button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search the log…"
              defaultValue={search}
              className="pl-8"
              onChange={(e) => debouncedSetSearch(e.target.value)}
            />
          </div>

          <Select
            value={action}
            onValueChange={(value) => {
              setPage(1)
              setAction(value)
            }}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Any action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any action</SelectItem>
              {AUDIT_ACTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {actionMeta[value].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={actor}
            onValueChange={(value) => {
              setPage(1)
              setActor(value)
            }}
          >
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue placeholder="Anyone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Anyone</SelectItem>
              {(data?.actors ?? []).map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name} ({person.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading && !data ? (
          <ul className="flex flex-col gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
          </ul>
        ) : !data || data.entries.length === 0 ? (
          <div className={cn(softSurface, 'flex flex-col items-center gap-1.5 p-10 text-center')}>
            <p className="text-sm font-medium">
              {isFiltered ? 'Nothing matches this filter' : 'Nothing has been logged yet'}
            </p>
            <p className="text-muted-foreground max-w-sm text-xs">
              {isFiltered
                ? 'Try a wider action or a different person.'
                : 'Changing a role, deactivating an account or editing a department will each leave an entry here.'}
            </p>
          </div>
        ) : (
          // Keyed on the filter so a new result set replays the view motion
          // instead of swapping rows underneath a stationary list.
          <ul
            key={`${action}-${actor}-${search}-${page}`}
            className="animate-tab-enter -mx-1 flex flex-col gap-0.5"
            aria-busy={isLoading}
          >
            {data.entries.map((entry) => (
              <LogRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}

        {data && data.pagination.pages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft />
            </Button>
            <span className="text-muted-foreground text-sm tabular-nums">
              Page {data.pagination.page} of {data.pagination.pages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              disabled={page >= data.pagination.pages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </SectionCard>
    </div>
  )
}
