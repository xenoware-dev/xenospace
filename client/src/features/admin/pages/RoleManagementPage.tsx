import { ArrowRight, Check, Minus, ShieldCheck, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/common/PageHeader'
import { StatTile } from '@/components/common/StatTile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { softSurface } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BreakdownList, type BreakdownRow } from '@/features/admin/components/BreakdownList'
import { SectionCard } from '@/features/admin/components/SectionCard'
import { relativeDate } from '@/features/files/lib/file-meta'
import { formatRole } from '@/lib/format'
import { cn } from '@/lib/utils'
import { adminApi } from '@/services/admin.service'
import type { AdminRoles, RoleSummary } from '@/types/admin'

/**
 * One cell of the matrix. A granted capability is a filled mark rather than a
 * tick on a coloured ground, because the grid is read down a column — the eye
 * wants to find the boundary where a privilege stops, not to count ticks.
 */
function MatrixCell({ granted, label }: { granted: boolean; label: string }) {
  return (
    <td className="px-2 py-2.5 text-center">
      <span
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-full transition-colors duration-[var(--motion-control)] ease-[var(--ease-glass)]',
          granted ? 'bg-data/15 text-data' : 'text-muted-foreground/40'
        )}
      >
        {granted ? <Check className="size-3.5" /> : <Minus className="size-3.5" />}
        <span className="sr-only">{granted ? `Granted: ${label}` : `Not granted: ${label}`}</span>
      </span>
    </td>
  )
}

/** A role as a tile: who holds it, and everything it can do, spelled out. */
function RoleCard({
  role,
  capabilityLabels,
}: {
  role: RoleSummary
  capabilityLabels: Map<string, string>
}) {
  const inactive = role.count - role.active

  return (
    <article className={cn(softSurface, 'flex flex-col gap-4 p-5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="glass-tile flex size-9 shrink-0 items-center justify-center rounded-xl">
            {role.isAdmin ? (
              <ShieldCheck className="text-data size-4" />
            ) : (
              <Users className="text-muted-foreground size-4" />
            )}
          </span>
          <div className="flex flex-col">
            <h3 className="text-sm font-semibold">{formatRole(role.role)}</h3>
            <p className="text-muted-foreground text-xs">
              {role.count === 0
                ? 'Nobody holds this role'
                : `${role.count} ${role.count === 1 ? 'member' : 'members'} · ${role.share}% of the org`}
            </p>
          </div>
        </div>
        {role.isAdmin && (
          <Badge variant="secondary" className="rounded-full text-[11px]">
            Privileged
          </Badge>
        )}
      </div>

      {inactive > 0 && (
        <p className="text-muted-foreground text-xs">
          {inactive} deactivated {inactive === 1 ? 'account' : 'accounts'}
        </p>
      )}

      <ul className="flex flex-wrap gap-1.5">
        {role.capabilities.length === 0 ? (
          <li className="text-muted-foreground text-xs">
            Standard access only — their own work, and anything shared with their team.
          </li>
        ) : (
          role.capabilities.map((key) => (
            <li
              key={key}
              className="glass-control rounded-full px-2.5 py-1 text-[11px] font-medium"
            >
              {capabilityLabels.get(key) ?? key}
            </li>
          ))
        )}
      </ul>
    </article>
  )
}

function RolesSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-2xl" />
    </div>
  )
}

export default function RoleManagementPage() {
  const [data, setData] = useState<AdminRoles | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const load = () => {
    setStatus('loading')
    adminApi
      .roles()
      .then(({ data }) => {
        setData(data)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }

  useEffect(load, [])

  const header = (
    <PageHeader
      title="Role Management"
      description="What each role is allowed to do, and who currently holds it. Assignment happens in User Management."
      action={
        <Button variant="outline" className="rounded-full" asChild>
          <Link to="/admin/users">
            Assign roles <ArrowRight />
          </Link>
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
            <p className="text-sm font-medium">Couldn't load roles</p>
            <Button variant="outline" onClick={load}>
              Try again
            </Button>
          </section>
        ) : (
          <RolesSkeleton />
        )}
      </div>
    )
  }

  const { roles, capabilities, total, lastRoleChange } = data

  const capabilityLabels = new Map(capabilities.map((c) => [c.key, c.label]))
  const filledRoles = roles.filter((row) => row.count > 0)
  const adminRoles = roles.filter((row) => row.isAdmin)
  const adminHeadcount = adminRoles.reduce((sum, row) => sum + row.count, 0)

  const distributionRows: BreakdownRow[] = filledRoles.map((row) => ({
    key: row.role,
    label: formatRole(row.role),
    count: row.count,
    note: row.isAdmin ? (
      <Badge variant="secondary" className="rounded-full text-[11px]">
        Admin
      </Badge>
    ) : undefined,
  }))

  return (
    <div className="flex flex-col gap-8">
      {header}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Roles defined" value={roles.length} />
        <StatTile label="Roles in use" value={filledRoles.length} />
        <StatTile label="Privileged accounts" value={adminHeadcount} />
        <StatTile label="Capabilities governed" value={capabilities.length} />
      </div>

      {/* Matrix and cards are the same facts at two altitudes: the grid is for
          comparing roles, the cards for reading one. Switching between them
          plays the shared tab motion rather than cutting. */}
      <Tabs defaultValue="matrix" className="gap-4">
        <TabsList>
          <TabsTrigger value="matrix">Capability matrix</TabsTrigger>
          <TabsTrigger value="roles">By role</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix">
          <SectionCard
            title="Who can do what"
            description="Every row is a gate the API actually enforces. Super Admin passes all of them by design."
          >
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="text-muted-foreground w-[280px] px-2 pb-3 text-left text-xs font-medium">
                      Capability
                    </th>
                    {roles.map((row) => (
                      <th
                        key={row.role}
                        className="text-muted-foreground px-2 pb-3 text-center text-xs font-medium"
                      >
                        <span className="block whitespace-nowrap">{formatRole(row.role)}</span>
                        <span className="text-muted-foreground/70 block text-[11px] tabular-nums">
                          {row.count}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {capabilities.map((capability) => (
                    <tr
                      key={capability.key}
                      className="hover:bg-glass-tile border-glass-border border-t transition-colors duration-[var(--motion-control)] ease-[var(--ease-glass)]"
                    >
                      <th scope="row" className="px-2 py-2.5 text-left font-normal">
                        <span className="block text-sm font-medium">{capability.label}</span>
                        <span className="text-muted-foreground block text-xs">
                          {capability.description}
                        </span>
                      </th>
                      {roles.map((row) => (
                        <MatrixCell
                          key={row.role}
                          granted={row.capabilities.includes(capability.key)}
                          label={`${formatRole(row.role)} — ${capability.label}`}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="roles">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {roles.map((role) => (
              <RoleCard key={role.role} role={role} capabilityLabels={capabilityLabels} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="distribution">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard
              title="Members by role"
              description="In privilege order, highest first"
              action={
                <Button variant="ghost" size="sm" className="rounded-full px-3" asChild>
                  <Link to="/team">
                    Directory <ArrowRight />
                  </Link>
                </Button>
              }
            >
              <BreakdownList
                rows={distributionRows}
                total={total}
                emptyLabel="No members yet."
              />
            </SectionCard>

            <SectionCard
              title="Privilege footprint"
              description="How much of the organisation can reach the admin console"
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-end justify-between gap-3">
                  <p className="text-5xl leading-none font-semibold tracking-tight tabular-nums">
                    {adminHeadcount}
                  </p>
                  <span className="text-muted-foreground text-sm">
                    of {total} {total === 1 ? 'member' : 'members'}
                  </span>
                </div>

                <div
                  className="bg-data-track h-2.5 overflow-hidden rounded-full"
                  role="meter"
                  aria-valuenow={total > 0 ? Math.round((adminHeadcount / total) * 100) : 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Share of members with admin access"
                >
                  <div
                    className="bg-data h-full rounded-full transition-[width] duration-[var(--motion-view-in)] ease-[var(--ease-glass)]"
                    style={{ width: `${total > 0 ? (adminHeadcount / total) * 100 : 0}%` }}
                  />
                </div>

                <ul className="flex flex-col gap-2">
                  {adminRoles.map((row) => (
                    <li key={row.role} className="flex items-center justify-between gap-3 text-sm">
                      <span>{formatRole(row.role)}</span>
                      <span className="font-semibold tabular-nums">{row.count}</span>
                    </li>
                  ))}
                </ul>

                <p className="text-muted-foreground border-glass-border border-t pt-3 text-xs">
                  {lastRoleChange
                    ? `Last change: ${lastRoleChange.summary} · ${relativeDate(lastRoleChange.at)}`
                    : 'No role has been changed yet.'}
                </p>
              </div>
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
