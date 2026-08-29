import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/db.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { awardXp, WORKSHEET_XP_PER_CORRECT } from '../lib/xp.js';

export const worksheetsRouter = Router();

const QUESTIONS_PER_WORKSHEET = 8;

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const generateSchema = z.object({
  subject: z.enum(['math', 'science']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
});

worksheetsRouter.post('/generate', requireAuth, requireCsrfHeader, validateBody(generateSchema), (req, res) => {
  const { subject, difficulty } = req.body as { subject: 'math' | 'science'; difficulty: 'easy' | 'medium' | 'hard' };
  const subjectRow = db.prepare(`SELECT * FROM subjects WHERE key = ?`).get(subject) as any;
  if (!subjectRow) {
    res.status(400).json({ error: 'Unknown subject.' });
    return;
  }

  const pool = db
    .prepare(`SELECT * FROM worksheet_questions WHERE subject_id = ? AND difficulty = ?`)
    .all(subjectRow.id, difficulty) as any[];
  if (pool.length === 0) {
    res.status(404).json({ error: 'No questions available for this combination yet.' });
    return;
  }

  const picked = shuffle(pool).slice(0, Math.min(QUESTIONS_PER_WORKSHEET, pool.length));
  const questionIds = picked.map((q) => q.id);

  const attemptId = Number(
    db
      .prepare(
        `INSERT INTO worksheet_attempts (user_id, subject_id, difficulty, question_ids_json, total, status) VALUES (?,?,?,?,?, 'generated')`
      )
      .run(req.userId!, subjectRow.id, difficulty, JSON.stringify(questionIds), picked.length).lastInsertRowid
  );

  res.status(201).json({
    worksheetId: attemptId,
    subject,
    difficulty,
    xpPerCorrect: WORKSHEET_XP_PER_CORRECT[difficulty],
    questions: picked.map((q) => ({
      id: q.id,
      text: q.question_text,
      textAr: q.question_text_ar,
      choices: JSON.parse(q.choices_json),
      choicesAr: JSON.parse(q.choices_json_ar),
    })),
  });
});

const submitSchema = z.object({
  answers: z.array(z.object({ questionId: z.number(), choiceIndex: z.number().min(0).max(3) })),
});

worksheetsRouter.post('/:id/submit', requireAuth, requireCsrfHeader, validateBody(submitSchema), (req, res) => {
  const attempt = db.prepare(`SELECT * FROM worksheet_attempts WHERE id = ?`).get(Number(req.params.id)) as any;
  if (!attempt || attempt.user_id !== req.userId!) {
    res.status(404).json({ error: 'Worksheet not found.' });
    return;
  }
  if (attempt.status === 'submitted') {
    res.status(409).json({ error: 'This worksheet was already submitted.' });
    return;
  }

  const questionIds: number[] = JSON.parse(attempt.question_ids_json);
  const questions = questionIds.map(
    (id) => db.prepare(`SELECT * FROM worksheet_questions WHERE id = ?`).get(id) as any
  );
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

  const xpPerCorrect = WORKSHEET_XP_PER_CORRECT[attempt.difficulty as 'easy' | 'medium' | 'hard'];
  const xpEarned = correctCount * xpPerCorrect;
  if (xpEarned > 0) awardXp(req.userId!, xpEarned, `worksheet_${attempt.difficulty}`);

  db.prepare(
    `UPDATE worksheet_attempts SET score = ?, xp_earned = ?, answers_json = ?, status = 'submitted' WHERE id = ?`
  ).run(correctCount, xpEarned, JSON.stringify(answers), attempt.id);

  res.json({ results, correctCount, total: questions.length, xpEarned });
});

worksheetsRouter.get('/history', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT wa.*, s.key as subject_key, s.name as subject_name FROM worksheet_attempts wa
       JOIN subjects s ON wa.subject_id = s.id
       WHERE wa.user_id = ? AND wa.status = 'submitted'
       ORDER BY wa.created_at DESC LIMIT 20`
    )
    .all(req.userId!) as any[];
  res.json({
    history: rows.map((r) => ({
      id: r.id,
      subject: r.subject_key,
      difficulty: r.difficulty,
      score: r.score,
      total: r.total,
      xpEarned: r.xp_earned,
      createdAt: r.created_at,
    })),
  });
});
