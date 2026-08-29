import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { awardXp, getPlayerLevel, BOSS_DEFEAT_XP_BONUS, BOSS_PASS_RATIO } from '../lib/xp.js';

export const mapRouter = Router();

mapRouter.get('/', requireAuth, (req, res) => {
  const levels = db
    .prepare(
      `SELECT m.*, s.key as subject_key, s.name as subject_name, s.name_ar as subject_name_ar, s.icon as subject_icon
       FROM map_levels m LEFT JOIN subjects s ON m.subject_id = s.id
       ORDER BY m.level_number`
    )
    .all() as any[];

  const progressRows = db
    .prepare(`SELECT * FROM user_level_progress WHERE user_id = ?`)
    .all(req.userId!) as any[];
  const progressByLevelId = new Map(progressRows.map((p) => [p.map_level_id, p]));

  const result = levels.map((lvl) => {
    const progress = progressByLevelId.get(lvl.id);
    return {
      levelNumber: lvl.level_number,
      title: lvl.title,
      titleAr: lvl.title_ar,
      kind: lvl.kind,
      status: lvl.status,
      subject: lvl.subject_key
        ? { key: lvl.subject_key, name: lvl.subject_name, nameAr: lvl.subject_name_ar, icon: lvl.subject_icon }
        : null,
      progress: {
        status: progress ? progress.status : lvl.level_number === 1 ? 'available' : 'locked',
        stars: progress?.stars ?? 0,
      },
    };
  });

  res.json({ levels: result, playerLevel: getPlayerLevel(req.userId!) });
});

function loadLevelWithProgress(userId: number, levelNumber: number) {
  const level = db.prepare(`SELECT * FROM map_levels WHERE level_number = ?`).get(levelNumber) as any;
  if (!level) return null;
  const progress = db
    .prepare(`SELECT * FROM user_level_progress WHERE user_id = ? AND map_level_id = ?`)
    .get(userId, level.id) as any;
  return { level, progress };
}

mapRouter.get('/boss/:levelNumber', requireAuth, (req, res) => {
  const levelNumber = Number(req.params.levelNumber);
  const found = loadLevelWithProgress(req.userId!, levelNumber);
  if (!found || found.level.kind !== 'boss') {
    res.status(404).json({ error: 'Boss level not found.' });
    return;
  }
  const { level, progress } = found;
  if (level.status !== 'ready') {
    res.json({ comingSoon: true, level: { levelNumber: level.level_number, title: level.title, titleAr: level.title_ar } });
    return;
  }
  if (!progress || progress.status === 'locked') {
    res.status(403).json({ error: 'Defeat the previous levels first to challenge this boss.' });
    return;
  }

  const questions = db
    .prepare(
      `SELECT id, question_text, question_text_ar, choices_json, choices_json_ar, order_in_fight FROM boss_questions WHERE map_level_id = ? ORDER BY order_in_fight`
    )
    .all(level.id) as any[];

  res.json({
    comingSoon: false,
    level: { levelNumber: level.level_number, title: level.title, titleAr: level.title_ar },
    questions: questions.map((q) => ({
      id: q.id,
      text: q.question_text,
      textAr: q.question_text_ar,
      choices: JSON.parse(q.choices_json),
      choicesAr: JSON.parse(q.choices_json_ar),
    })),
    progress: { status: progress.status, stars: progress.stars },
  });
});

const bossCheckSchema = z.object({
  questionId: z.number(),
  choiceIndex: z.number().min(0).max(3),
});

// Real-time single-question grading — lets the arena drop the boss's HP live as each
// question is answered, without waiting for the end-of-fight /submit to persist progress.
mapRouter.post('/boss/:levelNumber/check', requireAuth, requireCsrfHeader, validateBody(bossCheckSchema), (req, res) => {
  const levelNumber = Number(req.params.levelNumber);
  const found = loadLevelWithProgress(req.userId!, levelNumber);
  if (!found || found.level.kind !== 'boss') {
    res.status(404).json({ error: 'Boss level not found.' });
    return;
  }
  const { level, progress } = found;
  if (!progress || progress.status === 'locked') {
    res.status(403).json({ error: 'This boss is locked.' });
    return;
  }

  const { questionId, choiceIndex } = req.body as { questionId: number; choiceIndex: number };
  const question = db.prepare(`SELECT * FROM boss_questions WHERE id = ? AND map_level_id = ?`).get(questionId, level.id) as any;
  if (!question) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }

  const isCorrect = choiceIndex === question.correct_index;
  res.json({
    isCorrect,
    correctIndex: question.correct_index,
    explanation: question.explanation,
    explanationAr: question.explanation_ar,
  });
});

const bossSubmitSchema = z.object({
  answers: z.array(z.object({ questionId: z.number(), choiceIndex: z.number().min(0).max(3) })),
});

mapRouter.post('/boss/:levelNumber/submit', requireAuth, requireCsrfHeader, validateBody(bossSubmitSchema), (req, res) => {
  const levelNumber = Number(req.params.levelNumber);
  const found = loadLevelWithProgress(req.userId!, levelNumber);
  if (!found || found.level.kind !== 'boss') {
    res.status(404).json({ error: 'Boss level not found.' });
    return;
  }
  const { level, progress } = found;
  if (!progress || progress.status === 'locked') {
    res.status(403).json({ error: 'This boss is locked.' });
    return;
  }

  const questions = db.prepare(`SELECT * FROM boss_questions WHERE map_level_id = ?`).all(level.id) as any[];
  const { answers } = req.body as { answers: { questionId: number; choiceIndex: number }[] };

  let correctCount = 0;
  const results = questions.map((q) => {
    const answer = answers.find((a) => a.questionId === q.id);
    const chosenIndex = answer ? answer.choiceIndex : -1;
    const isCorrect = chosenIndex === q.correct_index;
    if (isCorrect) correctCount += 1;
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
  const ratio = total > 0 ? correctCount / total : 0;
  const passed = ratio >= BOSS_PASS_RATIO;

  const levelBeforeXp = getPlayerLevel(req.userId!);
  let xpEarned = 0;

  if (passed) {
    xpEarned = BOSS_DEFEAT_XP_BONUS;
    awardXp(req.userId!, xpEarned, 'boss_defeat');
    db.prepare(
      `UPDATE user_level_progress SET status = 'completed', stars = 3, best_score = ?, completed_at = datetime('now')
       WHERE user_id = ? AND map_level_id = ?`
    ).run(Math.max(correctCount, progress.best_score ?? 0), req.userId!, level.id);

    const nextLevel = db.prepare(`SELECT * FROM map_levels WHERE level_number = ?`).get(level.level_number + 1) as any;
    if (nextLevel) {
      const existing = db
        .prepare(`SELECT * FROM user_level_progress WHERE user_id = ? AND map_level_id = ?`)
        .get(req.userId!, nextLevel.id);
      if (!existing) {
        db.prepare(`INSERT INTO user_level_progress (user_id, map_level_id, status) VALUES (?,?,'available')`).run(
          req.userId!,
          nextLevel.id
        );
      }
    }
  } else {
    db.prepare(`UPDATE user_level_progress SET best_score = ? WHERE user_id = ? AND map_level_id = ?`).run(
      Math.max(correctCount, progress.best_score ?? 0),
      req.userId!,
      level.id
    );
  }

  const levelAfterXp = getPlayerLevel(req.userId!);

  res.json({
    passed,
    results,
    correctCount,
    total,
    xpEarned,
    leveledUp: levelAfterXp > levelBeforeXp,
    newPlayerLevel: levelAfterXp,
  });
});
