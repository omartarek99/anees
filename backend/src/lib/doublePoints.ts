import crypto from 'node:crypto';

// Quiz points double for a 10-minute window that lands somewhere different within every
// clock hour -- picked deterministically from the hour itself (a hash of its UTC
// year/month/day/hour) rather than stored anywhere, so every request during that hour
// (from any user, any server instance) agrees on the exact same window with no shared
// state or background job needed, and it's genuinely unpredictable from one hour to the
// next without needing an actual random-number generator call per request.
const WINDOW_MINUTES = 10;
export const DOUBLE_POINTS_MULTIPLIER = 2;

function hourKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}-${date.getUTCHours()}`;
}

function startMinuteForHour(date: Date): number {
  const hash = crypto.createHash('sha256').update(hourKey(date)).digest();
  // 0..50 inclusive -- keeps the full 10-minute window inside the same hour.
  return hash[0] % (60 - WINDOW_MINUTES + 1);
}

export type DoublePointsStatus = {
  active: boolean;
  /** Stable id for "this specific window" (changes every hour) -- lets a client tell a
   * freshly-dismissed notification apart from a brand new hour's window. */
  windowId: string;
  secondsRemaining: number;
  secondsUntilNext: number;
};

export function getDoublePointsStatus(now: Date = new Date()): DoublePointsStatus {
  const startMinute = startMinuteForHour(now);
  const endMinute = startMinute + WINDOW_MINUTES;
  const nowSecondsIntoHour = now.getUTCMinutes() * 60 + now.getUTCSeconds();
  const startSeconds = startMinute * 60;
  const endSeconds = endMinute * 60;
  const active = nowSecondsIntoHour >= startSeconds && nowSecondsIntoHour < endSeconds;

  return {
    active,
    windowId: hourKey(now),
    secondsRemaining: active ? endSeconds - nowSecondsIntoHour : 0,
    secondsUntilNext: active ? 0 : nowSecondsIntoHour < startSeconds ? startSeconds - nowSecondsIntoHour : 3600 - nowSecondsIntoHour + startSeconds,
  };
}
