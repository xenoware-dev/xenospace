import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api.js';

export interface AuthProviders {
  google: boolean;
  password: boolean;
  registration: boolean;
}

/**
 * Sends the visitor to /login when the page they opened is switched off on the
 * server (e.g. sign-up on an invite-only workspace). The server refuses these
 * routes regardless; this only spares people a form that cannot work.
 */
export function useRedirectUnlessEnabled(isEnabled: (p: AuthProviders) => boolean) {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    void api
      .get<Partial<AuthProviders>>('/auth/providers')
      .then((p) => {
        const providers = { google: Boolean(p.google), password: p.password ?? true, registration: p.registration ?? true };
        if (!cancelled && !isEnabled(providers)) navigate('/login', { replace: true });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // The predicate is a fixed rule per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);
}
