import { Moon, Sun } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/use-theme'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const toggle = () => {
    const current =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme
    setTheme(current === 'dark' ? 'light' : 'dark')
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
      <Sun className="size-4 scale-100 dark:scale-0" />
      <Moon className="absolute size-4 scale-0 dark:scale-100" />
    </Button>
  )
}
