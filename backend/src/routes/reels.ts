import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { awardXp, getPlayerLevel, WATCH_XP_PER_SECOND } from '../lib/xp.js';

export const reelsRouter = Router();

function getProgress(userId: number, mapLevelId: number) {
  return db
    .prepare(`SELECT * FROM user_level_progress WHERE user_id = ? AND map_level_id = ?`)
    .get(userId, mapLevelId) as any;
}

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
  const progress = getProgress(req.userId!, level.id);
  if (!progress || progress.status === 'locked') {
    res.status(403).json({ error: 'This level is locked. Complete the previous level first.' });
    return;
  }

  const reel = db.prepare(`SELECT * FROM reels WHERE map_level_id = ? ORDER BY order_in_level LIMIT 1`).get(level.id) as any;
  if (!reel) {
    res.status(404).json({ error: 'No lesson found for this level.' });
    return;
  }
  const subject = db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(reel.subject_id) as any;
  const questions = db
    .prepare(
      `SELECT id, question_text, question_text_ar, choices_json, choices_json_ar, order_in_reel FROM reel_questions WHERE reel_id = ? ORDER BY order_in_reel`
    )
    .all(reel.id) as any[];

  res.json({
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
    },
    questions: questions.map((q) => ({
      id: q.id,
      text: q.question_text,
      textAr: q.question_text_ar,
      choices: JSON.parse(q.choices_json),
      choicesAr: JSON.parse(q.choices_json_ar),
      order: q.order_in_reel,
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
  const level = db.prepare(`SELECT * FROM map_levels WHERE id = ?`).get(reel.map_level_id) as any;
  const progress = getProgress(req.userId!, level.id);
  if (!progress || progress.status === 'locked') {
    res.status(403).json({ error: 'This level is locked.' });
    return;
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
  const level = db.prepare(`SELECT * FROM map_levels WHERE id = ?`).get(reel.map_level_id) as any;
  const progress = getProgress(req.userId!, level.id);
  if (!progress || progress.status === 'locked') {
    res.status(403).json({ error: 'This level is locked.' });
    return;
  }

  const questions = db.prepare(`SELECT * FROM reel_questions WHERE reel_id = ?`).all(reelId) as any[];
  const { answers } = req.body as { answers: { questionId: number; choiceIndex: number }[] };

  let correctCount = 0;
  let xpEarned = 0;
  const results = questions.map((q) => {
    const answer = answers.find((a) => a.questionId === q.id);
    const chosenIndex = answer ? answer.choiceIndex : -1;
    const isCorrect = chosenIndex === q.correct_index;
    if (isCorrect) {
      correctCount += 1;
      xpEarned += q.xp_value;
    }
    return {
      questionId: q.id,
      chosenIndex,
      correctIndex: q.correct_index,
      isCorrect,
      explanation: q.explanation,
      explanationAr: q.explanation_ar,
    };
  });

  const total = questions.length;
  const scoreRatio = total > 0 ? correctCount / total : 0;
  const stars = scoreRatio === 1 ? 3 : scoreRatio >= 0.75 ? 2 : scoreRatio >= 0.5 ? 1 : 0;
  const nowStars = Math.max(stars, progress.stars ?? 0);
  const bestScore = Math.max(correctCount, progress.best_score ?? 0);

  // Quiz XP is only awarded the first time a level is completed — retaking it (e.g. while
  // looping through the endless reels feed for review) still shows correct/wrong feedback
  // and can improve stars, but can't be replayed for repeat XP.
  const alreadyCompleted = progress.status === 'completed';
  if (alreadyCompleted) xpEarned = 0;

  const levelBeforeXp = getPlayerLevel(req.userId!);
  if (xpEarned > 0) awardXp(req.userId!, xpEarned, 'reel_quiz');

  db.prepare(
    `UPDATE user_level_progress SET status = 'completed', stars = ?, best_score = ?, completed_at = datetime('now')
     WHERE user_id = ? AND map_level_id = ?`
  ).run(nowStars, bestScore, req.userId!, level.id);

  // Unlock the next map level (or boss) so the student can keep progressing.
  const nextLevel = db.prepare(`SELECT * FROM map_levels WHERE level_number = ?`).get(level.level_number + 1) as any;
  if (nextLevel) {
    const existing = getProgress(req.userId!, nextLevel.id);
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
