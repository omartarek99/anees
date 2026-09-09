/** A timed ban auto-expires by comparison, not by a background job clearing the column --
 * `banned_until` in the past (or unset) simply means "not currently banned". Shared by the
 * auth middleware/login route (to enforce it) and the admin routes (to display it). */
export function isCurrentlyBanned(bannedUntil: string | null | undefined): boolean {
  return !!bannedUntil && new Date(bannedUntil).getTime() > Date.now();
}
