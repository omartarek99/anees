import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { awardXp, getPlayerLevel, VIDEO_HALF_WATCH_POINTS, VIDEO_FULL_WATCH_POINTS, QUIZ_PASS_POINTS, QUIZ_FAIL_POINTS } from '../lib/xp.js';
import { gradeAnswers } from '../lib/grading.js';
import { getDoublePointsStatus, DOUBLE_POINTS_MULTIPLIER } from '../lib/doublePoints.js';

export const reelsRouter = Router();

// Polled by the frontend (see DoublePointsNotification.tsx) to pop up a notification the
// moment the hour's random double-points window opens, without needing any push mechanism.
reelsRouter.get('/double-points-status', requireAuth, (_req, res) => {
  res.json(getDoublePointsStatus());
});

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

// Matches ReelSlide.tsx's flush cadence (a heartbeat roughly every WATCH_HEARTBEAT_SECONDS
// while a reel is actively in view, see its own comment) plus slack for request latency and
// the tail-end flush on scroll-away/unmount -- not a round number chosen for looks.
const MAX_SECONDS_PER_CALL = 15;
// Same slack, applied to the *elapsed-time* check below -- see its comment.
const ELAPSED_TIME_SLACK_SECONDS = 5;

const watchSchema = z.object({
  seconds: z.number().min(0).max(MAX_SECONDS_PER_CALL),
});

// Reports a batch of genuine watch-time seconds (sent periodically by the player while a
// reel is actively in view). Points are flat per watch-through, not continuous per second:
// reaching the halfway mark of THIS watch-through pays VIDEO_HALF_WATCH_POINTS, reaching 80%
// pays VIDEO_FULL_WATCH_POINTS instead (not on top of the half tier already paid this same
// watch-through) -- then rolls over so a fresh rewatch/loop earns again.
//
// The client self-reports `seconds` -- a hand-crafted request (real cookie/CSRF header,
// forged body) could otherwise claim MAX_SECONDS_PER_CALL repeatedly with no real waiting,
// draining every reel's watch-point tiers in one instant. The one thing a forged request
// can't fake is *when* the server received it: crediting a call for at most the real
// wall-clock time elapsed since the previous credited call (`updated_at`, small slack for
// latency) means spamming requests doesn't help -- two calls a second apart can jointly
// credit at most ~1 second of watch time, no matter what `seconds` either one claims.
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

  const { seconds: reportedSeconds } = req.body as { seconds: number };
  const durationCap = Math.max(1, reel.duration_sec as number);
  // Full points now trigger at 80% watched, not 100% -- a student who watches nearly all
  // of a reel shouldn't be denied the full tier over the last fifth of it. The half tier
  // stays at the literal halfway point, unchanged.
  const fullTierThreshold = durationCap * 0.8;
  const halfTierThreshold = durationCap * 0.5;

  const existing = db
    .prepare(`SELECT * FROM reel_watch_progress WHERE user_id = ? AND reel_id = ?`)
    .get(req.userId!, reelId) as any;

  // No prior row means this is the first credited call for this (user, reel) pair -- there's
  // no earlier timestamp to measure real elapsed time against yet, so it falls back to the
  // per-call cap alone (still MAX_SECONDS_PER_CALL, not the old 300s ceiling).
  const elapsedCap = existing
    ? Math.max(0, (Date.now() - new Date(`${existing.updated_at}Z`).getTime()) / 1000) + ELAPSED_TIME_SLACK_SECONDS
    : MAX_SECONDS_PER_CALL;
  const seconds = Math.max(0, Math.min(reportedSeconds, elapsedCap));

  const priorTotalWatched = existing?.watched_seconds ?? 0;
  const priorPoints = existing?.xp_awarded ?? 0;
  let loopWatched = (existing?.loop_watched_seconds ?? 0) + seconds;
  let loopTier = existing?.current_loop_tier ?? 0;
  let pointsDelta = 0;

  // A single call can span more than one full watch-through (e.g. a short reel, or a big
  // elapsed-time slack) -- the loop pays each completed watch-through its own full tier.
  while (loopWatched >= fullTierThreshold) {
    pointsDelta += VIDEO_FULL_WATCH_POINTS - loopTier * VIDEO_HALF_WATCH_POINTS;
    loopWatched -= fullTierThreshold;
    loopTier = 0;
  }
  if (loopTier === 0 && loopWatched >= halfTierThreshold) {
    pointsDelta += VIDEO_HALF_WATCH_POINTS;
    loopTier = 1;
  }

  const newTotalWatched = priorTotalWatched + seconds;
  if (existing) {
    db.prepare(
      `UPDATE reel_watch_progress
       SET watched_seconds = ?, xp_awarded = ?, loop_watched_seconds = ?, current_loop_tier = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(newTotalWatched, priorPoints + pointsDelta, loopWatched, loopTier, existing.id);
  } else {
    db.prepare(
      `INSERT INTO reel_watch_progress (user_id, reel_id, watched_seconds, xp_awarded, loop_watched_seconds, current_loop_tier)
       VALUES (?,?,?,?,?,?)`
    ).run(req.userId!, reelId, newTotalWatched, pointsDelta, loopWatched, loopTier);
  }

  // Timestamped log purely for the admin monthly watch-time chart (routes/admin.ts) --
  // reel_watch_progress only ever stores a running total, which can't say how much was
  // watched *in a given month*.
  if (seconds > 0) {
    db.prepare(`INSERT INTO reel_watch_seconds_events (user_id, seconds) VALUES (?,?)`).run(req.userId!, seconds);
  }

  if (pointsDelta > 0) awardXp(req.userId!, pointsDelta, 'reel_watch');

  res.json({ watchedSeconds: newTotalWatched, xpEarned: pointsDelta, totalWatchXp: priorPoints + pointsDelta });
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

  const total = questions.length;
  const scoreRatio = total > 0 ? correctCount / total : 0;
  const stars = scoreRatio === 1 ? 3 : scoreRatio >= 0.75 ? 2 : scoreRatio >= 0.5 ? 1 : 0;
  // Passing (for stars/level-unlock purposes) is "at least half" -- a separate, slightly
  // more generous threshold than the point award below, which pays the higher tier only
  // for a strict majority.
  const passedThisAttempt = scoreRatio >= 0.5;

  // Quiz points are flat per submission -- every submission earns them, not just the
  // first, unlike the old one-time-only XP model (repeat attempts are how a student
  // reaches the 50% needed to advance anyway).
  const doublePoints = getDoublePointsStatus();
  const basePoints = scoreRatio > 0.5 ? QUIZ_PASS_POINTS : QUIZ_FAIL_POINTS;
  const xpEarned = doublePoints.active ? basePoints * DOUBLE_POINTS_MULTIPLIER : basePoints;

  const watchRow = db.prepare(`SELECT * FROM reel_watch_progress WHERE user_id = ? AND reel_id = ?`).get(req.userId!, reelId) as any;

  const levelBeforeXp = getPlayerLevel(req.userId!);
  awardXp(req.userId!, xpEarned, 'reel_quiz');

  // passed_quiz is sticky -- once a reel has been passed at >=50%, a later poor retry
  // (e.g. reviewing the lesson again) never revokes that.
  const passedQuiz = passedThisAttempt || !!watchRow?.passed_quiz;
  if (watchRow) {
    db.prepare(`UPDATE reel_watch_progress SET quiz_completed = 1, passed_quiz = ? WHERE id = ?`).run(passedQuiz ? 1 : 0, watchRow.id);
  } else {
    db.prepare(`INSERT INTO reel_watch_progress (user_id, reel_id, quiz_completed, passed_quiz) VALUES (?,?,1,?)`).run(
      req.userId!,
      reelId,
      passedQuiz ? 1 : 0
    );
  }

  if (isGradeReel) {
    const levelAfterXpGrade = getPlayerLevel(req.userId!);
    res.json({
      results,
      correctCount,
      total,
      xpEarned,
      stars,
      doublePointsActive: doublePoints.active,
      leveledUp: levelAfterXpGrade > levelBeforeXp,
      newPlayerLevel: levelAfterXpGrade,
    });
    return;
  }

  const nowStars = Math.max(stars, progress.stars ?? 0);
  const bestScore = Math.max(correctCount, progress.best_score ?? 0);

  // The next level only unlocks once every one of THIS level's reels has been passed at
  // >=50% at least once (usually just this one reel, but a level can have several) --
  // not merely attempted. Sticky: a level already completed stays completed even if a
  // later review attempt on one of its reels scores under 50%.
  const levelReelIds = (db.prepare(`SELECT id FROM reels WHERE map_level_id = ? AND grade IS NULL`).all(level.id) as { id: number }[]).map(
    (r) => r.id
  );
  const passedReelCount = levelReelIds.length
    ? (
        db
          .prepare(
            `SELECT COUNT(*) as c FROM reel_watch_progress WHERE user_id = ? AND passed_quiz = 1 AND reel_id IN (${levelReelIds
              .map(() => '?')
              .join(',')})`
          )
          .get(req.userId!, ...levelReelIds) as { c: number }
      ).c
    : 0;
  const levelFullyPassed = progress.status === 'completed' || passedReelCount >= levelReelIds.length;
  const newStatus = levelFullyPassed ? 'completed' : 'available';

  // Upsert, not a plain UPDATE: level 1 may not have a row yet for accounts predating
  // signup's own progress-seeding (getProgress's virtual fallback covers reads, but
  // writes still need a real row to land in). completed_at only ever moves forward to
  // "now" when the level is newly/still fully passed -- never cleared by an under-50%
  // review attempt.
  db.prepare(
    `INSERT INTO user_level_progress (user_id, map_level_id, status, stars, best_score, completed_at)
     VALUES (?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END)
     ON CONFLICT(user_id, map_level_id) DO UPDATE SET
       status = excluded.status, stars = excluded.stars, best_score = excluded.best_score,
       completed_at = CASE WHEN ? THEN datetime('now') ELSE user_level_progress.completed_at END`
  ).run(req.userId!, level.id, newStatus, nowStars, bestScore, levelFullyPassed ? 1 : 0, levelFullyPassed ? 1 : 0);

  // Unlock the next map level (or boss) only once this level is fully passed -- so a
  // student can't skip ahead by scoring under 50% on every reel.
  if (levelFullyPassed) {
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
  }

  const levelAfterXp = getPlayerLevel(req.userId!);

  res.json({
    results,
    correctCount,
    total,
    xpEarned,
    stars,
    doublePointsActive: doublePoints.active,
    leveledUp: levelAfterXp > levelBeforeXp,
    newPlayerLevel: levelAfterXp,
  });
});
