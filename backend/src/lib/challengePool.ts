import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/db.js';

// The questions of friend challenges ("تحدى صديقك"), from the school question bank (Math and Science, grades 5 and 6), with their answers:
//  - easy: the first tiers of the map's level pool (seed-data/level-pool.json, written by scripts/gen-level-pool.mts)
//  - medium: its top tiers
//  - hard: seed-data/challenge-hard.json (scripts/gen-challenge-hard.mts)
// Loaded at start-up into challenge_questions, and again only when one of the two files changes.

type FileQ = {
  questionText: string;
  questionTextAr?: string;
  choices: string[];
  choicesAr?: string[];
  correctIndex: number;
  explanation: string;
  explanationAr?: string;
};

const SEED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../seed-data');
const EASY_TIERS = [1, 2, 3, 4];
const MEDIUM_TIERS = [7, 8, 9, 10];

function read(name: string): string | null {
  try {
    return fs.readFileSync(path.join(SEED_DIR, name), 'utf8');
  } catch {
    return null;
  }
}

export function applyChallengePool() {
  db.exec(`CREATE TABLE IF NOT EXISTS challenge_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    grade INTEGER NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('easy','medium','hard')),
    question_text TEXT NOT NULL,
    question_text_ar TEXT NOT NULL DEFAULT '',
    choices_json TEXT NOT NULL,
    choices_json_ar TEXT NOT NULL DEFAULT '[]',
    correct_index INTEGER NOT NULL,
    explanation TEXT NOT NULL,
    explanation_ar TEXT NOT NULL DEFAULT ''
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_challenge_questions_pick ON challenge_questions(subject, grade, difficulty)`);
  db.exec(`CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

  const level = read('level-pool.json');
  const hard = read('challenge-hard.json');
  if (!level && !hard) return;
  const hash = crypto.createHash('sha256').update(`${level ?? ''}|${hard ?? ''}`).digest('hex');
  const done = db.prepare(`SELECT value FROM app_flags WHERE key = 'challenge_pool_hash'`).get() as { value: string } | undefined;
  if (done?.value === hash) return;

  const add = db.prepare(
    `INSERT INTO challenge_questions (subject, grade, difficulty, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, explanation_ar) VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  const insert = (subject: string, grade: number, difficulty: string, q: FileQ) =>
    add.run(
      subject, grade, difficulty, q.questionText, q.questionTextAr ?? '', JSON.stringify(q.choices),
      JSON.stringify(q.choicesAr?.length === 4 ? q.choicesAr : ['', '', '', '']), q.correctIndex, q.explanation, q.explanationAr ?? ''
    );

  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM challenge_questions');
    let n = 0;
    if (level) {
      const cells = (JSON.parse(level) as { cells: { subject: string; grade: number; tier: number; questions: FileQ[] }[] }).cells;
      for (const c of cells) {
        const difficulty = EASY_TIERS.includes(c.tier) ? 'easy' : MEDIUM_TIERS.includes(c.tier) ? 'medium' : null;
        if (!difficulty) continue;
        for (const q of c.questions) {
          insert(c.subject, c.grade, difficulty, q);
          n++;
        }
      }
    }
    if (hard) {
      const cells = (JSON.parse(hard) as { cells: { subject: string; grade: number; questions: FileQ[] }[] }).cells;
      for (const c of cells) {
        for (const q of c.questions) {
          insert(c.subject, c.grade, 'hard', q);
          n++;
        }
      }
    }
    db.prepare(`INSERT INTO app_flags (key, value) VALUES ('challenge_pool_hash', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(hash);
    db.exec('COMMIT');
    console.log(`[challenge] Loaded ${n} friend-challenge questions.`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[challenge] Could not load the challenge questions:', err);
  }
}
