import { PanelLeftClose, PanelLeftOpen, Settings, Zap } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'

import { railNavItems } from '@/config/nav'
import { useActiveIndicator } from '@/hooks/use-active-indicator'
import { useTheme } from '@/hooks/use-theme'
import { cn } from '@/lib/utils'
import { Moon, Sun } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const railSegment = 'glass-rail text-rail-foreground flex flex-col items-center rounded-3xl'
const railButton =
  'text-rail-muted hover:bg-rail-accent hover:text-rail-accent-foreground flex size-10 shrink-0 items-center justify-center rounded-2xl transition-[color,background-color,box-shadow,transform] duration-[var(--motion-control)] ease-[var(--ease-glass)] outline-none focus-visible:ring-2 focus-visible:ring-rail-accent-foreground/40'
const railIcon = 'size-[18px] shrink-0'

function RailLink({ title, url, icon: Icon }: (typeof railNavItems)[number]) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <NavLink
          to={url}
          end={url === '/'}
          aria-label={title}
          className={({ isActive }) =>
            cn(
              railButton,
              'relative z-10',
              isActive && 'text-rail-accent-foreground [&>svg]:scale-110'
            )
          }
        >
          <Icon
            className={cn(
              railIcon,
              'transition-transform duration-[var(--motion-control)] ease-[var(--ease-glass)]'
            )}
          />
        </NavLink>
      </TooltipTrigger>
      <TooltipContent side="right">{title}</TooltipContent>
    </Tooltip>
  )
}

interface RailNavProps {
  navigatorOpen: boolean
  onToggleNavigator: () => void
}

export function RailNav({ navigatorOpen, onToggleNavigator }: RailNavProps) {
  const navigate = useNavigate()
  const { resolvedTheme, setTheme } = useTheme()
  const { containerRef: railItemsRef, box, ready } = useActiveIndicator<HTMLDivElement>()
  const ToggleIcon = navigatorOpen ? PanelLeftClose : PanelLeftOpen

  return (
    <TooltipProvider delayDuration={200}>
      <nav aria-label="Primary" className="hidden w-[68px] shrink-0 flex-col gap-2 md:flex">
        <div className={cn(railSegment, 'min-h-0 flex-1 px-3 py-3')}>
          <NavLink
            to="/"
            aria-label="Xenospace home"
            className="bg-rail-accent-foreground text-rail mb-2 flex size-10 shrink-0 items-center justify-center rounded-2xl"
          >
            <Zap className={railIcon} />
          </NavLink>
          <span className="bg-rail-accent-foreground/15 h-px w-6 shrink-0" />
          <div className="scrollbar-none mt-1 flex w-full min-h-0 flex-1 flex-col overflow-y-auto">
            <div
              ref={railItemsRef}
              className="relative flex min-h-full flex-col items-center justify-center gap-4"
            >
              {/* The same travelling highlight as the navigator, in rail tones. */}
              <span
                aria-hidden
                data-ready={ready}
                data-visible={box !== null}
                className="bg-rail-accent nav-indicator rounded-2xl shadow-[inset_0_1px_0_var(--glass-rail-highlight)]"
                style={{
                  transform: `translate3d(${box?.left ?? 0}px, ${box?.top ?? 0}px, 0)`,
                  width: box?.width ?? 0,
                  height: box?.height ?? 0,
                  top: 0,
                  left: 0,
                }}
              />
              {railNavItems.map((item) => (
                <RailLink key={item.title} {...item} />
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleNavigator}
          aria-expanded={navigatorOpen}
          className={cn(
            railSegment,
            'text-rail-muted hover:text-rail-accent-foreground group shrink-0 gap-3 px-3 py-5 transition-colors'
          )}
        >
          <ToggleIcon
            className={cn(
              railIcon,
              'transition-transform duration-[var(--motion-control)] ease-[var(--ease-glass)] group-hover:scale-110'
            )}
          />
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase [writing-mode:vertical-rl] rotate-180">
            Navigator
          </span>
        </button>

        <div className={cn(railSegment, 'shrink-0 gap-1 px-3 py-3')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Toggle theme"
                className={railButton}
                onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              >
                {resolvedTheme === 'dark' ? (
                  <Moon className={railIcon} />
                ) : (
                  <Sun className={railIcon} />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Toggle theme</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Settings"
                className={railButton}
                onClick={() => navigate('/settings')}
              >
                <Settings className={railIcon} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Settings</TooltipContent>
          </Tooltip>
        </div>
      </nav>
    </TooltipProvider>
  )
}
