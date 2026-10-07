import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth.jsx';
import { useTheme } from '@/lib/theme.jsx';
import { cn } from '@/lib/cn.js';
import { indicatorStyle, useActiveIndicator } from '@/hooks/useActiveIndicator.js';
import { useNavBadges } from '@/hooks/useNavBadges.js';
import { Tooltip } from '../ui/Menu.jsx';
import { Moon, PanelToggle, Settings, Sun, Zap } from '../icons.jsx';
import { navLabel, railItems } from './navigation.js';

const segment = 'glass-rail flex flex-col items-center rounded-[var(--radius-2xl)]';
const button = cn(
  'flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] text-white/55',
  'transition-[color,background-color,transform] duration-[var(--duration)] ease-[var(--ease-glass)]',
  'hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40',
);

/**
 * The icon rail: the handful of places people jump between all day, plus the
 * navigator toggle, theme and settings. It stays dark in both themes.
 */
export function Rail({ navigatorOpen, onToggleNavigator }: { navigatorOpen: boolean; onToggleNavigator: () => void }) {
  const { allows, isAdmin } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const badges = useNavBadges();
  const { containerRef, box, ready } = useActiveIndicator<HTMLDivElement>();

  return (
    <nav aria-label="Primary" className="hidden w-[var(--rail-width)] shrink-0 flex-col gap-2 lg:flex">
      <div className={cn(segment, 'min-h-0 flex-1 px-3 py-3')}>
        <NavLink
          to="/dashboard"
          aria-label="XenoSpace home"
          className="mb-2 flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-white text-black"
        >
          <Zap size={18} />
        </NavLink>
        <span aria-hidden="true" className="h-px w-6 shrink-0 bg-white/15" />

        <div className="scrollbar-none mt-1 flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
          <div ref={containerRef} className="relative flex min-h-full flex-col items-center justify-center gap-3">
            {/* The same travelling highlight as the navigator, in rail tones. */}
            <span
              aria-hidden="true"
              data-ready={ready}
              data-visible={box !== null}
              className="nav-indicator rounded-[var(--radius-lg)] bg-white/11 shadow-[inset_0_1px_0_var(--glass-rail-highlight)]"
              style={indicatorStyle(box)}
            />
            {railItems(allows, isAdmin).map((item) => {
              const label = navLabel(item, isAdmin);
              const count = item.badge ? badges[item.badge] : undefined;
              const alert = item.badge === 'chat' || item.badge === 'notifications';
              return (
                <Tooltip key={item.to} content={label} side="right">
                  <NavLink
                    to={item.to}
                    aria-label={label}
                    className={({ isActive }) =>
                      cn(button, 'relative z-10', isActive && 'text-white [&>svg]:scale-110')
                    }
                  >
                    <item.icon size={18} className="transition-transform duration-[var(--duration)] ease-[var(--ease-glass)]" />
                    {alert && (count ?? 0) > 0 && (
                      <span aria-hidden="true" className="absolute top-2 right-2 size-1.5 rounded-full bg-[var(--data)]" />
                    )}
                  </NavLink>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleNavigator}
        aria-expanded={navigatorOpen}
        aria-label={navigatorOpen ? 'Hide navigator' : 'Show navigator'}
        className={cn(segment, 'group shrink-0 gap-3 px-3 py-5 text-white/55 transition-colors hover:text-white')}
      >
        <PanelToggle size={18} open={navigatorOpen} className="transition-transform duration-[var(--duration)] group-hover:scale-110" />
        <span className="rotate-180 text-[10px] font-semibold tracking-[0.18em] uppercase [writing-mode:vertical-rl]">
          Navigator
        </span>
      </button>

      <div className={cn(segment, 'shrink-0 gap-1 px-3 py-3')}>
        <Tooltip content={theme === 'dark' ? 'Light mode' : 'Dark mode'} side="right">
          <button type="button" aria-label="Toggle theme" className={button} onClick={toggle}>
            {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </Tooltip>
        <Tooltip content="Settings" side="right">
          <button type="button" aria-label="Settings" className={button} onClick={() => navigate('/settings')}>
            <Settings size={18} />
          </button>
        </Tooltip>
      </div>
    </nav>
  );
}
