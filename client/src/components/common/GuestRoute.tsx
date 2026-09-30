import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'

import { useAuthStore } from '@/store/auth.store'

// Redirects an already-authenticated user away from auth pages (login, register, etc.)
export function GuestRoute() {
  const { status, fetchCurrentUser } = useAuthStore()

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

  if (status === 'authenticated') {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
