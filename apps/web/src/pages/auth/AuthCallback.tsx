import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth.jsx';
import { LoadingState } from '@/components/ui/Spinner.jsx';

/**
 * OAuth landing page.
 *
 * The provider redirect carries no token — the server set the refresh cookie
 * and the auth provider completes sign-in by refreshing on mount. This page
 * only waits for that to finish, then moves on in-app.
 *
 * It must not reload the page: a reload aborts the refresh that is already in
 * flight, after the server has rotated the token but before the browser has the
 * new cookie, and the next request then presents the old one. That used to read
 * as token theft and sign the user out, so every Google sign-in needed two tries.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'authenticated') {
      const next = params.get('next');
      const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
      navigate(target, { replace: true });
    } else {
      navigate('/login?error=oauth_failed', { replace: true });
    }
  }, [status, navigate, params]);

  return (
    <div className="grid min-h-dvh place-items-center">
      <LoadingState label="Completing sign-in" />
    </div>
  );
}
