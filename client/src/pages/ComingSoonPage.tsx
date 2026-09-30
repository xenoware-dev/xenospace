import { Construction } from 'lucide-react'
import { useLocation } from 'react-router-dom'

import { Card, CardContent } from '@/components/ui/card'

function titleFromPath(pathname: string) {
  const segment = pathname.split('/').filter(Boolean).pop() ?? 'Page'
  return segment
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

export default function ComingSoonPage() {
  const location = useLocation()
  const title = titleFromPath(location.pathname)

  return (
    <div className="flex h-full min-h-[60svh] items-center justify-center">
      <Card variant="elevated" className="max-w-md">
        <CardContent className="flex flex-col items-center gap-3 text-center">
          <span className="glass-tile flex size-12 items-center justify-center rounded-full">
            <Construction className="text-muted-foreground size-6" />
          </span>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-muted-foreground text-sm">
            This module is part of a later development phase and is coming soon.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
