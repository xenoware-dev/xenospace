import { parse, startOfDay } from 'date-fns'

export function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function formatRole(role: string) {
  return role
    .split('_')
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(' ')
}

/** Compact notation for display numbers: 1,284 / 12.9K / 4.2M. */
export function formatCompact(value: number) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatSignedPercent(value: number) {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}%`
}

/**
 * A `yyyy-MM-dd` date input back into an ISO timestamp. `new Date('2026-09-30')`
 * is parsed as *UTC* midnight, which every date on screen then reads back a day
 * early west of Greenwich; the calendar makes that drift visible as a chip in
 * the wrong cell. Parsing the day locally and sending its own midnight keeps
 * what was picked and what is shown in step.
 */
export function fromDateInput(value: string) {
  return value ? startOfDay(parse(value, 'yyyy-MM-dd', new Date())).toISOString() : null
}
