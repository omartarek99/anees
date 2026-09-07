import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'app.db');

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

// `CREATE TABLE IF NOT EXISTS` above won't add columns to a table that already
// existed from an earlier run — the craft world moved from 2D to 3D and needs a
// third movement axis, so patch it in for databases created before that change.
const craftSaveCols = db.prepare(`PRAGMA table_info(craft_saves)`).all() as { name: string }[];
if (!craftSaveCols.some((c) => c.name === 'player_z')) {
  db.exec(`ALTER TABLE craft_saves ADD COLUMN player_z REAL NOT NULL DEFAULT 0`);
}
// Endless-world / survival update: save-format version + player health & hunger.
if (!craftSaveCols.some((c) => c.name === 'version')) {
  db.exec(`ALTER TABLE craft_saves ADD COLUMN version INTEGER NOT NULL DEFAULT 1`);
}
if (!craftSaveCols.some((c) => c.name === 'hp')) {
  db.exec(`ALTER TABLE craft_saves ADD COLUMN hp INTEGER NOT NULL DEFAULT 20`);
}
if (!craftSaveCols.some((c) => c.name === 'food')) {
  db.exec(`ALTER TABLE craft_saves ADD COLUMN food INTEGER NOT NULL DEFAULT 20`);
}

// Student/teacher accounts + student grade level, added after the initial users table.
const userCols = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
if (!userCols.some((c) => c.name === 'role')) {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL CHECK (role IN ('student','teacher')) DEFAULT 'student'`);
}
if (!userCols.some((c) => c.name === 'grade')) {
  db.exec(`ALTER TABLE users ADD COLUMN grade INTEGER`);
}
// Supabase-backed email verification, added after the initial users table.
if (!userCols.some((c) => c.name === 'email_verified')) {
  db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`);
}
// Teacher ID document (Supabase Storage path), added after the initial users table.
if (!userCols.some((c) => c.name === 'id_document_path')) {
  db.exec(`ALTER TABLE users ADD COLUMN id_document_path TEXT`);
}
// Firebase-backed accounts (auth moved from Supabase to Firebase), added after the
// initial users table. Null for seed/legacy accounts, which still use password_hash.
// SQLite's ALTER TABLE ADD COLUMN can't carry a UNIQUE constraint, so that's enforced
// via the separate partial index below instead -- which must run after this column
// exists, so it can't live in schema.sql (that runs before these migrations, and would
// fail on any pre-existing database that doesn't have the column yet).
if (!userCols.some((c) => c.name === 'firebase_uid')) {
  db.exec(`ALTER TABLE users ADD COLUMN firebase_uid TEXT`);
}
// Typed-code email verification was tried and reverted in favor of Firebase's built-in
// link-based flow -- drop the columns from any database that briefly had them.
if (userCols.some((c) => c.name === 'verification_code_hash')) {
  db.exec(`ALTER TABLE users DROP COLUMN verification_code_hash`);
}
if (userCols.some((c) => c.name === 'verification_code_expires_at')) {
  db.exec(`ALTER TABLE users DROP COLUMN verification_code_expires_at`);
}
db.exec(
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL`
);

// Teacher-authored announcements, added after the initial news_posts table.
const newsCols = db.prepare(`PRAGMA table_info(news_posts)`).all() as { name: string }[];
if (!newsCols.some((c) => c.name === 'author_user_id')) {
  db.exec(`ALTER TABLE news_posts ADD COLUMN author_user_id INTEGER REFERENCES users(id)`);
}

// Teacher-authored reel lessons, added after the initial reels table.
const reelCols = db.prepare(`PRAGMA table_info(reels)`).all() as { name: string }[];
if (!reelCols.some((c) => c.name === 'author_user_id')) {
  db.exec(`ALTER TABLE reels ADD COLUMN author_user_id INTEGER REFERENCES users(id)`);
}
// Grade-based teacher reels, decoupled from map levels, added after the initial reels table.
if (!reelCols.some((c) => c.name === 'grade')) {
  db.exec(`ALTER TABLE reels ADD COLUMN grade INTEGER`);
}

// Quiz-completion marker for grade-based reels, added after the initial
// reel_watch_progress table.
const reelWatchCols = db.prepare(`PRAGMA table_info(reel_watch_progress)`).all() as { name: string }[];
if (!reelWatchCols.some((c) => c.name === 'quiz_completed')) {
  db.exec(`ALTER TABLE reel_watch_progress ADD COLUMN quiz_completed INTEGER NOT NULL DEFAULT 0`);
}
