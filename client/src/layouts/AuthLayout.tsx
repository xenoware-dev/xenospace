import { Logo } from '@/components/common/Logo'
import { RouteTransition } from '@/components/layout/RouteTransition'

export function AuthLayout() {
  return (
    <div className="bg-canvas flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <Logo className="text-lg" />
      <div className="w-full max-w-sm">
        {/* Login → register → forgot password cross-fade like the app's views. */}
        <RouteTransition />
      </div>
    </div>
  )
}
