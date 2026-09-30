import { Moon, Sun } from 'lucide-react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Choose how Xenospace looks on your device</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          {(
            [
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
              { value: 'system', label: 'System', icon: Sun },
            ] as const
          ).map((option) => (
            <Button
              key={option.value}
              variant={theme === option.value ? 'default' : 'outline'}
              className={cn('gap-2')}
              onClick={() => setTheme(option.value)}
            >
              <option.icon className="size-4" />
              {option.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification preferences</CardTitle>
          <CardDescription>Fine-grained controls arrive alongside the notifications module</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Coming soon.</p>
        </CardContent>
      </Card>
    </div>
  )
}
