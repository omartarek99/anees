import { db } from '../db/db.js';

export const WORKSHEET_XP_PER_CORRECT: Record<'easy' | 'medium' | 'hard', number> = {
  easy: 5,
  medium: 10,
  hard: 20,
};

export const BOSS_DEFEAT_XP_BONUS = 300;
export const BOSS_PASS_RATIO = 0.7;

// Reels award flat points per watch-through, not continuous per-second XP -- reaching the
// halfway mark of a reel pays VIDEO_HALF_WATCH_POINTS, finishing it pays
// VIDEO_FULL_WATCH_POINTS instead (not both -- the fuller tier supersedes the half tier for
// that same watch-through). Repeatable: looping/rewatching the same reel again pays out
// again on each fresh watch-through (see routes/reels.ts POST /:reelId/watch).
export const VIDEO_HALF_WATCH_POINTS = 1;
export const VIDEO_FULL_WATCH_POINTS = 2;

// Quiz points are flat per submission (every submission, not just the first -- see
// routes/reels.ts POST /:reelId/submit), based only on pass/fail at the 50% line, not on
// exactly how many questions were right.
export const QUIZ_PASS_POINTS = 3;
export const QUIZ_FAIL_POINTS = 1;

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

// Teacher points are a separate currency from total_xp above, only ever earned by
// teacher accounts -- printing a worksheet (routes/worksheets.ts POST /print) and
// uploading a lesson video (routes/teacherReels.ts POST /:id/video) are the only two
// sources, driving the teacher-only leaderboard (routes/leaderboard.ts).
export const TEACHER_PRINT_POINTS = 10;
export const TEACHER_VIDEO_POINTS_PER_30S = 10;
// A video only ever earns points for its first 90 seconds -- a 10-minute lesson video
// earns exactly as much as a 90-second one (30 points), not proportionally more.
export const TEACHER_VIDEO_MAX_COUNTED_SECONDS = 90;

export function awardTeacherPoints(userId: number, amount: number, reason: string) {
  if (amount === 0) return;
  db.prepare(`INSERT INTO teacher_point_events (user_id, amount, reason) VALUES (?,?,?)`).run(userId, amount, reason);
  db.prepare(`UPDATE users SET teacher_points = teacher_points + ? WHERE id = ?`).run(amount, userId);
}

/** 10 points per full 30-second chunk of video, counting at most
 * TEACHER_VIDEO_MAX_COUNTED_SECONDS of the actual duration (so max 30 points/upload). */
export function teacherVideoUploadPoints(durationSeconds: number): number {
  const counted = Math.min(durationSeconds, TEACHER_VIDEO_MAX_COUNTED_SECONDS);
  return Math.floor(counted / 30) * TEACHER_VIDEO_POINTS_PER_30S;
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
