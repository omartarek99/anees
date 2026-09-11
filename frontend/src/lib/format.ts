/** "1h 12m", "5m 30s", "42s" -- used by the admin and teacher watch-time reports. Rounds
 * down to whole seconds (the backend already rounds before sending, see routes/admin.ts /
 * teacherReels.ts) and always shows at most two units. */
export function formatWatchTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}
