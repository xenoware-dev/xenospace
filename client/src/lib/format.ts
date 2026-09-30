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
