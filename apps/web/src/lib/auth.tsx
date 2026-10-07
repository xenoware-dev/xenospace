import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { can, type CurrentUser, type Permission, type Role } from '@xenospace/shared';
import { api, refreshSession, setAccessToken, setUnauthenticatedHandler } from './api.js';
import { queryClient } from './queryClient.js';

/**
 * Authentication state.
 *
 * The session is restored on load by calling /auth/refresh with the httpOnly
 * cookie — the access token itself is never persisted, so there is nothing in
 * storage for an XSS to steal. A hard reload therefore costs one request and
 * cannot be skipped.
 */

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: CurrentUser | null;
  /** Permission check against the signed-in role. */
  allows: (permission: Permission) => boolean;
  allowsAny: (...permissions: Permission[]) => boolean;
  isAdmin: boolean;
  login: (input: { email: string; password: string; rememberMe?: boolean; totp?: string }) => Promise<void>;
  register: (input: { name: string; email: string; password: string; confirmPassword: string; inviteToken?: string }) => Promise<void>;
  logout: () => Promise<void>;
  /** Replaces the cached user, e.g. after a profile or preference change. */
  setUser: (user: CurrentUser) => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface SessionResponse {
  user: CurrentUser;
  accessToken: string;
  expiresIn: number;
}

/** Reads the CSRF cookie for the logout call, which is cookie-authenticated. */
function csrfToken(): string | null {
  const match = /(?:^|;\s*)xs_csrf=([^;]*)/.exec(document.cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function AuthProvider({ children }: { children: ReactNode }): ReactNode {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUserState] = useState<CurrentUser | null>(null);
  const refreshTimer = useRef<number | null>(null);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUserState(null);
    setStatus('anonymous');
    // Everything cached was scoped to the departing user.
    queryClient.clear();
    if (refreshTimer.current !== null) {
      window.clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
    }
  }, []);

  /**
   * Schedules a refresh shortly before the access token expires, so a long
   * session never shows the user a 401 it could have avoided.
   */
  const scheduleRefresh = useCallback(
    (expiresIn: number) => {
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
      // 60s of headroom, and never sooner than 15s to avoid a tight loop if the
      // server ever returns a very short TTL.
      const delay = Math.max(15_000, (expiresIn - 60) * 1000);
      refreshTimer.current = window.setTimeout(() => {
        void (async () => {
          const ok = await refreshSession();
          if (!ok) {
            clearSession();
            return;
          }
          const me = await api.get<CurrentUser>('/auth/me').catch(() => null);
          if (me) setUserState(me);
          scheduleRefresh(expiresIn);
        })();
      }, delay);
    },
    [clearSession],
  );

  const adopt = useCallback(
    (session: SessionResponse) => {
      setAccessToken(session.accessToken);
      setUserState(session.user);
      setStatus('authenticated');
      scheduleRefresh(session.expiresIn);
    },
    [scheduleRefresh],
  );

  // Restore an existing session on first mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await refreshSession();
      if (cancelled) return;
      if (!ok) {
        setStatus('anonymous');
        return;
      }
      try {
        const me = await api.get<CurrentUser>('/auth/me');
        if (cancelled) return;
        setUserState(me);
        setStatus('authenticated');
        scheduleRefresh(900);
      } catch {
        if (!cancelled) clearSession();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clearSession, scheduleRefresh]);

  // A 401 that the client could not recover from ends the session here.
  useEffect(() => {
    setUnauthenticatedHandler(clearSession);
    return () => setUnauthenticatedHandler(null);
  }, [clearSession]);

  const login = useCallback(
    async (input: { email: string; password: string; rememberMe?: boolean; totp?: string }) => {
      adopt(await api.post<SessionResponse>('/auth/login', input));
    },
    [adopt],
  );

  const register = useCallback(
    async (input: { name: string; email: string; password: string; confirmPassword: string; inviteToken?: string }) => {
      adopt(await api.post<SessionResponse>('/auth/register', input));
    },
    [adopt],
  );

  const logout = useCallback(async () => {
    const csrf = csrfToken();
    // Best effort: the local session is cleared either way, so a failed call
    // cannot leave the user apparently signed in.
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: csrf ? { 'X-CSRF-Token': csrf } : {},
    }).catch(() => undefined);
    clearSession();
  }, [clearSession]);

  const refresh = useCallback(async () => {
    const me = await api.get<CurrentUser>('/auth/me');
    setUserState(me);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      allows: (permission) => can(user?.role as Role | undefined, permission),
      allowsAny: (...permissions) => permissions.some((p) => can(user?.role as Role | undefined, p)),
      isAdmin: user?.role === 'ADMIN',
      login,
      register,
      logout,
      setUser: setUserState,
      refresh,
    }),
    [status, user, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}

/** The signed-in user, for components that only render when authenticated. */
export function useCurrentUser(): CurrentUser {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used outside an authenticated route');
  return user;
}
