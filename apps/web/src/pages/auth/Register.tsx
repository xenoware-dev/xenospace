import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PASSWORD_MIN, passwordStrength, registerSchema } from '@xenospace/shared';
import { ApiError } from '@/lib/api.js';
import { useAuth } from '@/lib/auth.jsx';
import { cn } from '@/lib/cn.js';
import { Button } from '@/components/ui/Button.jsx';
import { TextInput } from '@/components/ui/Field.jsx';
import { AuthLayout } from './AuthLayout.jsx';
import { useRedirectUnlessEnabled } from '@/lib/useAuthProviders.js';

/**
 * Registration.
 *
 * The strength meter scores against the same rules the server enforces, so a
 * password the meter calls strong is never rejected on submit. The role is
 * decided entirely by the server — nothing here can ask for one.
 */
export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inviteToken = params.get('token') ?? undefined;
  // An invite link still works while open sign-up is off; a bare visit does not.
  useRedirectUnlessEnabled((p) => p.password && (p.registration || Boolean(inviteToken)));

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);

    const parsed = registerSchema.safeParse({
      name, email, password, confirmPassword,
      ...(inviteToken ? { inviteToken } : {}),
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
      await register(parsed.data);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        // Field-level messages from the server take precedence over a banner.
        if (error.details) {
          const next: Record<string, string> = {};
          for (const [field, messages] of Object.entries(error.details)) {
            if (messages[0]) next[field] = messages[0];
          }
          setErrors(next);
          if (Object.keys(next).length === 0) setFormError(error.message);
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

  const METER = [
    { label: 'Too weak', tone: 'var(--status-critical)' },
    { label: 'Weak', tone: 'var(--status-critical)' },
    { label: 'Fair', tone: 'var(--status-warning)' },
    { label: 'Good', tone: 'var(--status-serious)' },
    { label: 'Strong', tone: 'var(--status-good)' },
  ] as const;

  return (
    <AuthLayout
      title={inviteToken ? 'Accept your invitation' : 'Create your workspace'}
      subtitle={
        inviteToken
          ? 'Set a password to join your team on XenoSpace.'
          : 'The first account becomes the team lead and can invite the rest of the team.'
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[var(--accent)] hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--status-critical-wash)] px-3 py-2.5 text-xs text-[var(--status-critical-ink)]"
          >
            <span aria-hidden="true" className="mt-px">⚠</span>
            <span className="leading-relaxed">{formError}</span>
          </div>
        )}

        <TextInput
          label="Full name"
          name="name"
          autoComplete="name"
          autoFocus
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          placeholder="Ada Lovelace"
        />

        <TextInput
          label="Work email"
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.email}
          placeholder="you@company.com"
        />

        <div>
          <TextInput
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={errors.password}
            placeholder={`At least ${PASSWORD_MIN} characters`}
          />

          {password.length > 0 && (
            <div className="mt-2">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                {[0, 1, 2, 3].map((index) => (
                  <span
                    key={index}
                    className={cn(
                      'h-1 flex-1 rounded-full transition-colors duration-[var(--duration-fast)]',
                      index < strength.score ? '' : 'bg-[var(--surface-3)]',
                    )}
                    style={index < strength.score ? { background: METER[strength.score]!.tone } : undefined}
                  />
                ))}
              </div>
              <p className="mt-1.5 flex items-baseline gap-1.5 text-2xs" role="status">
                <span className="font-medium" style={{ color: METER[strength.score]!.tone }}>
                  {METER[strength.score]!.label}
                </span>
                {strength.hints.length > 0 && (
                  <span className="text-[var(--ink-muted)]">· {strength.hints[0]}</span>
                )}
              </p>
            </div>
          )}
        </div>

        <TextInput
          label="Confirm password"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          error={errors.confirmPassword}
          placeholder="Re-enter your password"
        />

        <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting}>
          {inviteToken ? 'Join the team' : 'Create account'}
        </Button>

        <p className="text-center text-2xs leading-relaxed text-[var(--ink-faint)]">
          Passwords are hashed with Argon2id and never stored in plain text.
        </p>
      </form>
    </AuthLayout>
  );
}
