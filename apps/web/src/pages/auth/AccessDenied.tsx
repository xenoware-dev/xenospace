import { useSearchParams } from 'react-router-dom';
import { StatusPage } from '@/components/StatusPage.jsx';
import { Button, LinkButton } from '@/components/ui/Button.jsx';
import { Shield, User } from '@/components/icons.jsx';

/**
 * Where a refused Google sign-in lands.
 *
 * Google proved who the person is; XenoSpace is saying that person is not on
 * the team (or no longer is). Naming the account matters most: the usual cause
 * is a browser signed in to a personal Gmail instead of the one that was added.
 */
const REASONS = {
  not_invited: {
    title: 'This account has not been added',
    message:
      'XenoSpace is invite-only. Your team lead adds each person’s Gmail address before they can sign in, and this one is not on the list.',
    footnote: 'Signed in with the wrong account? Choose another one below. Otherwise, send your team lead the address above and ask them to add it under Team Members.',
  },
  account_inactive: {
    title: 'This account has been deactivated',
    message: 'Your access to XenoSpace has been switched off by a team lead.',
    footnote: 'If you think this is a mistake, contact your team lead and ask them to reactivate your account.',
  },
} as const;

type Reason = keyof typeof REASONS;

export function AccessDeniedPage() {
  const [params] = useSearchParams();
  const raw = params.get('reason');
  const reason: Reason = raw && raw in REASONS ? (raw as Reason) : 'not_invited';
  const email = params.get('email');
  const copy = REASONS[reason];

  return (
    <StatusPage
      fullScreen
      code="403"
      tone={reason === 'account_inactive' ? 'critical' : 'warning'}
      icon={<Shield size={22} />}
      title={copy.title}
      message={copy.message}
      detail={
        email && (
          <span className="flex items-center justify-center gap-2">
            <User size={14} aria-hidden="true" className="shrink-0 text-[var(--ink-muted)]" />
            <span>
              <span className="sr-only">Signed in as </span>
              {email}
            </span>
          </span>
        )
      }
      actions={
        <>
          {/* Google shows its account chooser on every sign-in, so starting
              again is how a different account is picked. */}
          <Button
            variant="primary"
            onClick={() => {
              window.location.href = '/api/v1/auth/oauth/google?next=%2Fdashboard';
            }}
          >
            Try a different Google account
          </Button>
          <LinkButton to="/login" variant="secondary">
            Back to sign in
          </LinkButton>
        </>
      }
      footnote={copy.footnote}
    />
  );
}
