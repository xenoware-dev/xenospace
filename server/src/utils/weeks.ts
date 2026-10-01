/**
 * Week bucketing for the rolling trends on the dashboard and the admin
 * overview. Weeks are computed in UTC and start on Monday, so the boundaries
 * here line up with what `$dateTrunc: { unit: 'week', startOfWeek: 'monday' }`
 * produces inside an aggregation.
 */

/** How many weeks a rolling trend covers. */
export const TREND_WEEKS = 12

export function startOfUtcWeek(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = start.getUTCDay() || 7
  start.setUTCDate(start.getUTCDate() - (weekday - 1))
  return start
}

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

/** The last `weeks` week-start dates, oldest first, ending with the current week. */
export function recentWeekStarts(weeks = TREND_WEEKS) {
  const current = startOfUtcWeek(new Date())
  return Array.from({ length: weeks }, (_, index) => addUtcDays(current, (index - (weeks - 1)) * 7))
}

/** A stable map key for a week-start date. */
export const weekKey = (date: Date) => date.toISOString().slice(0, 10)

/**
 * Aligns `{ _id: <week start>, count }` aggregation rows onto `weeks`,
 * zero-filling the weeks nothing landed in.
 */
export function alignWeekly(rows: { _id: Date; count: number }[], weeks: Date[]) {
  const byWeek = new Map(rows.map((row) => [weekKey(row._id), row.count]))
  return weeks.map((week) => byWeek.get(weekKey(week)) ?? 0)
}
