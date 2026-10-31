import { db } from '../db/db.js';
import { awardXp } from './xp.js';

// Friend challenges ("تحدى صديقك"): one friend challenges another on a subject, a difficulty and a number of questions taken from the school
// question bank. The friend accepts or declines; if they accept, both get the same questions and 5 minutes. The first to submit ends the game
// for both (or the clock does): both scores are shown and the higher one wins -- 10 / 15 / 20 points for an easy / medium / hard game. A draw
// pays nothing. Players save their answers as they go, so when the game is stopped the other player's answers so far are what counts.

export const CHALLENGE_COUNTS = [5, 10, 15, 20] as const;
export const CHALLENGE_SUBJECTS = ['math', 'science'] as const;
export const CHALLENGE_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type ChallengeDifficulty = (typeof CHALLENGE_DIFFICULTIES)[number];
export const CHALLENGE_POINTS: Record<ChallengeDifficulty, number> = { easy: 10, medium: 15, hard: 20 };
export const GAME_MS = 5 * 60 * 1000;
// An invitation nobody answers lapses after this long, so it never blocks either friend from starting another game.
export const INVITE_MS = 3 * 60 * 1000;
// Two accounts could trade wins to farm points, so a player is paid for at most this many wins a day (further wins still count as wins).
export const DAILY_PAID_WINS = 5;

type Answers = Record<string, number>;

const parse = (json: string): Answers => {
  try {
    const v = JSON.parse(json);
    return v && typeof v === 'object' ? (v as Answers) : {};
  } catch {
    return {};
  }
};

function questionsOf(row: any): any[] {
  const ids = JSON.parse(row.question_ids_json) as number[];
  if (ids.length === 0) return [];
  const rows = db.prepare(`SELECT * FROM challenge_questions WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as any[];
  const byId = new Map(rows.map((q) => [q.id, q]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

function scoreOf(questions: any[], answers: Answers): number {
  return questions.reduce((n, q) => n + (answers[String(q.id)] === q.correct_index ? 1 : 0), 0);
}

/** Ends an active game: grades both players from their saved answers, picks the winner and pays the points. Safe to call twice. */
export function finishChallenge(id: number, submittedBy: number | null) {
  const row = db.prepare(`SELECT * FROM friend_challenges WHERE id = ?`).get(id) as any;
  if (!row || row.status !== 'active') return;
  const questions = questionsOf(row);
  const challengerScore = scoreOf(questions, parse(row.challenger_answers_json));
  const challengedScore = scoreOf(questions, parse(row.challenged_answers_json));
  const winnerId = challengerScore === challengedScore ? null : challengerScore > challengedScore ? row.challenger_id : row.challenged_id;

  let points = 0;
  if (winnerId !== null) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const paidToday = (
      db.prepare(`SELECT COUNT(*) c FROM friend_challenges WHERE winner_id = ? AND points > 0 AND finished_ms >= ?`).get(winnerId, startOfDay.getTime()) as {
        c: number;
      }
    ).c;
    if (paidToday < DAILY_PAID_WINS) points = CHALLENGE_POINTS[row.difficulty as ChallengeDifficulty];
  }
  const done = db
    .prepare(
      `UPDATE friend_challenges SET status = 'finished', finished_ms = ?, submitted_by = ?, challenger_score = ?, challenged_score = ?, winner_id = ?, points = ?
       WHERE id = ? AND status = 'active'`
    )
    .run(Date.now(), submittedBy, challengerScore, challengedScore, winnerId, points, id);
  if (done.changes && winnerId !== null && points > 0) awardXp(winnerId, points, 'friend_challenge');
}

/** Lapses invitations nobody answered and finishes games whose 5 minutes are up, for one player's challenges. */
function settle(userId: number) {
  const now = Date.now();
  db.prepare(`UPDATE friend_challenges SET status = 'expired' WHERE status = 'pending' AND created_ms < ? AND (challenger_id = ? OR challenged_id = ?)`).run(
    now - INVITE_MS, userId, userId
  );
  const late = db
    .prepare(`SELECT id FROM friend_challenges WHERE status = 'active' AND ends_ms < ? AND (challenger_id = ? OR challenged_id = ?)`)
    .all(now, userId, userId) as { id: number }[];
  for (const l of late) finishChallenge(l.id, null);
}

/** Does this player already have an invitation out or a game going? (After settling the lapsed ones.) */
export function isBusy(userId: number): boolean {
  settle(userId);
  return !!db.prepare(`SELECT 1 FROM friend_challenges WHERE status IN ('pending','active') AND (challenger_id = ? OR challenged_id = ?)`).get(userId, userId);
}

/** The one challenge this player should be looking at now: the running game, else an invitation, else a result they have not closed yet. */
export function currentChallenge(userId: number) {
  settle(userId);
  const row = db
    .prepare(
      `SELECT * FROM friend_challenges
       WHERE (challenger_id = ? OR challenged_id = ?)
         AND (status IN ('pending','active')
              OR (challenger_id = ? AND challenger_seen = 0) OR (challenged_id = ? AND challenged_seen = 0))
       ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, id DESC LIMIT 1`
    )
    .get(userId, userId, userId, userId) as any;
  if (!row) return null;

  const mine = row.challenger_id === userId ? 'challenger' : 'challenged';
  const opponentId = mine === 'challenger' ? row.challenged_id : row.challenger_id;
  const opp = db.prepare(`SELECT username, display_name, avatar_key FROM users WHERE id = ?`).get(opponentId) as any;
  const myAnswers = parse(mine === 'challenger' ? row.challenger_answers_json : row.challenged_answers_json);
  const theirAnswers = parse(mine === 'challenger' ? row.challenged_answers_json : row.challenger_answers_json);

  const base: Record<string, unknown> = {
    id: row.id,
    role: mine,
    status: row.status,
    subject: row.subject,
    difficulty: row.difficulty,
    count: row.question_count,
    prize: CHALLENGE_POINTS[row.difficulty as ChallengeDifficulty],
    opponent: { username: opp?.username ?? '', displayName: opp?.display_name ?? '', avatarKey: opp?.avatar_key ?? 'falcon' },
    now: Date.now(),
    endsAt: row.ends_ms,
  };

  if (row.status === 'active') {
    base.myAnswers = myAnswers;
    base.questions = questionsOf(row).map((q) => ({
      id: q.id,
      text: q.question_text,
      textAr: q.question_text_ar,
      choices: JSON.parse(q.choices_json),
      choicesAr: JSON.parse(q.choices_json_ar),
    }));
  }

  if (row.status === 'finished') {
    const myScore = mine === 'challenger' ? row.challenger_score : row.challenged_score;
    const theirScore = mine === 'challenger' ? row.challenged_score : row.challenger_score;
    base.result = {
      myScore,
      theirScore,
      total: row.question_count,
      winner: row.winner_id === null ? 'draw' : row.winner_id === userId ? 'me' : 'them',
      points: row.points,
      submittedByMe: row.submitted_by === userId,
      timeUp: row.submitted_by === null,
      // the answers are shown now the game is over
      review: questionsOf(row).map((q) => ({
        text: q.question_text,
        textAr: q.question_text_ar,
        choices: JSON.parse(q.choices_json),
        choicesAr: JSON.parse(q.choices_json_ar),
        correctIndex: q.correct_index,
        mine: myAnswers[String(q.id)] ?? -1,
        theirs: theirAnswers[String(q.id)] ?? -1,
        explanation: q.explanation,
        explanationAr: q.explanation_ar,
      })),
    };
  }
  return base;
}
