import type { ReactNode } from 'react';
import {
  DEPLOY_STATUS_LABEL, ISSUE_STATUS_LABEL, PRIORITY_LABEL, PROJECT_STATUS_LABEL,
  REVIEW_STATUS_LABEL, SEVERITY_LABEL, TASK_STATUS_LABEL,
  type DeployStatus, type IssueStatus, type Priority, type ProjectStatus,
  type ReviewStatus, type Severity, type TaskStatus,
} from '@xenospace/shared';
import { cn } from '@/lib/cn.js';

/**
 * Status badges.
 *
 * Every badge carries a text label, and the status variants also carry a dot.
 * That is deliberate: colour alone would make state unreadable to a colourblind
 * user, and these states are exactly the information that must not be missed.
 */

export type BadgeTone =
  | 'neutral' | 'accent' | 'good' | 'warning' | 'serious' | 'critical' | 'info';

const TONES: Record<BadgeTone, { wash: string; ink: string; dot: string }> = {
  neutral: { wash: 'var(--status-neutral-wash)', ink: 'var(--ink-secondary)', dot: 'var(--status-neutral)' },
  accent: { wash: 'var(--accent-wash)', ink: 'var(--accent)', dot: 'var(--accent)' },
  good: { wash: 'var(--status-good-wash)', ink: 'var(--status-good-ink)', dot: 'var(--status-good)' },
  warning: { wash: 'var(--status-warning-wash)', ink: 'var(--status-warning-ink)', dot: 'var(--status-warning)' },
  serious: { wash: 'var(--status-serious-wash)', ink: 'var(--status-serious-ink)', dot: 'var(--status-serious)' },
  critical: { wash: 'var(--status-critical-wash)', ink: 'var(--status-critical-ink)', dot: 'var(--status-critical)' },
  info: { wash: 'var(--status-info-wash)', ink: 'var(--status-info-ink)', dot: 'var(--status-info)' },
};

export interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', dot = false, size = 'sm', icon, className, children }: BadgeProps) {
  const { wash, ink, dot: dotColor } = TONES[tone];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-full)] font-medium whitespace-nowrap',
        size === 'sm' ? 'h-5 px-2 text-2xs' : 'h-6 px-2.5 text-xs',
        className,
      )}
      style={{ background: wash, color: ink }}
    >
      {dot && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ background: dotColor }}
        />
      )}
      {icon}
      {children}
    </span>
  );
}

/* ----------------------------------------------- domain-specific mappings */

const TASK_STATUS_TONE: Record<TaskStatus, BadgeTone> = {
  BACKLOG: 'neutral',
  TODO: 'neutral',
  IN_PROGRESS: 'info',
  IN_REVIEW: 'accent',
  BLOCKED: 'critical',
  DONE: 'good',
};

export function TaskStatusBadge({ status, size }: { status: TaskStatus; size?: 'sm' | 'md' }) {
  return <Badge tone={TASK_STATUS_TONE[status]} dot size={size}>{TASK_STATUS_LABEL[status]}</Badge>;
}

const PRIORITY_TONE: Record<Priority, BadgeTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'serious',
  URGENT: 'critical',
};

/** Priority reads as a rank, so the glyph encodes order as well as the colour. */
const PRIORITY_GLYPH: Record<Priority, string> = {
  LOW: '▾', MEDIUM: '▸', HIGH: '▴', URGENT: '⚠',
};

export function PriorityBadge({ priority, size }: { priority: Priority; size?: 'sm' | 'md' }) {
  return (
    <Badge tone={PRIORITY_TONE[priority]} size={size} icon={<span aria-hidden="true">{PRIORITY_GLYPH[priority]}</span>}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

const SEVERITY_TONE: Record<Severity, BadgeTone> = {
  S1: 'critical', S2: 'serious', S3: 'warning', S4: 'neutral',
};

export function SeverityBadge({ severity, size }: { severity: Severity; size?: 'sm' | 'md' }) {
  return <Badge tone={SEVERITY_TONE[severity]} dot size={size}>{SEVERITY_LABEL[severity]}</Badge>;
}

const ISSUE_STATUS_TONE: Record<IssueStatus, BadgeTone> = {
  OPEN: 'critical', TRIAGED: 'warning', IN_PROGRESS: 'info',
  RESOLVED: 'good', CLOSED: 'neutral', WONT_FIX: 'neutral',
};

export function IssueStatusBadge({ status, size }: { status: IssueStatus; size?: 'sm' | 'md' }) {
  return <Badge tone={ISSUE_STATUS_TONE[status]} dot size={size}>{ISSUE_STATUS_LABEL[status]}</Badge>;
}

const REVIEW_STATUS_TONE: Record<ReviewStatus, BadgeTone> = {
  OPEN: 'info', APPROVED: 'good', CHANGES_REQUESTED: 'serious',
  MERGED: 'accent', CLOSED: 'neutral',
};

export function ReviewStatusBadge({ status, size }: { status: ReviewStatus; size?: 'sm' | 'md' }) {
  return <Badge tone={REVIEW_STATUS_TONE[status]} dot size={size}>{REVIEW_STATUS_LABEL[status]}</Badge>;
}

const DEPLOY_STATUS_TONE: Record<DeployStatus, BadgeTone> = {
  QUEUED: 'neutral', BUILDING: 'info', DEPLOYING: 'info',
  SUCCEEDED: 'good', FAILED: 'critical', ROLLED_BACK: 'serious',
};

export function DeployStatusBadge({ status, size }: { status: DeployStatus; size?: 'sm' | 'md' }) {
  return <Badge tone={DEPLOY_STATUS_TONE[status]} dot size={size}>{DEPLOY_STATUS_LABEL[status]}</Badge>;
}

const PROJECT_STATUS_TONE: Record<ProjectStatus, BadgeTone> = {
  PLANNING: 'info', ACTIVE: 'good', ON_HOLD: 'warning',
  COMPLETED: 'accent', ARCHIVED: 'neutral',
};

export function ProjectStatusBadge({ status, size }: { status: ProjectStatus; size?: 'sm' | 'md' }) {
  return <Badge tone={PROJECT_STATUS_TONE[status]} dot size={size}>{PROJECT_STATUS_LABEL[status]}</Badge>;
}

/** Monospace reference chip, e.g. `XSP-128`. */
export function Reference({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'font-mono text-2xs tracking-tight text-[var(--ink-muted)] tabular-nums',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small count pill, for unread badges and tab counters. */
export function Counter({ value, tone = 'neutral', max = 99 }: { value: number; tone?: BadgeTone; max?: number }) {
  if (value <= 0) return null;
  const { wash, ink } = TONES[tone];
  return (
    <span
      className="inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-[var(--radius-full)] px-1.5 text-2xs font-semibold tabular-nums"
      style={{ background: wash, color: ink }}
    >
      {value > max ? `${max}+` : value}
    </span>
  );
}
