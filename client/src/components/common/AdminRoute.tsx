import { Navigate, Outlet } from 'react-router-dom'

import { useAuthStore } from '@/store/auth.store'
import { ADMIN_ROLES } from '@/types/auth'

export function AdminRoute() {
  const role = useAuthStore((s) => s.user?.role)

  if (!role || !ADMIN_ROLES.includes(role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
