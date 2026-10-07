/** Formatting helpers. Centralised so dates and numbers read the same everywhere. */

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * Human relative time: "just now", "4 min ago", "yesterday".
 *
 * Switches to an absolute date beyond a week, where "13 days ago" is less
 * useful than the date itself.
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';

  const diffSeconds = Math.round((then - Date.now()) / 1000);
  const absolute = Math.abs(diffSeconds);

  if (absolute < 45) return 'just now';
  if (absolute < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (absolute < 86_400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (absolute < 7 * 86_400) return rtf.format(Math.round(diffSeconds / 86_400), 'day');
  return shortDate(iso);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function longDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function timeOfDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${shortDate(iso)}, ${timeOfDay(iso)}`;
}

/** `YYYY-MM-DD` for a date input, in local time rather than UTC. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function toDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/** Days until a date; negative when it has passed. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - startOfToday.getTime()) / 86_400_000);
}

/** Due-date copy with the urgency the UI colours from. */
export function dueLabel(iso: string | null | undefined): { text: string; tone: 'overdue' | 'today' | 'soon' | 'later' | 'none' } {
  const days = daysUntil(iso);
  if (days === null) return { text: 'No due date', tone: 'none' };
  if (days < 0) return { text: days === -1 ? '1 day overdue' : `${Math.abs(days)} days overdue`, tone: 'overdue' };
  if (days === 0) return { text: 'Due today', tone: 'today' };
  if (days === 1) return { text: 'Due tomorrow', tone: 'soon' };
  if (days <= 7) return { text: `Due in ${days} days`, tone: 'soon' };
  return { text: `Due ${shortDate(iso)}`, tone: 'later' };
}

export function duration(minutes: number): string {
  if (minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function seconds(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value < 60) return `${value}s`;
  const mins = Math.floor(value / 60);
  const rest = value % 60;
  return rest === 0 ? `${mins}m` : `${mins}m ${rest}s`;
}

/** Compact counts: 1200 → "1.2k". Keeps badges from blowing out their width. */
export function compactNumber(value: number): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

export function number(value: number): string {
  return new Intl.NumberFormat('en').format(value);
}

export function percent(value: number): string {
  return `${Math.round(value)}%`;
}

export function bytes(value: number): string {
  if (value === 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / 1024 ** exponent;
  return `${scaled.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

/** Initials for an avatar: first and last word, at most two letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[words.length - 1]![0]}`.toUpperCase();
}

export function shortSha(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 7) : '—';
}

/** Pluralises by count: `pluralise(1, 'task')` → "1 task". */
export function pluralise(count: number, singular: string, plural?: string): string {
  return `${number(count)} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
