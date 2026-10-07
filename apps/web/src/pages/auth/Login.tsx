import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ERROR_CODES, loginSchema } from '@xenospace/shared';
import { ApiError, api } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Checkbox, TextInput } from '@/components/ui/Field.jsx';
import { AuthLayout } from './AuthLayout.jsx';
import { Shield } from '@/components/icons.jsx';
import { cn } from '@/lib/cn.js';

/**
 * Sign in.
 *
 * Field errors come back from the shared Zod schema, so client and server
 * disagree about nothing. The form also handles the two-step case where the
 * server asks for a TOTP code only after the password has been accepted.
 */
/** Why a Google round trip sent the user back here, keyed by the API's `?error=`. */
const OAUTH_ERRORS: Record<string, string> = {
  email_unverified: 'That Google account has an unverified email address. Verify it with Google, or sign in with a password.',
  oauth_cancelled: 'Google sign-in was cancelled.',
  oauth_failed: 'Google sign-in did not complete. Please try again.',
  server_unavailable: 'Your Google account checked out, but XenoSpace could not reach its database. Please try again in a moment.',
  account_inactive: 'This account has been deactivated. Ask a team lead to restore it.',
  totp_required: 'This account uses two-factor authentication. Sign in with your password and code instead.',
  not_invited: 'That Google account has not been added to XenoSpace. Ask your team lead to add your Gmail address, then try again.',
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [providers, setProviders] = useState<{ google: boolean; password: boolean; registration: boolean } | null>(null);

  // OAuth availability decides whether the Google button is shown at all,
  // rather than offering a button that cannot work.
  useEffect(() => {
    void api
      .get<{ google: boolean; password: boolean; registration?: boolean }>('/auth/providers')
      .then((p) => setProviders({ ...p, registration: p.registration ?? true }))
      // Unreachable server: show the password form so the error surfaces on submit.
      .catch(() => setProviders({ google: false, password: true, registration: false }));
  }, []);

  // Surfaces the reason an OAuth round trip bounced the user back.
  useEffect(() => {
    const reason = params.get('error');
    const message = reason ? OAUTH_ERRORS[reason] : undefined;
    if (message) setFormError(message);
  }, [params]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse({
      email,
      password,
      rememberMe,
      ...(needsTotp && totp ? { totp } : {}),
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitting(true);

    try {
      await login(parsed.data);
      navigate(params.get('next') ?? '/dashboard', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === ERROR_CODES.TOTP_REQUIRED) {
          // Password was right; ask for the second factor without losing it.
          setNeedsTotp(true);
          setFormError(null);
        } else if (error.code === ERROR_CODES.TOTP_INVALID) {
          setErrors({ totp: 'That code is incorrect or has expired.' });
        } else if (error.code === ERROR_CODES.ACCOUNT_LOCKED) {
          setFormError('This account is temporarily locked after repeated failed sign-ins. Try again in a few minutes.');
        } else {
          setFormError(error.message);
        }
      } else {
        setFormError('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const continueWithGoogle = () => {
    // A full navigation, not fetch: the OAuth flow is a redirect chain.
    window.location.href = `/api/v1/auth/oauth/google?next=${encodeURIComponent(params.get('next') ?? '/dashboard')}`;
  };

  const errorBanner = formError && (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-[var(--radius-lg)] bg-[var(--status-critical-wash)] px-3.5 py-3 text-xs text-[var(--status-critical-ink)]"
    >
      <span aria-hidden="true" className="mt-px">⚠</span>
      <span className="leading-relaxed">{formError}</span>
    </div>
  );

  // Until the server says which methods are on, show neither, so the password
  // form does not flash up on a Google-only workspace.
  if (!providers) {
    return (
      <AuthLayout title="Welcome back" subtitle="Sign in to pick up where your team left off.">
        <div className="h-12 animate-pulse rounded-full bg-[var(--glass-tile)]" aria-hidden="true" />
      </AuthLayout>
    );
  }

  if (!providers.password) {
    return (
      <AuthLayout
        eyebrow={
          <span className="glass-control inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs text-[var(--ink-secondary)]">
            <Shield size={12} aria-hidden="true" />
            Invite-only workspace
          </span>
        }
        title="Welcome back"
        subtitle="Sign in with the Google account your team lead added for you."
        footer={
          <>
            Not added yet? Ask your team lead to add your Gmail address under{' '}
            <span className="text-[var(--ink-secondary)]">Team Members</span>.
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {errorBanner}
          <GoogleButton onClick={continueWithGoogle} disabled={!providers.google} />
          {!providers.google && (
            <p className="text-xs text-[var(--status-critical-ink)]">Google sign-in is not configured on the server.</p>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up where your team left off."
      footer={
        providers.registration ? (
          <>
            New here?{' '}
            <Link to="/register" className="font-medium text-[var(--accent)] hover:underline">
              Create an account
            </Link>
          </>
        ) : undefined
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {errorBanner}

        <TextInput
          label="Email"
          type="email"
          name="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          placeholder="you@company.com"
          disabled={needsTotp}
        />

        <TextInput
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={errors.password}
          placeholder="••••••••••••"
          disabled={needsTotp}
          aside={
            <Link to="/forgot-password" className="text-[var(--accent)] hover:underline">
              Forgot?
            </Link>
          }
        />

        {needsTotp && (
          <TextInput
            label="Authenticator code"
            name="totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            required
            value={totp}
            onChange={(event) => setTotp(event.target.value.replace(/\D/g, ''))}
            error={errors.totp}
            hint="Enter the 6-digit code from your authenticator app."
            placeholder="123456"
            className="text-center font-mono text-lg tracking-[0.3em]"
          />
        )}

        {!needsTotp && (
          <Checkbox
            label="Keep me signed in"
            hint="Only on a device you trust."
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
          />
        )}

        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          {needsTotp ? 'Verify and sign in' : 'Sign in'}
        </Button>

        {needsTotp && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setNeedsTotp(false);
              setTotp('');
            }}
          >
            Use a different account
          </Button>
        )}

        {providers?.google && !needsTotp && (
          <>
            <div className="flex items-center gap-3 py-1">
              <span className="h-px flex-1 bg-[var(--line-subtle)]" />
              <span className="text-2xs text-[var(--ink-faint)]">or</span>
              <span className="h-px flex-1 bg-[var(--line-subtle)]" />
            </div>
            <GoogleButton onClick={continueWithGoogle} />
          </>
        )}
      </form>
    </AuthLayout>
  );
}

/**
 * Google's sign-in button, following its branding rules: the multicolour G on
 * a light surface with "Continue with Google". Light in both themes, which is
 * what Google asks for and what people recognise.
 */
function GoogleButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group flex h-12 w-full items-center justify-center gap-3 rounded-full bg-white px-5 text-sm font-semibold text-[#1f1f1f]',
        'shadow-[0_8px_24px_rgb(0_0_0/0.28)] ring-1 ring-black/10',
        'transition-[transform,box-shadow,background-color] duration-[var(--duration-fast)] hover:bg-[#f4f4f4] active:scale-[0.985]',
        'focus-visible:ring-4 focus-visible:ring-[var(--accent-ring)] focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 shrink-0">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
      Continue with Google
    </button>
  );
}
