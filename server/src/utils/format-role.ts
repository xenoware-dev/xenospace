/** `TEAM_LEAD` → `Team Lead`, for prose written into an audit entry. */
export function formatRole(role: string) {
  return role
    .split('_')
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(' ')
}
