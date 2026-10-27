import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/db.js';

// Question content for the adventure map, built from the school question bank (Math/Science, grades 5-6), easy to medium:
//  - boss fights: seed-data/map-questions.json (scripts/gen-map-questions.mts)
//  - normal levels: seed-data/level-pool.json (scripts/gen-level-pool.mts), a pool per difficulty tier; clicking a level serves 4
//    random questions of its tier (routes/map.ts), there is no video behind a level any more.
// Each file is applied at boot -- on a new and on an already-seeded database alike -- and again only when the file changes (its
// hash is remembered), so the questions stay stable between restarts.

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

function ensureFlags() {
  db.exec(`CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
}
function setFlag(key: string, value: string) {
  db.prepare(`INSERT INTO app_flags (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}
function getFlag(key: string): string | undefined {
  return (db.prepare(`SELECT value FROM app_flags WHERE key = ?`).get(key) as { value: string } | undefined)?.value;
}

function readSeed(name: string): { raw: string; hash: string } | null {
  try {
    const raw = fs.readFileSync(path.join(SEED_DIR, name), 'utf8');
    return { raw, hash: crypto.createHash('sha256').update(raw).digest('hex') };
  } catch {
    return null; // no file shipped: keep what the database already has
  }
}

export function applyMapQuestions() {
  const file = readSeed('map-questions.json');
  if (!file) return;
  ensureFlags();
  if (getFlag('map_questions_hash') === file.hash) return;

  const levels = (JSON.parse(file.raw) as { levels: Record<string, FileQ[]> }).levels;
  const findLevel = db.prepare(`SELECT id, kind FROM map_levels WHERE level_number = ?`);
  const clearBossQs = db.prepare(`DELETE FROM boss_questions WHERE map_level_id = ?`);
  const addBossQ = db.prepare(
    `INSERT INTO boss_questions (map_level_id, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, explanation_ar, order_in_fight) VALUES (?,?,?,?,?,?,?,?,?)`
  );

  let applied = 0;
  db.exec('BEGIN');
  try {
    for (const [num, qs] of Object.entries(levels)) {
      const level = findLevel.get(Number(num)) as { id: number; kind: string } | undefined;
      if (!level || level.kind !== 'boss' || !qs.length) continue;
      clearBossQs.run(level.id);
      qs.forEach((q, i) =>
        addBossQ.run(
          level.id, q.questionText, q.questionTextAr ?? '', JSON.stringify(q.choices),
          JSON.stringify(q.choicesAr?.length === 4 ? q.choicesAr : ['', '', '', '']), q.correctIndex, q.explanation, q.explanationAr ?? '', i + 1
        )
      );
      applied++;
    }
    setFlag('map_questions_hash', file.hash);
    db.exec('COMMIT');
    console.log(`[map] Loaded school question-bank questions for ${applied} boss fights.`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[map] Could not load the boss questions:', err);
  }
}

export function applyLevelPool() {
  db.exec(`CREATE TABLE IF NOT EXISTS level_quiz_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subject TEXT NOT NULL,
    grade INTEGER NOT NULL,
    tier INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    question_text_ar TEXT NOT NULL DEFAULT '',
    choices_json TEXT NOT NULL,
    choices_json_ar TEXT NOT NULL DEFAULT '[]',
    correct_index INTEGER NOT NULL,
    explanation TEXT NOT NULL,
    explanation_ar TEXT NOT NULL DEFAULT ''
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_level_quiz_pick ON level_quiz_questions(subject, grade, tier)`);
  const file = readSeed('level-pool.json');
  if (!file) return;
  ensureFlags();
  if (getFlag('level_pool_hash') === file.hash) return;

  const cells = (JSON.parse(file.raw) as { cells: { subject: string; grade: number; tier: number; questions: FileQ[] }[] }).cells;
  const add = db.prepare(
    `INSERT INTO level_quiz_questions (subject, grade, tier, question_text, question_text_ar, choices_json, choices_json_ar, correct_index, explanation, explanation_ar) VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM level_quiz_questions');
    let n = 0;
    for (const c of cells) {
      for (const q of c.questions) {
        add.run(
          c.subject, c.grade, c.tier, q.questionText, q.questionTextAr ?? '', JSON.stringify(q.choices),
          JSON.stringify(q.choicesAr?.length === 4 ? q.choicesAr : ['', '', '', '']), q.correctIndex, q.explanation, q.explanationAr ?? ''
        );
        n++;
      }
    }
    setFlag('level_pool_hash', file.hash);
    db.exec('COMMIT');
    console.log(`[map] Loaded ${n} level-quiz questions.`);
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[map] Could not load the level-quiz pool:', err);
  }
}

// The built-in map lessons (reels with no author and no grade) are gone for good: map levels are question rounds now. Runs once per
// database. Their questions and watch records go with them (ON DELETE CASCADE); teachers' own videos are never touched.
export function removeDefaultVideos() {
  ensureFlags();
  if (getFlag('default_videos_removed')) return;
  const info = db.prepare(`DELETE FROM reels WHERE grade IS NULL AND author_user_id IS NULL`).run();
  setFlag('default_videos_removed', '1');
  console.log(`[map] Removed ${info.changes} default video(s).`);
}
