import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { forgotPasswordSchema, passwordStrength, resetPasswordSchema } from '@xenospace/shared';
import { ApiError, api } from '@/lib/api.js';
import { cn } from '@/lib/cn.js';
import { Button } from '@/components/ui/Button.jsx';
import { TextInput } from '@/components/ui/Field.jsx';
import { AuthLayout } from './AuthLayout.jsx';
import { useRedirectUnlessEnabled } from '@/lib/useAuthProviders.js';

/**
 * Request a reset link.
 *
 * The confirmation is identical whether or not the address exists — matching
 * the server, which deliberately does not reveal which accounts are real.
 */
export function ForgotPasswordPage() {
  useRedirectUnlessEnabled((p) => p.password);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', parsed.data);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle={`If an account exists for ${email}, a reset link is on its way. The link expires in one hour.`}
        footer={
          <Link to="/login" className="font-medium text-[var(--accent)] hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="rounded-[var(--radius-lg)] bg-[var(--status-info-wash)] p-4 text-xs leading-relaxed text-[var(--ink-secondary)]">
          Did not receive it? Check your spam folder, or{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-medium text-[var(--accent)] hover:underline"
          >
            try a different address
          </button>
          .
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you sign in with and we will send you a reset link."
      footer={
        <Link to="/login" className="font-medium text-[var(--accent)] hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextInput
          label="Email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error}
          placeholder="you@company.com"
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Completes a reset using the token from the emailed link. */
export function ResetPasswordPage() {
  useRedirectUnlessEnabled((p) => p.password);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const strength = passwordStrength(password);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = resetPasswordSchema.safeParse({ token, password, confirmPassword });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      if (next.token) setFormError('This reset link is invalid. Request a new one.');
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await api.post('/auth/reset-password', parsed.data);
      navigate('/login?reset=1', { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  const METER_TONES = [
    'var(--status-critical)', 'var(--status-critical)', 'var(--status-warning)',
    'var(--status-serious)', 'var(--status-good)',
  ];

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Signing in again on your other devices will be required."
      footer={
        <Link to="/login" className="font-medium text-[var(--accent)] hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError && (
          <div role="alert" className="rounded-[var(--radius-md)] bg-[var(--status-critical-wash)] px-3 py-2.5 text-xs text-[var(--status-critical-ink)]">
            {formError}
          </div>
        )}

        <div>
          <TextInput
            label="New password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
          />
          {password.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5" aria-hidden="true">
              {[0, 1, 2, 3].map((index) => (
                <span
                  key={index}
                  className={cn('h-1 flex-1 rounded-full', index < strength.score ? '' : 'bg-[var(--surface-3)]')}
                  style={index < strength.score ? { background: METER_TONES[strength.score] } : undefined}
                />
              ))}
            </div>
          )}
        </div>

        <TextInput
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirmPassword}
        />

        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting} disabled={!token}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
