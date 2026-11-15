// A student's account level, from their total points: level 1 to MAX_LEVEL, each level a little more work than the one before
// (level L to L + 1 takes 50 + 10 x (L - 1) points: 50, 60, 70, ... 730 for 69 to 70). Mirrored by frontend/src/lib/levels.ts.
// Teachers keep their own flat scale (lib/xp.ts TEACHER_POINTS_PER_LEVEL).
export const MAX_LEVEL = 70;

/** Points from level `level` to the next. */
export const pointsToNext = (level: number) => 50 + 10 * (level - 1);

/** Total points at which a level starts (level 1 at 0, level 10 at 810, level 20 at 2660, level 70 at 26910). */
export function xpAtLevel(level: number): number {
  const l = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return 50 * (l - 1) + 5 * (l - 1) * (l - 2);
}

/** Where total points put a student: the level, how far into it, and how many points the next one needs (null at the cap). */
export function levelForXp(totalXp: number) {
  const xp = Math.max(0, totalXp);
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpAtLevel(level + 1)) level++;
  const start = xpAtLevel(level);
  const need = level < MAX_LEVEL ? pointsToNext(level) : null;
  return { level, xpIntoLevel: xp - start, xpForNext: need, progress: need ? (xp - start) / need : 1 };
}

// What a student's level opens. Before level 10 a new student has the lessons (reels), worksheets, friends and their profile;
// level 10 brings ranks, the leaderboard and the adventure map, and level 20 the Builder's Quarry.
export const UNLOCK_LEVEL = { ranks: 10, leaderboard: 10, map: 10, quarry: 20 } as const;
export type Feature = keyof typeof UNLOCK_LEVEL;

/** The points at which ranks start (Iron 1): reaching level 10. */
export const RANK_START_XP = xpAtLevel(UNLOCK_LEVEL.ranks);
