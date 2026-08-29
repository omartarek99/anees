import { db } from '../db/db.js';

export const WORKSHEET_XP_PER_CORRECT: Record<'easy' | 'medium' | 'hard', number> = {
  easy: 5,
  medium: 10,
  hard: 20,
};

export const BOSS_DEFEAT_XP_BONUS = 300;
export const BOSS_PASS_RATIO = 0.7;

// Reels award a small amount of XP for genuine watch time, on top of the quiz XP — capped at
// the reel's own duration so leaving a tab open can't be farmed for endless XP.
export const WATCH_XP_PER_SECOND = 0.2; // 1 XP per 5 seconds watched

// Rune puzzles in the Builder's Quarry scale with the student's total XP so far —
// same difficulty ladder feel as worksheets, but keyed off overall progress rather
// than a manually chosen difficulty since the puzzle is triggered mid-play.
export const CRAFT_PUZZLE_XP_BY_TIER = [5, 10, 15, 25] as const;
export function craftPuzzleTierForXp(totalXp: number): 1 | 2 | 3 | 4 {
  if (totalXp < 200) return 1;
  if (totalXp < 800) return 2;
  if (totalXp < 2000) return 3;
  return 4;
}

export function awardXp(userId: number, amount: number, reason: string) {
  if (amount === 0) return;
  db.prepare(`INSERT INTO xp_events (user_id, amount, reason) VALUES (?,?,?)`).run(userId, amount, reason);
  db.prepare(`UPDATE users SET total_xp = total_xp + ? WHERE id = ?`).run(amount, userId);
}

/** "Player level" = the map level the student is currently on (highest completed + 1), capped at 50. */
export function getPlayerLevel(userId: number): number {
  const row = db
    .prepare(
      `SELECT MAX(m.level_number) as maxLevel
       FROM user_level_progress p
       JOIN map_levels m ON p.map_level_id = m.id
       WHERE p.user_id = ? AND p.status = 'completed'`
    )
    .get(userId) as { maxLevel: number | null };
  const completedMax = row.maxLevel ?? 0;
  return Math.min(completedMax + 1, 50);
}
