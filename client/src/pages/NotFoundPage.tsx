import { Link } from 'react-router-dom'

import { Button } from '@/components/ui/button'

export default function NotFoundPage() {
  return (
    <div className="flex h-svh w-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-muted-foreground text-sm font-medium">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Button asChild className="mt-2">
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  )
}
