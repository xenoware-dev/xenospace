import { Outlet } from 'react-router-dom'

import NotAuthorizedPage from '@/pages/NotAuthorizedPage'
import { useAuthStore } from '@/store/auth.store'
import { ADMIN_ROLES } from '@/types/auth'

/**
 * Gates the admin console. A member who lands here keeps the URL and is told
 * why the view is closed, rather than being redirected to the dashboard with no
 * explanation — the server enforces the same rule on every /admin endpoint, so
 * this is about making the refusal legible, not about security.
 */
export function AdminRoute() {
  const role = useAuthStore((s) => s.user?.role)

  if (!role || !ADMIN_ROLES.includes(role)) {
    return <NotAuthorizedPage />
  }

  return <Outlet />
}
