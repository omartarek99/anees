import { z } from 'zod';
import { asyncRouter } from '../lib/asyncRouter.js';
import { db } from '../db/db.js';
import { forbidRole } from '../middleware/auth.js';
import { validateBody, requireCsrfHeader } from '../middleware/validate.js';
import { challengePollLimiter } from '../middleware/rateLimit.js';
import {
  CHALLENGE_COUNTS, CHALLENGE_DIFFICULTIES, CHALLENGE_SUBJECTS, GAME_MS, currentChallenge, finishChallenge, isBusy,
} from '../lib/challenges.js';

export const challengesRouter = asyncRouter();
challengesRouter.use(forbidRole('admin'));

function areFriends(a: number, b: number): boolean {
  const [x, y] = a < b ? [a, b] : [b, a];
  return !!db.prepare(`SELECT 1 FROM friendships WHERE user_a_id = ? AND user_b_id = ?`).get(x, y);
}

// What this player should see right now (polled): an invitation, a running game, or a result they have not closed.
challengesRouter.get('/current', challengePollLimiter, (req, res) => {
  res.json({ challenge: currentChallenge(req.userId!) });
});

const createSchema = z.object({
  username: z.string().trim().min(1).max(40),
  subject: z.enum(CHALLENGE_SUBJECTS),
  difficulty: z.enum(CHALLENGE_DIFFICULTIES),
  count: z.number().int().refine((n) => (CHALLENGE_COUNTS as readonly number[]).includes(n), 'Pick 5, 10, 15 or 20 questions.'),
});

challengesRouter.post('/', requireCsrfHeader, validateBody(createSchema), (req, res) => {
  const { username, subject, difficulty, count } = req.body as z.infer<typeof createSchema>;
  const friend = db.prepare(`SELECT id, role FROM users WHERE username = ? COLLATE NOCASE`).get(username) as { id: number; role: string } | undefined;
  if (!friend || friend.role === 'admin' || friend.id === req.userId || !areFriends(req.userId!, friend.id)) {
    res.status(404).json({ error: 'You can only challenge your friends.' });
    return;
  }
  if (isBusy(req.userId!)) {
    res.status(409).json({ error: 'You already have a challenge going. Finish it first.' });
    return;
  }
  if (isBusy(friend.id)) {
    res.status(409).json({ error: 'Your friend is busy with another challenge right now. Try again in a moment.' });
    return;
  }
  // The questions are for the challenger's grade (grade 6 gets the grade-6 questions, everyone else grade 5), picked at random.
  const me = db.prepare(`SELECT grade FROM users WHERE id = ?`).get(req.userId!) as { grade: number | null };
  const grade = me.grade === 6 ? 6 : 5;
  const picked = db
    .prepare(`SELECT id FROM challenge_questions WHERE subject = ? AND grade = ? AND difficulty = ? ORDER BY RANDOM() LIMIT ?`)
    .all(subject, grade, difficulty, count) as { id: number }[];
  if (picked.length < count) {
    res.status(409).json({ error: 'There are not enough questions for that choice yet. Pick fewer questions.' });
    return;
  }
  db.prepare(
    `INSERT INTO friend_challenges (challenger_id, challenged_id, subject, difficulty, question_count, question_ids_json, created_ms) VALUES (?,?,?,?,?,?,?)`
  ).run(req.userId!, friend.id, subject, difficulty, count, JSON.stringify(picked.map((p) => p.id)), Date.now());
  res.status(201).json({ challenge: currentChallenge(req.userId!) });
});

function load(id: number, userId: number) {
  const row = db.prepare(`SELECT * FROM friend_challenges WHERE id = ? AND (challenger_id = ? OR challenged_id = ?)`).get(id, userId, userId) as any;
  return row as { id: number; status: string; challenger_id: number; challenged_id: number; question_ids_json: string; ends_ms: number | null } | undefined;
}

challengesRouter.post('/:id/accept', requireCsrfHeader, (req, res) => {
  const row = load(Number(req.params.id), req.userId!);
  if (!row || row.challenged_id !== req.userId! || row.status !== 'pending') {
    res.status(404).json({ error: 'This challenge is no longer available.' });
    return;
  }
  const now = Date.now();
  db.prepare(`UPDATE friend_challenges SET status = 'active', started_ms = ?, ends_ms = ? WHERE id = ? AND status = 'pending'`).run(now, now + GAME_MS, row.id);
  res.json({ challenge: currentChallenge(req.userId!) });
});

challengesRouter.post('/:id/decline', requireCsrfHeader, (req, res) => {
  const row = load(Number(req.params.id), req.userId!);
  if (!row || row.challenged_id !== req.userId! || row.status !== 'pending') {
    res.status(404).json({ error: 'This challenge is no longer available.' });
    return;
  }
  // the decliner has nothing more to see; the challenger is told
  db.prepare(`UPDATE friend_challenges SET status = 'declined', challenged_seen = 1 WHERE id = ?`).run(row.id);
  res.json({ ok: true });
});

challengesRouter.post('/:id/cancel', requireCsrfHeader, (req, res) => {
  const row = load(Number(req.params.id), req.userId!);
  if (!row || row.challenger_id !== req.userId! || row.status !== 'pending') {
    res.status(404).json({ error: 'This challenge is no longer available.' });
    return;
  }
  db.prepare(`UPDATE friend_challenges SET status = 'cancelled', challenger_seen = 1 WHERE id = ?`).run(row.id);
  res.json({ ok: true });
});

const answersSchema = z.object({ answers: z.record(z.string().regex(/^\d+$/), z.number().int().min(0).max(3)) });

/** Saves the answers given so far (only questions of this game, only while it runs). */
function saveAnswers(row: NonNullable<ReturnType<typeof load>>, userId: number, answers: Record<string, number>) {
  const ids = new Set((JSON.parse(row.question_ids_json) as number[]).map(String));
  const clean: Record<string, number> = {};
  for (const [qid, idx] of Object.entries(answers)) if (ids.has(qid)) clean[qid] = idx;
  const column = row.challenger_id === userId ? 'challenger_answers_json' : 'challenged_answers_json';
  db.prepare(`UPDATE friend_challenges SET ${column} = ? WHERE id = ? AND status = 'active'`).run(JSON.stringify(clean), row.id);
}

challengesRouter.patch('/:id/answers', requireCsrfHeader, validateBody(answersSchema), (req, res) => {
  const row = load(Number(req.params.id), req.userId!);
  if (!row || row.status !== 'active' || (row.ends_ms !== null && Date.now() > row.ends_ms + 3000)) {
    res.status(409).json({ error: 'The game is over.' });
    return;
  }
  saveAnswers(row, req.userId!, (req.body as z.infer<typeof answersSchema>).answers);
  res.json({ ok: true });
});

// Whoever submits first ends the game for both: both are graded from the answers saved so far.
challengesRouter.post('/:id/submit', requireCsrfHeader, validateBody(answersSchema), (req, res) => {
  const row = load(Number(req.params.id), req.userId!);
  if (!row) {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  if (row.status === 'active') {
    saveAnswers(row, req.userId!, (req.body as z.infer<typeof answersSchema>).answers);
    finishChallenge(row.id, req.userId!);
  }
  res.json({ challenge: currentChallenge(req.userId!) });
});

// Closing a result (or the "declined" note) so it is not shown again.
challengesRouter.post('/:id/seen', requireCsrfHeader, (req, res) => {
  const row = load(Number(req.params.id), req.userId!);
  if (!row || row.status === 'pending' || row.status === 'active') {
    res.status(404).json({ error: 'Not found.' });
    return;
  }
  const column = row.challenger_id === req.userId! ? 'challenger_seen' : 'challenged_seen';
  db.prepare(`UPDATE friend_challenges SET ${column} = 1 WHERE id = ?`).run(row.id);
  res.json({ ok: true });
});
