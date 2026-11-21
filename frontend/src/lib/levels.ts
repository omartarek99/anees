// What a student's level opens. Mirrors UNLOCK_LEVEL in backend/src/lib/levels.ts (the server refuses the locked pages too).
export const UNLOCK_LEVEL = { ranks: 1, leaderboard: 1, map: 10, quarry: 20 } as const;
export type Feature = keyof typeof UNLOCK_LEVEL;
export const MAX_LEVEL = 70;

/** Points at which ranks start: reaching level 10 (backend lib/levels.ts xpAtLevel(10)). */
export const RANK_START_XP = 810;

/** The level a student still needs for a feature, or null when it is open (or the user is not a student). */
export function lockedUntil(user: { role: string; playerLevel: number } | null | undefined, feature: Feature): number | null {
  if (!user || user.role !== 'student') return null;
  return user.playerLevel < UNLOCK_LEVEL[feature] ? UNLOCK_LEVEL[feature] : null;
}
