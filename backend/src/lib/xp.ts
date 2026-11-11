import { db } from '../db/db.js';
import { issueRankCertificates } from './rankCertificates.js';
import { getRankTier, DIVISION_COUNT } from './ranks.js';

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

// Rune puzzles in the Builder's Quarry scale with the student's rank division so far —
// same difficulty ladder feel as worksheets, but keyed off overall progress rather
// than a manually chosen difficulty since the puzzle is triggered mid-play. The 18 divisions
// (lib/ranks.ts) are split into four stretches: Iron 1 to Bronze 2, Bronze 3 to Silver 3,
// Gold 1 to Platinum 2, and Platinum 3 and above.
export const CRAFT_PUZZLE_XP_BY_TIER = [5, 10, 15, 25] as const;
export function craftPuzzleTierForXp(totalXp: number): 1 | 2 | 3 | 4 {
  const { index } = getRankTier(totalXp);
  return (1 + Math.min(3, Math.floor((index * 4) / DIVISION_COUNT))) as 1 | 2 | 3 | 4;
}

// A student loses this much for every question they answer wrong (one left blank costs nothing), anywhere on the site: level quizzes, lesson
// quizzes, worksheets, boss fights, the Quarry rune puzzles and friend challenges. Small next to what a right answer pays (a quiz gives 1-3
// flat, a worksheet 5-20 per right answer), and never takes anyone below 0.
export const WRONG_ANSWER_XP = 1;

const roleAndXp = db.prepare(`SELECT role, total_xp FROM users WHERE id = ?`);
const addXp = db.prepare(`UPDATE users SET total_xp = total_xp + ? WHERE id = ?`);
const takeXp = db.prepare(`UPDATE users SET total_xp = total_xp - ? WHERE id = ?`);
const logXp = db.prepare(`INSERT INTO xp_events (user_id, amount, reason) VALUES (?,?,?)`);
const markRankDrop = db.prepare(`UPDATE users SET rank_drop_from = MAX(COALESCE(rank_drop_from, -1), ?) WHERE id = ?`);

/**
 * Remembers that a student's points fell far enough to lower their rank, so the demotion pop-up shows it (routes/auth.ts, rankDrop). The column
 * keeps the highest division they fell from since they last saw it, so several drops in a row show as one. Their frame and page colour follow
 * their rank, so they change with it; the pop-up is what shows that off.
 */
export function noteRankDrop(userId: number, xpBefore: number, xpAfter: number) {
  const before = getRankTier(xpBefore).index;
  if (getRankTier(xpAfter).index < before) markRankDrop.run(before, userId);
}

/** Takes WRONG_ANSWER_XP per wrong answer off a student (teachers and admins lose nothing); returns the points taken. Logged in the points history.
 *  Call it before awarding what the same submission earned: a rank and its certificate then follow the net result, not the moment in between. */
export function penalizeWrongAnswers(userId: number, wrongCount: number): number {
  if (wrongCount <= 0) return 0;
  const u = roleAndXp.get(userId) as { role: string; total_xp: number } | undefined;
  if (u?.role !== 'student') return 0;
  const lost = Math.min(wrongCount * WRONG_ANSWER_XP, u.total_xp);
  if (lost <= 0) return 0;
  takeXp.run(lost, userId);
  logXp.run(userId, -lost, 'wrong_answer');
  noteRankDrop(userId, u.total_xp, u.total_xp - lost);
  return lost;
}

/** Pays a student `amount` points and returns what was paid. Only students earn XP: a teacher makes the content and climbs their own ladder (teacher
 *  points, below) and an admin does not play, so a teacher watching a reel or taking its quiz simply earns nothing -- every point source routes through here. */
export function awardXp(userId: number, amount: number, reason: string): number {
  if (amount === 0) return 0;
  if ((roleAndXp.get(userId) as { role: string } | undefined)?.role !== 'student') return 0;
  logXp.run(userId, amount, reason);
  addXp.run(amount, userId);
  issueRankCertificates(userId);
  return amount;
}

// Teacher points are a separate currency from total_xp above, only ever held by teacher accounts, and counted from what the teacher has made rather
// than paid per action: TEACHER_POINTS_PER_REEL for every lesson of theirs with a video, TEACHER_POINTS_PER_LIKE for every like other people gave
// those lessons (their own like on their own lesson earns nothing), TEACHER_POINTS_PER_SOLVE for every student who solved a worksheet they sent --
// plus whatever an admin added or took away (the 'admin_adjust' rows, routes/admin.ts). syncTeacherPoints recounts after anything that moves one of
// those numbers and logs the difference in teacher_point_events, which is what the monthly teacher leaderboard adds up (routes/leaderboard.ts) -- so a
// like taken back or a lesson deleted takes its points back with it.
export const TEACHER_POINTS_PER_REEL = 20;
export const TEACHER_POINTS_PER_LIKE = 2;
export const TEACHER_POINTS_PER_SOLVE = 5;

const countTeacherReels = db.prepare(`SELECT COUNT(*) AS n FROM reels WHERE author_user_id = ? AND video_url IS NOT NULL`);
const countTeacherLikes = db.prepare(
  `SELECT COUNT(*) AS n FROM reels r JOIN reel_likes l ON l.reel_id = r.id WHERE r.author_user_id = ? AND l.user_id != r.author_user_id`
);
const countTeacherSolves = db.prepare(
  `SELECT COUNT(*) AS n FROM sent_worksheets s JOIN worksheet_attempts a ON a.sent_worksheet_id = s.id AND a.status = 'submitted' WHERE s.teacher_id = ?`
);
const teacherRow = db.prepare(`SELECT role, teacher_points FROM users WHERE id = ?`);
const adminAdjustedTeacherPoints = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS n FROM teacher_point_events WHERE user_id = ? AND reason = 'admin_adjust'`);
const logTeacherPoints = db.prepare(`INSERT INTO teacher_point_events (user_id, amount, reason) VALUES (?,?,?)`);
const setTeacherPoints = db.prepare(`UPDATE users SET teacher_points = ? WHERE id = ?`);

/** What a teacher has made: lessons with a video, likes from other people on them, and students' solves of the worksheets they sent. */
export function teacherCreatorStats(teacherId: number): { reels: number; likes: number; worksheetsSolved: number } {
  const count = (stmt: typeof countTeacherReels) => (stmt.get(teacherId) as { n: number }).n;
  return { reels: count(countTeacherReels), likes: count(countTeacherLikes), worksheetsSolved: count(countTeacherSolves) };
}

/** Recounts a teacher's points from teacherCreatorStats (see above) and logs the change, if any, under `reason`. Does nothing for anyone but a
 *  teacher, so a caller can pass a lesson's author without checking who that is. */
export function syncTeacherPoints(teacherId: number | null | undefined, reason: string) {
  if (!teacherId) return;
  const u = teacherRow.get(teacherId) as { role: string; teacher_points: number } | undefined;
  if (u?.role !== 'teacher') return;
  const s = teacherCreatorStats(teacherId);
  const adjusted = (adminAdjustedTeacherPoints.get(teacherId) as { n: number }).n;
  const target = Math.max(
    0,
    s.reels * TEACHER_POINTS_PER_REEL + s.likes * TEACHER_POINTS_PER_LIKE + s.worksheetsSolved * TEACHER_POINTS_PER_SOLVE + adjusted
  );
  const delta = target - (u.teacher_points ?? 0);
  if (delta === 0) return;
  logTeacherPoints.run(teacherId, delta, reason);
  setTeacherPoints.run(target, teacherId);
}

const maxCompletedLevel = db.prepare(
  `SELECT MAX(m.level_number) as maxLevel
   FROM user_level_progress p
   JOIN map_levels m ON p.map_level_id = m.id
   WHERE p.user_id = ? AND p.status = 'completed'`
);

/** The adventure-map level the student is currently on (highest completed + 1), capped at 50. */
export function getMapLevel(userId: number): number {
  const row = maxCompletedLevel.get(userId) as { maxLevel: number | null };
  const completedMax = row.maxLevel ?? 0;
  return Math.min(completedMax + 1, 50);
}

// A user's level grows with their points: everyone starts at level 1 and gains a level every 100 points (students, by total XP) or every
// 20 points (teachers, by teacher points, a smaller scale like their rank ladder in lib/ranks.ts). A rank division is 250 points wide
// (100 for teachers), so a division is two and a half levels.
export const POINTS_PER_LEVEL = 100;
export const TEACHER_POINTS_PER_LEVEL = 20;

export function getLevelInfo(userId: number): { level: number; progress: number } {
  const u = db.prepare(`SELECT role, total_xp, teacher_points FROM users WHERE id = ?`).get(userId) as
    | { role: string; total_xp: number; teacher_points: number }
    | undefined;
  if (!u) return { level: 1, progress: 0 };
  const teacher = u.role === 'teacher';
  const points = Math.max(0, teacher ? u.teacher_points : u.total_xp);
  const per = teacher ? TEACHER_POINTS_PER_LEVEL : POINTS_PER_LEVEL;
  return { level: 1 + Math.floor(points / per), progress: (points % per) / per };
}

/** The user's level, from their points (see above). */
export function getPlayerLevel(userId: number): number {
  return getLevelInfo(userId).level;
}
