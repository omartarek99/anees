import { asyncRouter } from '../lib/asyncRouter.js';
import { z } from 'zod';
import { db } from '../db/db.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { awardXp, penalizeWrongAnswers, getPlayerLevel, getMapLevel, BOSS_DEFEAT_XP_BONUS, BOSS_PASS_RATIO } from '../lib/xp.js';
import { gradeAnswers } from '../lib/grading.js';
import { getBattleStatus, recordBattleLoss } from '../lib/battle.js';
import { registerLevelQuiz } from './mapQuiz.js';

export const mapRouter = asyncRouter();
registerLevelQuiz(mapRouter);

mapRouter.get('/', (req, res) => {
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

  res.json({ levels: result, playerLevel: getMapLevel(req.userId!), battle: getBattleStatus(req.userId!) });
});

function loadLevelWithProgress(userId: number, levelNumber: number) {
  const level = db.prepare(`SELECT * FROM map_levels WHERE level_number = ?`).get(levelNumber) as any;
  if (!level) return null;
  const progress = db
    .prepare(`SELECT * FROM user_level_progress WHERE user_id = ? AND map_level_id = ?`)
    .get(userId, level.id) as any;
  return { level, progress };
}

// Three lost fights, then a 24-hour wait from the last loss (lib/battle.ts). Replaying a boss that is already cleared costs nothing.
function waitingForBattle(userId: number, progress: any, res: any): boolean {
  if (progress?.status === 'completed') return false;
  const battle = getBattleStatus(userId);
  if (!battle.lockedUntil) return false;
  res.status(429).json({ error: 'You have no tries left. Come back when the waiting time ends.', lockedUntil: battle.lockedUntil, battle });
  return true;
}

mapRouter.get('/boss/:levelNumber', (req, res) => {
  const levelNumber = Number(req.params.levelNumber);
  const found = loadLevelWithProgress(req.userId!, levelNumber);
  if (!found || found.level.kind !== 'boss') {
    res.status(404).json({ error: 'We couldn\'t find this guardian level.' });
    return;
  }
  const { level, progress } = found;
  if (level.status !== 'ready') {
    res.json({ comingSoon: true, level: { levelNumber: level.level_number, title: level.title, titleAr: level.title_ar } });
    return;
  }
  if (!progress || progress.status === 'locked') {
    res.status(403).json({ error: 'Finish the levels before it to challenge this guardian.' });
    return;
  }
  if (waitingForBattle(req.userId!, progress, res)) return;

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
    battle: getBattleStatus(req.userId!),
  });
});

const bossCheckSchema = z.object({
  questionId: z.number(),
  choiceIndex: z.number().min(0).max(3),
});

// Real-time single-question grading — lets the arena drop the boss's HP live as each
// question is answered, without waiting for the end-of-fight /submit to persist progress.
mapRouter.post('/boss/:levelNumber/check', requireCsrfHeader, validateBody(bossCheckSchema), (req, res) => {
  const levelNumber = Number(req.params.levelNumber);
  const found = loadLevelWithProgress(req.userId!, levelNumber);
  if (!found || found.level.kind !== 'boss') {
    res.status(404).json({ error: 'We couldn\'t find this guardian level.' });
    return;
  }
  const { level, progress } = found;
  if (!progress || progress.status === 'locked') {
    res.status(403).json({ error: 'This guardian is locked. Finish the levels before it first.' });
    return;
  }
  if (waitingForBattle(req.userId!, progress, res)) return;

  const { questionId, choiceIndex } = req.body as { questionId: number; choiceIndex: number };
  const question = db.prepare(`SELECT * FROM boss_questions WHERE id = ? AND map_level_id = ?`).get(questionId, level.id) as any;
  if (!question) {
    res.status(404).json({ error: 'We couldn\'t find what you asked for.' });
    return;
  }

  const isCorrect = choiceIndex === question.correct_index;
  // Charged here, as each answer is given, and not again at /submit (which grades the same answers): a fight left half-way still costs its wrong answers.
  const xpLost = isCorrect ? 0 : penalizeWrongAnswers(req.userId!, 1);
  res.json({
    isCorrect,
    xpLost,
    correctIndex: question.correct_index,
    explanation: question.explanation,
    explanationAr: question.explanation_ar,
  });
});

const bossSubmitSchema = z.object({
  answers: z.array(z.object({ questionId: z.number(), choiceIndex: z.number().min(0).max(3) })),
});

mapRouter.post('/boss/:levelNumber/submit', requireCsrfHeader, validateBody(bossSubmitSchema), (req, res) => {
  const levelNumber = Number(req.params.levelNumber);
  const found = loadLevelWithProgress(req.userId!, levelNumber);
  if (!found || found.level.kind !== 'boss') {
    res.status(404).json({ error: 'We couldn\'t find this guardian level.' });
    return;
  }
  const { level, progress } = found;
  if (!progress || progress.status === 'locked') {
    res.status(403).json({ error: 'This guardian is locked. Finish the levels before it first.' });
    return;
  }
  if (waitingForBattle(req.userId!, progress, res)) return;

  const questions = db.prepare(`SELECT * FROM boss_questions WHERE map_level_id = ?`).all(level.id) as any[];
  const { answers } = req.body as { answers: { questionId: number; choiceIndex: number }[] };

  const { results, correctCount } = gradeAnswers(questions, answers);

  const total = questions.length;
  const ratio = total > 0 ? correctCount / total : 0;
  const passed = ratio >= BOSS_PASS_RATIO;

  const levelBeforeXp = getPlayerLevel(req.userId!);
  let xpEarned = 0;

  if (passed) {
    // The bonus is for the first defeat; awardXp ignores 0, so replaying a cleared boss pays nothing.
    xpEarned = progress.status === 'completed' ? 0 : BOSS_DEFEAT_XP_BONUS;
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
    if (progress.status !== 'completed') recordBattleLoss(req.userId!);
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
    battle: getBattleStatus(req.userId!),
  });
});
