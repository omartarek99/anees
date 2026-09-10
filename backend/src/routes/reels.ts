import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { awardXp, getPlayerLevel, WATCH_XP_PER_SECOND } from '../lib/xp.js';
import { gradeAnswers } from '../lib/grading.js';

export const reelsRouter = Router();

// Level 1 starts available for every account from the moment it exists, even before any
// progress row has been written for it (matches GET /map's own fallback, backend/src/routes/map.ts)
// -- this covers accounts created before the signup route seeded this row (or any other
// gap), not just the happy path where the row already exists.
function getProgress(userId: number, level: { id: number; level_number: number }): any {
  const row = db
    .prepare(`SELECT * FROM user_level_progress WHERE user_id = ? AND map_level_id = ?`)
    .get(userId, level.id) as any;
  if (row) return row;
  if (level.level_number === 1) return { status: 'available', stars: 0, best_score: 0 };
  return null;
}

function loadAuthor(
  userId: number | null
): { username: string; displayName: string; avatarKey: string; avatarUrl: string | null } | null {
  if (!userId) return null;
  const row = db.prepare(`SELECT username, display_name, avatar_key, avatar_url FROM users WHERE id = ?`).get(userId) as
    | { username: string; display_name: string; avatar_key: string; avatar_url: string | null }
    | undefined;
  if (!row) return null;
  return { username: row.username, displayName: row.display_name, avatarKey: row.avatar_key, avatarUrl: row.avatar_url };
}

function loadQuestions(reelId: number) {
  const questions = db
    .prepare(
      `SELECT id, question_text, question_text_ar, choices_json, choices_json_ar, order_in_reel FROM reel_questions WHERE reel_id = ? ORDER BY order_in_reel`
    )
    .all(reelId) as any[];
  return questions.map((q) => ({
    id: q.id,
    text: q.question_text,
    textAr: q.question_text_ar,
    choices: JSON.parse(q.choices_json),
    choicesAr: JSON.parse(q.choices_json_ar),
    order: q.order_in_reel,
  }));
}

// Returns every currently-playable reel (unlocked normal levels, plus any grade-based
// teacher reels matching the caller's own grade) in one response — the frontend used to
// fetch /map, then fire one /reels/level/:n request per unlocked level in parallel (N+1
// round trips just to render the feed, and again every time a level completed). This does
// the same join+filter /map already does, then gathers each level's reels/questions
// in-process (still N small synchronous SQLite calls, but zero extra HTTP round trips).
reelsRouter.get('/feed', requireAuth, (req, res) => {
  const levels = db
    .prepare(`SELECT * FROM map_levels WHERE kind = 'normal' AND status = 'ready' ORDER BY level_number`)
    .all() as any[];
  const progressRows = db.prepare(`SELECT * FROM user_level_progress WHERE user_id = ?`).all(req.userId!) as any[];
  const progressByLevelId = new Map(progressRows.map((p) => [p.map_level_id, p]));

  const feed: any[] = [];

  for (const level of levels) {
    const progress = progressByLevelId.get(level.id) ??
      (level.level_number === 1 ? { status: 'available', stars: 0, best_score: 0 } : null);
    if (!progress || progress.status === 'locked') continue;

    // grade IS NULL excludes grade-based reels that happen to be parked on this level's
    // id as a schema placeholder (see teacherReels.ts) -- those are appended separately
    // below, not tied to any specific map level.
    const reels = db
      .prepare(`SELECT * FROM reels WHERE map_level_id = ? AND grade IS NULL ORDER BY order_in_level`)
      .all(level.id) as any[];
    if (reels.length === 0) continue;
    const subject = db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(level.subject_id) as any;

    for (const reel of reels) {
      feed.push({
        comingSoon: false,
        level: { levelNumber: level.level_number, title: level.title, titleAr: level.title_ar, kind: level.kind },
        subject: { key: subject.key, name: subject.name, nameAr: subject.name_ar, icon: subject.icon },
        reel: {
          id: reel.id,
          title: reel.title,
          titleAr: reel.title_ar,
          scriptText: reel.script_text,
          scriptTextAr: reel.script_text_ar,
          videoUrl: reel.video_url,
          durationSec: reel.duration_sec,
          author: loadAuthor(reel.author_user_id),
          questions: loadQuestions(reel.id),
        },
        progress: { status: progress.status, stars: progress.stars, bestScore: progress.best_score },
      });
    }
  }

  // Grade-based teacher lessons, decoupled from the map/level system entirely -- every reel
  // tagged with the caller's own grade, always available (nothing to unlock, no lock state).
  // Teachers don't set a grade at signup, so grade-matching alone would show them nothing --
  // a teacher also sees any grade-based lesson they authored themselves, so they can find
  // and preview what they just published. Deduplicated by reel id since a teacher previewing
  // their own reel could otherwise match both clauses.
  const user = db.prepare(`SELECT grade FROM users WHERE id = ?`).get(req.userId!) as { grade: number | null };
  const gradeReelsById = new Map<number, any>();
  if (user?.grade) {
    for (const reel of db.prepare(`SELECT * FROM reels WHERE grade = ? ORDER BY id`).all(user.grade) as any[]) {
      gradeReelsById.set(reel.id, reel);
    }
  }
  for (const reel of db
    .prepare(`SELECT * FROM reels WHERE grade IS NOT NULL AND author_user_id = ? ORDER BY id`)
    .all(req.userId!) as any[]) {
    gradeReelsById.set(reel.id, reel);
  }
  for (const reel of gradeReelsById.values()) {
    const subject = db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(reel.subject_id) as any;
    feed.push({
      comingSoon: false,
      level: { levelNumber: -reel.id, title: 'Grade Lesson', titleAr: null, kind: 'normal' },
      subject: { key: subject.key, name: subject.name, nameAr: subject.name_ar, icon: subject.icon },
      reel: {
        id: reel.id,
        title: reel.title,
        titleAr: reel.title_ar,
        scriptText: reel.script_text,
        scriptTextAr: reel.script_text_ar,
        videoUrl: reel.video_url,
        durationSec: reel.duration_sec,
        author: loadAuthor(reel.author_user_id),
        questions: loadQuestions(reel.id),
      },
      progress: { status: 'available', stars: 0, bestScore: 0 },
    });
  }

  res.json(feed);
});

reelsRouter.get('/level/:levelNumber', requireAuth, (req, res) => {
  const levelNumber = Number(req.params.levelNumber);
  const level = db.prepare(`SELECT * FROM map_levels WHERE level_number = ?`).get(levelNumber) as any;
  if (!level) {
    res.status(404).json({ error: 'Level not found.' });
    return;
  }
  if (level.status !== 'ready') {
    res.json({ comingSoon: true, level: { levelNumber: level.level_number, title: level.title, titleAr: level.title_ar } });
    return;
  }
  const progress = getProgress(req.userId!, level);
  if (!progress || progress.status === 'locked') {
    res.status(403).json({ error: 'This level is locked. Complete the previous level first.' });
    return;
  }

  // grade IS NULL excludes grade-based reels that happen to be parked on this level's id
  // as a schema placeholder (see teacherReels.ts) -- those surface via GET /feed instead,
  // not through any specific map level.
  const reels = db
    .prepare(`SELECT * FROM reels WHERE map_level_id = ? AND grade IS NULL ORDER BY order_in_level`)
    .all(level.id) as any[];
  if (reels.length === 0) {
    res.status(404).json({ error: 'No lesson found for this level.' });
    return;
  }
  const subject = db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(level.subject_id) as any;

  res.json({
    comingSoon: false,
    level: { levelNumber: level.level_number, title: level.title, titleAr: level.title_ar, kind: level.kind },
    subject: { key: subject.key, name: subject.name, nameAr: subject.name_ar, icon: subject.icon },
    reels: reels.map((reel) => ({
      id: reel.id,
      title: reel.title,
      titleAr: reel.title_ar,
      scriptText: reel.script_text,
      scriptTextAr: reel.script_text_ar,
      videoUrl: reel.video_url,
      durationSec: reel.duration_sec,
      author: loadAuthor(reel.author_user_id),
      questions: loadQuestions(reel.id),
    })),
    progress: { status: progress.status, stars: progress.stars, bestScore: progress.best_score },
  });
});

const watchSchema = z.object({
  seconds: z.number().min(0).max(300),
});

// Reports a batch of genuine watch-time seconds (sent periodically by the player while a
// reel is actively in view). XP accrues at WATCH_XP_PER_SECOND, capped at the reel's own
// duration so nobody can farm XP by leaving a tab open past the lesson's length.
reelsRouter.post('/:reelId/watch', requireAuth, requireCsrfHeader, validateBody(watchSchema), (req, res) => {
  const reelId = Number(req.params.reelId);
  const reel = db.prepare(`SELECT * FROM reels WHERE id = ?`).get(reelId) as any;
  if (!reel) {
    res.status(404).json({ error: 'Lesson not found.' });
    return;
  }
  // Grade-based reels have no map level to lock behind -- always allowed.
  if (!reel.grade) {
    const level = db.prepare(`SELECT * FROM map_levels WHERE id = ?`).get(reel.map_level_id) as any;
    const progress = getProgress(req.userId!, level);
    if (!progress || progress.status === 'locked') {
      res.status(403).json({ error: 'This level is locked.' });
      return;
    }
  }

  const { seconds } = req.body as { seconds: number };
  const durationCap = reel.duration_sec as number;

  const existing = db
    .prepare(`SELECT * FROM reel_watch_progress WHERE user_id = ? AND reel_id = ?`)
    .get(req.userId!, reelId) as any;
  const priorWatched = existing?.watched_seconds ?? 0;
  const priorXp = existing?.xp_awarded ?? 0;

  const newWatched = Math.min(durationCap, priorWatched + Math.max(0, seconds));
  const newXpTotal = Math.floor(newWatched * WATCH_XP_PER_SECOND);
  const xpDelta = Math.max(0, newXpTotal - priorXp);

  if (existing) {
    db.prepare(`UPDATE reel_watch_progress SET watched_seconds = ?, xp_awarded = ?, updated_at = datetime('now') WHERE id = ?`).run(
      newWatched,
      priorXp + xpDelta,
      existing.id
    );
  } else {
    db.prepare(`INSERT INTO reel_watch_progress (user_id, reel_id, watched_seconds, xp_awarded) VALUES (?,?,?,?)`).run(
      req.userId!,
      reelId,
      newWatched,
      xpDelta
    );
  }

  if (xpDelta > 0) awardXp(req.userId!, xpDelta, 'reel_watch');

  res.json({ watchedSeconds: newWatched, xpEarned: xpDelta, totalWatchXp: priorXp + xpDelta });
});

const submitSchema = z.object({
  answers: z.array(z.object({ questionId: z.number(), choiceIndex: z.number().min(0).max(3) })),
});

reelsRouter.post('/:reelId/submit', requireAuth, requireCsrfHeader, validateBody(submitSchema), (req, res) => {
  const reelId = Number(req.params.reelId);
  const reel = db.prepare(`SELECT * FROM reels WHERE id = ?`).get(reelId) as any;
  if (!reel) {
    res.status(404).json({ error: 'Lesson not found.' });
    return;
  }

  // Grade-based reels have no map level to lock behind or complete.
  const isGradeReel = !!reel.grade;
  const level = isGradeReel ? null : (db.prepare(`SELECT * FROM map_levels WHERE id = ?`).get(reel.map_level_id) as any);
  const progress = isGradeReel ? null : getProgress(req.userId!, level);
  if (!isGradeReel && (!progress || progress.status === 'locked')) {
    res.status(403).json({ error: 'This level is locked.' });
    return;
  }

  const questions = db.prepare(`SELECT * FROM reel_questions WHERE reel_id = ?`).all(reelId) as any[];
  const { answers } = req.body as { answers: { questionId: number; choiceIndex: number }[] };

  const { results, correctCount } = gradeAnswers(questions, answers);
  let xpEarned = results.reduce((sum, r, i) => sum + (r.isCorrect ? questions[i].xp_value : 0), 0);

  const total = questions.length;
  const scoreRatio = total > 0 ? correctCount / total : 0;
  const stars = scoreRatio === 1 ? 3 : scoreRatio >= 0.75 ? 2 : scoreRatio >= 0.5 ? 1 : 0;

  // Quiz XP is only awarded the first time a lesson is completed — retaking it (e.g.
  // while looping through the endless reels feed for review) still shows correct/wrong
  // feedback and can improve stars, but can't be replayed for repeat XP. Map-level
  // reels track this via user_level_progress.status; grade-based reels (no level) use
  // reel_watch_progress.quiz_completed instead.
  const watchRow = isGradeReel
    ? (db.prepare(`SELECT * FROM reel_watch_progress WHERE user_id = ? AND reel_id = ?`).get(req.userId!, reelId) as any)
    : null;
  const alreadyCompleted = isGradeReel ? !!watchRow?.quiz_completed : progress.status === 'completed';
  if (alreadyCompleted) xpEarned = 0;

  const levelBeforeXp = getPlayerLevel(req.userId!);
  if (xpEarned > 0) awardXp(req.userId!, xpEarned, 'reel_quiz');

  if (isGradeReel) {
    if (watchRow) {
      db.prepare(`UPDATE reel_watch_progress SET quiz_completed = 1 WHERE id = ?`).run(watchRow.id);
    } else {
      db.prepare(`INSERT INTO reel_watch_progress (user_id, reel_id, quiz_completed) VALUES (?,?,1)`).run(req.userId!, reelId);
    }
    const levelAfterXpGrade = getPlayerLevel(req.userId!);
    res.json({
      results,
      correctCount,
      total,
      xpEarned,
      stars,
      leveledUp: levelAfterXpGrade > levelBeforeXp,
      newPlayerLevel: levelAfterXpGrade,
    });
    return;
  }

  const nowStars = Math.max(stars, progress.stars ?? 0);
  const bestScore = Math.max(correctCount, progress.best_score ?? 0);

  // Upsert, not a plain UPDATE: level 1 may not have a row yet for accounts predating
  // signup's own progress-seeding (getProgress's virtual fallback covers reads, but
  // writes still need a real row to land in).
  db.prepare(
    `INSERT INTO user_level_progress (user_id, map_level_id, status, stars, best_score, completed_at)
     VALUES (?, ?, 'completed', ?, ?, datetime('now'))
     ON CONFLICT(user_id, map_level_id) DO UPDATE SET
       status = 'completed', stars = excluded.stars, best_score = excluded.best_score, completed_at = excluded.completed_at`
  ).run(req.userId!, level.id, nowStars, bestScore);

  // Unlock the next map level (or boss) so the student can keep progressing.
  const nextLevel = db.prepare(`SELECT * FROM map_levels WHERE level_number = ?`).get(level.level_number + 1) as any;
  if (nextLevel) {
    const existing = getProgress(req.userId!, nextLevel);
    if (!existing) {
      db.prepare(`INSERT INTO user_level_progress (user_id, map_level_id, status) VALUES (?,?,'available')`).run(
        req.userId!,
        nextLevel.id
      );
    } else if (existing.status === 'locked') {
      db.prepare(`UPDATE user_level_progress SET status = 'available' WHERE id = ?`).run(existing.id);
    }
  }

  const levelAfterXp = getPlayerLevel(req.userId!);

  res.json({
    results,
    correctCount,
    total,
    xpEarned,
    stars,
    leveledUp: levelAfterXp > levelBeforeXp,
    newPlayerLevel: levelAfterXp,
  });
});
