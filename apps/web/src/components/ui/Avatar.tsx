import type { PresenceState, PublicUser } from '@xenospace/shared';
import { cn } from '@/lib/cn.js';
import { initials } from '@/lib/format.js';
import { useSocket } from '@/lib/socket.jsx';

/**
 * User avatar.
 *
 * Falls back to initials on a per-user colour, so a team with no uploaded
 * photos still reads as distinct faces rather than a column of identical
 * placeholders.
 */

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<AvatarSize, { box: string; text: string; ring: string; dot: string }> = {
  xs: { box: 'size-5', text: 'text-[9px]', ring: 'ring-1', dot: 'size-1.5 -right-0 -bottom-0' },
  sm: { box: 'size-6', text: 'text-[10px]', ring: 'ring-1', dot: 'size-2 -right-0.5 -bottom-0.5' },
  md: { box: 'size-8', text: 'text-xs', ring: 'ring-2', dot: 'size-2.5 -right-0.5 -bottom-0.5' },
  lg: { box: 'size-10', text: 'text-sm', ring: 'ring-2', dot: 'size-3 -right-0.5 -bottom-0.5' },
  xl: { box: 'size-16', text: 'text-xl', ring: 'ring-2', dot: 'size-4 right-0 bottom-0' },
};

const PRESENCE_COLOR: Record<PresenceState, string> = {
  ONLINE: 'var(--status-good)',
  AWAY: 'var(--status-warning)',
  BUSY: 'var(--status-critical)',
  OFFLINE: 'var(--ink-faint)',
};

const PRESENCE_LABEL: Record<PresenceState, string> = {
  ONLINE: 'Online', AWAY: 'Away', BUSY: 'Busy', OFFLINE: 'Offline',
};

export interface AvatarProps {
  user: Pick<PublicUser, 'id' | 'name' | 'avatarUrl' | 'avatarColor'> & { presence?: PresenceState };
  size?: AvatarSize;
  /** Shows a live presence dot, driven by the socket rather than the stale row. */
  showPresence?: boolean;
  className?: string;
}

export function Avatar({ user, size = 'md', showPresence = false, className }: AvatarProps) {
  const { presence: presenceMap } = useSocket();
  const spec = SIZES[size];
  // Live presence wins over whatever the row said when it was fetched.
  const presence = presenceMap.get(user.id) ?? user.presence ?? 'OFFLINE';

  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.name}
          loading="lazy"
          className={cn(spec.box, 'rounded-full object-cover ring-[var(--line-subtle)]', spec.ring)}
        />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            spec.box, spec.text, spec.ring,
            'inline-flex items-center justify-center rounded-full font-semibold text-white select-none ring-[var(--line-subtle)]',
          )}
          style={{
            // A soft gradient reads less flat than a solid fill at small sizes.
            background: `linear-gradient(140deg, ${user.avatarColor}, ${user.avatarColor}cc)`,
          }}
        >
          {initials(user.name)}
        </span>
      )}
      {!user.avatarUrl && <span className="sr-only-focusable">{user.name}</span>}

      {showPresence && (
        <span
          className={cn(
            spec.dot,
            'absolute rounded-full ring-2 ring-[var(--surface-1)]',
          )}
          style={{ background: PRESENCE_COLOR[presence] }}
          title={`${user.name} — ${PRESENCE_LABEL[presence]}`}
        >
          <span className="sr-only-focusable">{PRESENCE_LABEL[presence]}</span>
        </span>
      )}
    </span>
  );
}

/**
 * Overlapping avatar stack with an overflow counter.
 *
 * Reversed flex order so earlier avatars sit on top of later ones, which keeps
 * the leftmost face fully visible.
 */
export function AvatarStack({
  users,
  max = 4,
  size = 'sm',
  className,
}: {
  users: Array<Pick<PublicUser, 'id' | 'name' | 'avatarUrl' | 'avatarColor'>>;
  max?: number;
  size?: AvatarSize;
  className?: string;
}) {
  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;
  const spec = SIZES[size];

  return (
    <span className={cn('inline-flex flex-row-reverse items-center', className)}>
      {overflow > 0 && (
        <span
          className={cn(
            spec.box, spec.text,
            '-ml-1.5 inline-flex items-center justify-center rounded-full bg-[var(--surface-3)] font-semibold text-[var(--ink-secondary)] ring-2 ring-[var(--surface-1)]',
          )}
          title={users.slice(max).map((u) => u.name).join(', ')}
        >
          +{overflow}
        </span>
      )}
      {shown.reverse().map((user) => (
        <span key={user.id} className="-ml-1.5 first:ml-0" title={user.name}>
          <Avatar user={user} size={size} className="ring-2 ring-[var(--surface-1)]" />
        </span>
      ))}
    </span>
  );
}

/** Avatar with name and an optional secondary line. */
export function UserChip({
  user,
  size = 'sm',
  subtitle,
  showPresence,
  className,
}: {
  user: PublicUser;
  size?: AvatarSize;
  subtitle?: string;
  showPresence?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <Avatar user={user} size={size} showPresence={showPresence} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate-line text-xs font-medium text-[var(--ink-primary)]">{user.name}</span>
        {subtitle && <span className="block truncate-line text-2xs text-[var(--ink-muted)]">{subtitle}</span>}
      </span>
    </span>
  );
}
