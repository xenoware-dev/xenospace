import { Outlet } from 'react-router-dom'

import { Logo } from '@/components/common/Logo'

export function AuthLayout() {
  return (
    <div className="bg-canvas flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <Logo className="text-lg" />
      <div className="w-full max-w-sm">
        <Outlet />
      </div>
    </div>
  )
}
