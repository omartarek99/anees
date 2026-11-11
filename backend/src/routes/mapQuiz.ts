import { z } from 'zod';
import type { Router } from 'express';
import { db } from '../db/db.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { awardXp, penalizeWrongAnswers, penalizePoints, getPlayerLevel, QUIZ_PASS_POINTS, LEVEL_QUIZ_FAIL_LOSS } from '../lib/xp.js';
import { difficultyTierFor } from '../lib/ranks.js';
import { getDoublePointsStatus, DOUBLE_POINTS_MULTIPLIER } from '../lib/doublePoints.js';
import { gradeAnswers } from '../lib/grading.js';

// Normal map levels have no video: their questions live in their own pool (level_quiz_questions, lib/mapQuestions.ts), apart from the
// questions of the videos (reel_questions). Clicking a level serves 4 random questions (2 Math + 2 Science) from that pool, a little
// harder with every level (10 tiers, level 50 = tier 10 = MEDIUM, never hard) and with every rank division: the tier is the middle
// of the level's own tier and the tier of the student's division (lib/ranks.ts difficultyTierFor), so Champion players get harder
// questions on level 1 than Iron players do.

const QUESTIONS_PER_SUBJECT = 2;

function tierOfLevel(levelNumber: number, userId: number): number {
  const byLevel = Math.min(10, Math.max(1, Math.ceil(levelNumber / 5)));
  const u = db.prepare(`SELECT total_xp FROM users WHERE id = ?`).get(userId) as { total_xp: number } | undefined;
  const byDivision = difficultyTierFor(u?.total_xp ?? 0);
  return Math.min(10, Math.max(1, Math.round((byLevel + byDivision) / 2)));
}

// Grade 6 students get the grade-6 questions; everyone else (grade 5, teachers, no grade) the grade-5 ones.
function gradeOf(userId: number): number {
  const u = db.prepare(`SELECT grade FROM users WHERE id = ?`).get(userId) as { grade: number | null } | undefined;
  return u?.grade === 6 ? 6 : 5;
}

function loadLevel(userId: number, levelNumber: number): { level: any; progress: any } | { error: string; status: number } {
  const level = db.prepare(`SELECT * FROM map_levels WHERE level_number = ?`).get(levelNumber) as any;
  if (!level || level.kind !== 'normal') return { error: 'We couldn\'t find this level.', status: 404 };
  if (level.status !== 'ready') return { error: 'This level is not ready yet. It is coming soon.', status: 404 };
  const progress =
    (db.prepare(`SELECT * FROM user_level_progress WHERE user_id = ? AND map_level_id = ?`).get(userId, level.id) as any) ??
    (levelNumber === 1 ? { status: 'available', stars: 0, best_score: 0 } : null);
  if (!progress || progress.status === 'locked') return { error: 'This level is locked. Finish the level before it to open it.', status: 403 };
  return { level, progress };
}

// The tier itself first; a neighbouring tier tops it up if the pool is thin.
function pick(subject: string, grade: number, tier: number, count: number): any[] {
  const out: any[] = [];
  for (const t of [tier, tier - 1, tier + 1]) {
    if (t < 1 || t > 10 || out.length >= count) continue;
    const ids = out.map((q) => q.id);
    const rows = db
      .prepare(
        `SELECT * FROM level_quiz_questions WHERE subject = ? AND grade = ? AND tier = ? ${ids.length ? `AND id NOT IN (${ids.map(() => '?').join(',')})` : ''} ORDER BY RANDOM() LIMIT ?`
      )
      .all(subject, grade, t, ...ids, count - out.length) as any[];
    out.push(...rows);
  }
  return out;
}

const submitSchema = z.object({
  answers: z.array(z.object({ questionId: z.number(), choiceIndex: z.number().min(0).max(3) })).min(1).max(8),
});

export function registerLevelQuiz(router: Router) {
  router.get('/quiz/:levelNumber', (req, res) => {
    const levelNumber = Number(req.params.levelNumber);
    const found = loadLevel(req.userId!, levelNumber);
    if ('error' in found) {
      res.status(found.status).json({ error: found.error });
      return;
    }
    const grade = gradeOf(req.userId!);
    const tier = tierOfLevel(levelNumber, req.userId!);
    const picked = [...pick('math', grade, tier, QUESTIONS_PER_SUBJECT), ...pick('science', grade, tier, QUESTIONS_PER_SUBJECT)];
    if (picked.length === 0) {
      res.status(404).json({ error: 'This level has no questions yet. Try another level.' });
      return;
    }
    // Math and Science mixed in a random order.
    for (let i = picked.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [picked[i], picked[j]] = [picked[j], picked[i]];
    }
    res.json({
      level: { levelNumber, title: found.level.title, titleAr: found.level.title_ar },
      progress: { status: found.progress.status, stars: found.progress.stars ?? 0 },
      questions: picked.map((q) => ({
        id: q.id,
        text: q.question_text,
        textAr: q.question_text_ar,
        choices: JSON.parse(q.choices_json),
        choicesAr: JSON.parse(q.choices_json_ar),
      })),
    });
  });

  router.post('/quiz/:levelNumber/submit', requireCsrfHeader, validateBody(submitSchema), (req, res) => {
    const levelNumber = Number(req.params.levelNumber);
    const found = loadLevel(req.userId!, levelNumber);
    if ('error' in found) {
      res.status(found.status).json({ error: found.error });
      return;
    }
    const { level, progress } = found;
    const { answers } = req.body as { answers: { questionId: number; choiceIndex: number }[] };

    // Only questions that can be served for this level and grade are accepted (its own tier or the neighbours, which also covers a rank
    // division change in the middle of a quiz).
    const grade = gradeOf(req.userId!);
    const tier = tierOfLevel(levelNumber, req.userId!);
    const ids = [...new Set(answers.map((a) => a.questionId))];
    const questions = db
      .prepare(`SELECT * FROM level_quiz_questions WHERE grade = ? AND tier BETWEEN ? AND ? AND id IN (${ids.map(() => '?').join(',')})`)
      .all(grade, tier - 1, tier + 1, ...ids) as any[];
    if (questions.length !== ids.length || ids.length !== answers.length) {
      res.status(400).json({ error: 'These answers are not for this level. Refresh the page and try again.' });
      return;
    }

    const { results, correctCount, wrongCount } = gradeAnswers(questions, answers);
    const total = questions.length;
    const scoreRatio = correctCount / total;
    const stars = scoreRatio === 1 ? 3 : scoreRatio >= 0.75 ? 2 : scoreRatio >= 0.5 ? 1 : 0;
    const passed = scoreRatio >= 0.5;

    // A pass pays a flat amount; a fail (fewer than half right: under 2 of 4) pays nothing and costs LEVEL_QUIZ_FAIL_LOSS (-1) on top of the
    // wrong answers.
    const doublePoints = getDoublePointsStatus();
    const basePoints = passed ? QUIZ_PASS_POINTS : 0;
    const xpEarned = doublePoints.active ? basePoints * DOUBLE_POINTS_MULTIPLIER : basePoints;
    const levelBeforeXp = getPlayerLevel(req.userId!);
    // what is lost is charged first, so only the net of this submission can move a rank (see lib/xp.ts)
    const xpLost = penalizeWrongAnswers(req.userId!, wrongCount) + (passed ? 0 : penalizePoints(req.userId!, LEVEL_QUIZ_FAIL_LOSS, 'level_quiz_fail'));
    awardXp(req.userId!, xpEarned, 'level_quiz');

    // Passing (at least half right) completes the level -- sticky, a later poor retry never undoes it -- and opens the next one.
    const completed = passed || progress.status === 'completed';
    db.prepare(
      `INSERT INTO user_level_progress (user_id, map_level_id, status, stars, best_score, completed_at)
       VALUES (?, ?, ?, ?, ?, CASE WHEN ? THEN datetime('now') ELSE NULL END)
       ON CONFLICT(user_id, map_level_id) DO UPDATE SET
         status = excluded.status, stars = excluded.stars, best_score = excluded.best_score,
         completed_at = CASE WHEN ? THEN COALESCE(user_level_progress.completed_at, datetime('now')) ELSE user_level_progress.completed_at END`
    ).run(
      req.userId!, level.id, completed ? 'completed' : 'available', Math.max(stars, progress.stars ?? 0),
      Math.max(correctCount, progress.best_score ?? 0), completed ? 1 : 0, completed ? 1 : 0
    );
    if (completed) {
      const next = db.prepare(`SELECT * FROM map_levels WHERE level_number = ?`).get(levelNumber + 1) as any;
      if (next) {
        const existing = db.prepare(`SELECT * FROM user_level_progress WHERE user_id = ? AND map_level_id = ?`).get(req.userId!, next.id) as any;
        if (!existing) {
          db.prepare(`INSERT INTO user_level_progress (user_id, map_level_id, status) VALUES (?,?,'available')`).run(req.userId!, next.id);
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
      xpLost,
      stars,
      passed,
      doublePointsActive: doublePoints.active,
      leveledUp: levelAfterXp > levelBeforeXp,
      newPlayerLevel: levelAfterXp,
    });
  });
}
