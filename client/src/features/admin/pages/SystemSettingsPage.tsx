import { CircleAlert, CircleCheck, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { softSurface } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionCard } from '@/features/admin/components/SectionCard'
import { formatBytes, relativeDate } from '@/features/files/lib/file-meta'
import { cn } from '@/lib/utils'
import { adminApi } from '@/services/admin.service'
import type { AdminSystem } from '@/types/admin'

/** `98341` → `1d 3h 19m`, so an uptime is read rather than converted. */
function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m ${seconds % 60}s`
}

/** A label and its value, the unit this whole page is built from. */
function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="border-glass-border flex items-baseline justify-between gap-4 border-b py-2.5 last:border-b-0">
      <span className="text-muted-foreground shrink-0 text-sm">{label}</span>
      <span className={cn('truncate text-sm font-medium', mono && 'font-mono text-xs')}>
        {value}
      </span>
    </div>
  )
}

function SystemSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-32 rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

export default function SystemSettingsPage() {
  const [data, setData] = useState<AdminSystem | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = () => {
    setStatus('loading')
    adminApi
      .system()
      .then(({ data }) => {
        setData(data)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }

  useEffect(load, [])

  const header = (
    <PageHeader
      title="System Settings"
      description="How this deployment is configured and how it is holding up. Everything here is read from the running server."
      action={
        <Button
          variant="outline"
          className="rounded-full"
          onClick={load}
          disabled={status === 'loading'}
        >
          <RefreshCw className={cn(status === 'loading' && 'animate-spin')} />
          Refresh
        </Button>
      }
    />
  )

  if (!data) {
    return (
      <div className="flex flex-col gap-8">
        {header}
        {status === 'error' ? (
          <section className={cn(softSurface, 'flex flex-col items-center gap-3 p-10 text-center')}>
            <p className="text-sm font-medium">Couldn't reach the server</p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </section>
        ) : (
          <SystemSkeleton />
        )}
      </div>
    )
  }

  const { runtime, database, storage, services, security } = data

  const heapPercent =
    runtime.heapTotal > 0 ? Math.round((runtime.heapUsed / runtime.heapTotal) * 100) : 0
  const isHealthy = database.status === 'connected'

  return (
    <div className="flex flex-col gap-8">
      {header}

      {/* The one-line verdict, so nothing below has to be read to know the
          deployment is up. */}
      <section
        className={cn(
          softSurface,
          'flex flex-wrap items-center justify-between gap-6 px-6 py-5'
        )}
      >
        <div className="flex items-center gap-4">
          <span className="glass-tile flex size-11 shrink-0 items-center justify-center rounded-2xl">
            {isHealthy ? (
              <CircleCheck className="text-success size-5" />
            ) : (
              <CircleAlert className="text-destructive size-5" />
            )}
          </span>
          <div className="flex flex-col gap-0.5">
            <h2 className="text-base font-semibold">
              {isHealthy ? 'All systems operational' : 'Database unreachable'}
            </h2>
            <p className="text-muted-foreground text-xs">
              Up {formatUptime(runtime.uptimeSeconds)} · started {relativeDate(runtime.startedAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={runtime.environment === 'production' ? 'success' : 'secondary'}
            className="rounded-full"
          >
            {runtime.environment}
          </Badge>
          <Badge variant="outline" className="rounded-full">
            Node {runtime.nodeVersion}
          </Badge>
          <Badge variant="outline" className="rounded-full">
            {runtime.platform}
          </Badge>
        </div>
      </section>

      <SectionCard
        title="Connected services"
        description="Whether each subsystem is wired up — never the credentials behind it"
      >
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {services.map((service) => (
            <li key={service.key} className="glass-tile flex items-center gap-3 rounded-2xl p-3">
              <span
                aria-hidden
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  service.configured ? 'bg-success' : 'bg-warning'
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{service.label}</p>
                <p className="text-muted-foreground truncate text-xs" title={service.detail}>
                  {service.detail}
                </p>
              </div>
              <span className="text-muted-foreground shrink-0 text-xs">
                {service.configured ? 'Configured' : 'Not set'}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Runtime" description="The Node process serving this request">
          <div className="flex flex-col">
            <Field label="Process ID" value={String(runtime.pid)} mono />
            <Field label="Uptime" value={formatUptime(runtime.uptimeSeconds)} />
            <Field label="Resident memory" value={formatBytes(runtime.rss)} />
            <Field
              label="Heap"
              value={`${formatBytes(runtime.heapUsed)} of ${formatBytes(runtime.heapTotal)}`}
            />
          </div>

          <div
            className="bg-data-track h-2 overflow-hidden rounded-full"
            role="meter"
            aria-valuenow={heapPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Heap in use"
          >
            <div
              className="bg-data h-full rounded-full transition-[width] duration-[var(--motion-view-in)] ease-[var(--ease-glass)]"
              style={{ width: `${heapPercent}%` }}
            />
          </div>
          <p className="text-muted-foreground text-xs">{heapPercent}% of the heap in use</p>
        </SectionCard>

        <SectionCard title="Database" description="MongoDB connection and collection sizes">
          <div className="flex flex-col">
            <Field label="Status" value={database.status} />
            <Field label="Host" value={database.host ?? '—'} mono />
            <Field label="Database" value={database.name ?? '—'} mono />
            <Field label="Collections" value={String(database.collections)} />
          </div>

          <ul className="grid grid-cols-3 gap-3 pt-1">
            {[
              { label: 'Users', value: database.documents.users },
              { label: 'Projects', value: database.documents.projects },
              { label: 'Tasks', value: database.documents.tasks },
              { label: 'Files', value: database.documents.files },
              { label: 'Departments', value: database.documents.departments },
              { label: 'Audit', value: database.documents.auditEntries },
            ].map((cell) => (
              <li key={cell.label} className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs">{cell.label}</span>
                <span className="text-xl leading-none font-semibold tabular-nums">
                  {cell.value}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="File storage" description="Where uploads land and what they occupy">
          <div className="flex flex-col">
            <Field label="Upload root" value={storage.root} mono />
            <Field
              label="Live files"
              value={`${storage.files} · ${formatBytes(storage.totalSize)}`}
            />
            <Field
              label="In trash"
              value={`${storage.trashedFiles} · ${formatBytes(storage.trashedSize)}`}
            />
            <Field label="Per-file limit" value={formatBytes(storage.maxUploadBytes)} />
            <Field label="Files per upload" value={String(storage.maxFilesPerRequest)} />
          </div>
        </SectionCard>

        <SectionCard
          title="Security"
          description="Session and retention policy, set by the environment rather than here"
        >
          <div className="flex flex-col">
            <Field label="Access token lifetime" value={security.accessTokenTtl} />
            <Field label="Refresh token lifetime" value={`${security.refreshTokenDays} days`} />
            <Field label="Password hashing" value={`bcrypt, ${security.bcryptRounds} rounds`} />
            <Field label="Permitted origin" value={security.clientOrigin} mono />
            <Field label="Audit retention" value={`${security.auditRetentionDays} days`} />
          </div>

          <p className="text-muted-foreground text-xs">
            These are read-only. Changing one means changing the server environment and
            restarting — a setting that can be edited from a browser session is a setting an
            attacker can edit from a stolen one.
          </p>
        </SectionCard>
      </div>
    </div>
  )
}
