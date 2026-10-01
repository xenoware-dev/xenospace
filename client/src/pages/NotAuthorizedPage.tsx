import { ArrowLeft, ShieldAlert } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatRole } from '@/lib/format'
import { useAuthStore } from '@/store/auth.store'

/**
 * Shown in place of an admin view the signed-in account may not open. It takes
 * the place of a silent bounce to the dashboard: being sent somewhere else with
 * no explanation reads as a broken link, so the reason is stated instead, along
 * with the role currently held.
 */
export default function NotAuthorizedPage() {
  const role = useAuthStore((s) => s.user?.role)
  const { pathname } = useLocation()

  return (
    <div className="flex h-full min-h-[60svh] items-center justify-center">
      <Card variant="elevated" className="max-w-md">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <span className="glass-tile flex size-12 items-center justify-center rounded-full">
            <ShieldAlert className="text-warning size-6" />
          </span>
          <h2 className="text-lg font-semibold">Admin access required</h2>
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium">{pathname}</span> is part of the admin
            console.{' '}
            {role
              ? `Your account is a ${formatRole(role)}, which cannot open it.`
              : 'Your account cannot open it.'}{' '}
            An administrator can change your role from User Management.
          </p>
          <Button variant="outline" className="mt-2 rounded-full" asChild>
            <Link to="/">
              <ArrowLeft /> Back to dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
