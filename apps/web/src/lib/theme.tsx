import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';

/**
 * Theme and density.
 *
 * Applied to the document element rather than held in React state alone, so the
 * CSS token blocks switch wholesale. The initial value is resolved by the inline
 * script in index.html; this provider adopts whatever that decided rather than
 * re-deciding and causing a flash.
 */

export type Theme = 'light' | 'dark';
export type Density = 'comfortable' | 'compact';

interface ThemeContextValue {
  theme: Theme;
  density: Density;
  setTheme: (theme: Theme) => void;
  setDensity: (density: Density) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = 'xs-theme';
const DENSITY_KEY = 'xs-density';

function readStoredTheme(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (attr === 'light' || attr === 'dark') return attr;
  return 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [density, setDensityState] = useState<Density>(() => {
    try {
      return localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
    } catch {
      return 'comfortable';
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // Wrapped because storage throws in a private window with blocked cookies.
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* preference is session-only when storage is unavailable */
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    try {
      localStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* preference is session-only when storage is unavailable */
    }
  }, [density]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      density,
      setTheme: setThemeState,
      setDensity: setDensityState,
      toggle: () => setThemeState((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [theme, density],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside a ThemeProvider');
  return context;
}

/** Keyboard shortcut registration, used by the shell for ⌘K and friends. */
export function useHotkey(
  combo: { key: string; meta?: boolean; shift?: boolean },
  handler: () => void,
  enabled = true,
): void {
  const stable = useCallback(handler, [handler]);
  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== combo.key.toLowerCase()) return;
      // Meta on macOS, Control elsewhere — both are the platform's modifier.
      if (combo.meta && !(event.metaKey || event.ctrlKey)) return;
      if (!combo.meta && (event.metaKey || event.ctrlKey)) return;
      if (combo.shift && !event.shiftKey) return;

      // Never hijack a shortcut while the user is typing, unless it is modified.
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (typing && !combo.meta) return;

      event.preventDefault();
      stable();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [combo.key, combo.meta, combo.shift, stable, enabled]);
}
