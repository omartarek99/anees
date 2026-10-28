import { asyncRouter } from '../lib/asyncRouter.js';
import { z } from 'zod';
import { db } from '../db/db.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { awardXp, getPlayerLevel, VIDEO_HALF_WATCH_POINTS, VIDEO_FULL_WATCH_POINTS, QUIZ_PASS_POINTS, QUIZ_FAIL_POINTS } from '../lib/xp.js';
import { gradeAnswers } from '../lib/grading.js';
import { getDoublePointsStatus, DOUBLE_POINTS_MULTIPLIER } from '../lib/doublePoints.js';

export const reelsRouter = asyncRouter();

// Polled by the frontend (see DoublePointsNotification.tsx) to pop up a notification the
// moment the hour's random double-points window opens, without needing any push mechanism.
reelsRouter.get('/double-points-status', (_req, res) => {
  res.json(getDoublePointsStatus());
});

// Videos and the adventure map are separate systems: a video has its own quiz (reel_questions), and nothing in here reads or writes map
// levels or level progress -- the map's questions live in their own pool and routes (routes/mapQuiz.ts, routes/map.ts). A video is
// for one grade: a student can watch and take the quiz of the videos tagged with their own grade, a teacher of any.
function visibleReel(userId: number, reelId: number): any | null {
  const reel = db.prepare(`SELECT * FROM reels WHERE id = ? AND grade IS NOT NULL`).get(reelId) as any;
  if (!reel) return null;
  const user = db.prepare(`SELECT grade, role FROM users WHERE id = ?`).get(userId) as { grade: number | null; role: string } | undefined;
  return user && (user.role === 'teacher' || user.grade === reel.grade) ? reel : null;
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
// teacher reels matching the caller's own grade, or all of them for a teacher) in one response — the frontend used to
// fetch /map, then fire one /reels/level/:n request per unlocked level in parallel (N+1
// round trips just to render the feed, and again every time a level completed). This does
// the same join+filter /map already does, then gathers each level's reels/questions
// in-process (still N small synchronous SQLite calls, but zero extra HTTP round trips).
reelsRouter.get('/feed', (req, res) => {
  // Only teachers' grade-based videos live in Reels. The adventure-map levels are plain question rounds (routes/mapQuiz.ts), with no
  // video behind them. The lessons are always available (nothing to unlock, no lock state). A student gets every lesson tagged with their own grade.
  // Teachers don't set a grade at signup, so they see every grade-based lesson from every grade and
  // every teacher -- the same full library a student is shown, not just the ones they uploaded.
  const user = db.prepare(`SELECT grade, role FROM users WHERE id = ?`).get(req.userId!) as { grade: number | null; role: string };
  const gradeReelsById = new Map<number, any>();
  if (user?.role === 'teacher') {
    for (const reel of db.prepare(`SELECT * FROM reels WHERE grade IS NOT NULL ORDER BY id`).all() as any[]) {
      gradeReelsById.set(reel.id, reel);
    }
  } else if (user?.grade) {
    for (const reel of db.prepare(`SELECT * FROM reels WHERE grade = ? ORDER BY id`).all(user.grade) as any[]) {
      gradeReelsById.set(reel.id, reel);
    }
  }
  // Newest upload first: ids only ever grow, so the highest id is the most recent video. A video uploaded a minute
  // ago is the first thing anyone opening Reels sees, then older ones, oldest last.
  const gradeFeed: any[] = [];
  for (const reel of [...gradeReelsById.values()].sort((a, b) => b.id - a.id)) {
    const subject = db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(reel.subject_id) as any;
    gradeFeed.push({
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

  res.json(gradeFeed);
});

// Matches ReelSlide.tsx's flush cadence (a heartbeat roughly every WATCH_HEARTBEAT_SECONDS
// while a reel is actively in view, see its own comment) plus slack for request latency and
// the tail-end flush on scroll-away/unmount -- not a round number chosen for looks.
const MAX_SECONDS_PER_CALL = 15;

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
reelsRouter.post('/:reelId/watch', requireCsrfHeader, validateBody(watchSchema), (req, res) => {
  const reelId = Number(req.params.reelId);
  const reel = visibleReel(req.userId!, reelId);
  if (!reel) {
    res.status(404).json({ error: 'Lesson not found.' });
    return;
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
    ? Math.max(0, (Date.now() - new Date(`${existing.updated_at}Z`).getTime()) / 1000)
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
       SET watched_seconds = ?, xp_awarded = ?, loop_watched_seconds = ?, current_loop_tier = ?, updated_at = strftime('%Y-%m-%d %H:%M:%f', 'now')
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

reelsRouter.post('/:reelId/submit', requireCsrfHeader, validateBody(submitSchema), (req, res) => {
  const reelId = Number(req.params.reelId);
  const reel = visibleReel(req.userId!, reelId);
  if (!reel) {
    res.status(404).json({ error: 'Lesson not found.' });
    return;
  }

  const questions = db.prepare(`SELECT * FROM reel_questions WHERE reel_id = ?`).all(reelId) as any[];
  const { answers } = req.body as { answers: { questionId: number; choiceIndex: number }[] };

  const { results, correctCount } = gradeAnswers(questions, answers);

  const total = questions.length;
  const scoreRatio = total > 0 ? correctCount / total : 0;
  const stars = scoreRatio === 1 ? 3 : scoreRatio >= 0.75 ? 2 : scoreRatio >= 0.5 ? 1 : 0;
  const passedThisAttempt = scoreRatio >= 0.5;

  // Quiz points are flat per submission -- every submission earns them, not just the
  // first. Same "at least half" line as the stars -- 2 out of 4 correct (exactly 50%)
  // counts as a pass.
  const doublePoints = getDoublePointsStatus();
  const basePoints = scoreRatio >= 0.5 ? QUIZ_PASS_POINTS : QUIZ_FAIL_POINTS;
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
