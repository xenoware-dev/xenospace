import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuthStore } from '@/store/auth.store'

export function ProtectedRoute() {
  const { status, fetchCurrentUser } = useAuthStore()
  const location = useLocation()

  useEffect(() => {
    if (status === 'idle') {
      void fetchCurrentUser()
    }
  }, [status, fetchCurrentUser])

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex h-svh w-full items-center justify-center">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
