import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encrypt, decrypt, hashForLookup } from '../lib/encryption.js';

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

// Admin role support: SQLite can't relax an existing CHECK constraint (here, role IN
// ('student','teacher')) via ALTER TABLE -- the only way to widen it on a database that
// already has the old constraint is a full table rebuild. Detected by checking the stored
// constraint text directly rather than a version counter, matching this file's existing
// column-presence-based migration style. A brand-new database already gets the wider
// constraint (and is_active) straight from schema.sql above, so this only fires once per
// pre-existing database.
const usersTableSql = (
  db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`).get() as { sql: string }
).sql;
if (!usersTableSql.includes(`'admin'`)) {
  // With foreign_keys still ON (set at the top of this file), DROP TABLE performs an
  // *implicit DELETE FROM users first* per SQLite's own foreign-key documentation -- which
  // would fire every ON DELETE CASCADE that references users(id) (sessions, progress,
  // friends, ...) and wipe the whole app's data. SQLite's own documented procedure for a
  // table rebuild is to disable foreign key enforcement for its duration, then re-enable
  // and verify nothing was left dangling.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN TRANSACTION');
  try {
    // Self-healing: if a previous attempt at this exact migration was interrupted (e.g. the
    // dev server restarting mid-transaction) it can leave a stray, half-populated users_new
    // table from a run that never reached COMMIT. Clearing it first makes this safe to retry
    // rather than failing forever on "table users_new already exists".
    db.exec('DROP TABLE IF EXISTS users_new');
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        avatar_key TEXT NOT NULL DEFAULT 'falcon',
        total_xp INTEGER NOT NULL DEFAULT 0,
        is_seed INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL CHECK (role IN ('student','teacher','admin')) DEFAULT 'student',
        grade INTEGER,
        email_verified INTEGER NOT NULL DEFAULT 0,
        id_document_path TEXT,
        firebase_uid TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO users_new (
        id, username, email, password_hash, display_name, avatar_key, total_xp, is_seed,
        role, grade, email_verified, id_document_path, firebase_uid, created_at
      )
      SELECT
        id, username, email, password_hash, display_name, avatar_key, total_xp, is_seed,
        role, grade, email_verified, id_document_path, firebase_uid, created_at
      FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
    // The old table (and its indexes) is gone along with it -- recreate this one.
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid) WHERE firebase_uid IS NOT NULL`
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
  const danglingRows = db.prepare('PRAGMA foreign_key_check').all();
  if (danglingRows.length > 0) {
    throw new Error(`users table rebuild left dangling foreign keys: ${JSON.stringify(danglingRows)}`);
  }
}

// Admin-issued warnings and timed bans, added after the initial users table. Plain
// nullable columns (no CHECK constraint), so a simple ADD COLUMN is enough -- no rebuild
// needed like the role/is_active change above.
const userColsForModeration = db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[];
if (!userColsForModeration.some((c) => c.name === 'warning_message')) {
  db.exec(`ALTER TABLE users ADD COLUMN warning_message TEXT`);
  db.exec(`ALTER TABLE users ADD COLUMN warning_issued_at TEXT`);
}
if (!userColsForModeration.some((c) => c.name === 'banned_until')) {
  db.exec(`ALTER TABLE users ADD COLUMN banned_until TEXT`);
}
// Public bio text + uploaded profile photo, added after the initial users table. Plain
// columns (no CHECK constraint), so a simple ADD COLUMN is enough -- no rebuild needed.
if (!userColsForModeration.some((c) => c.name === 'bio')) {
  db.exec(`ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''`);
}
if (!userColsForModeration.some((c) => c.name === 'avatar_url')) {
  db.exec(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
}

// Email encryption at rest: `email_hash` (schema.sql) is nullable like firebase_uid above,
// for the same reason -- SQLite's ALTER TABLE can't attach UNIQUE inline, so it's enforced
// by the separate index below instead. A pre-existing database won't have the column yet.
if (!db.prepare(`PRAGMA table_info(users)`).all().some((c: any) => c.name === 'email_hash')) {
  db.exec(`ALTER TABLE users ADD COLUMN email_hash TEXT`);
}
// Backfill: every row without email_hash yet needs its `email` value both hashed (for
// lookups) and, if it's still plaintext from before this feature existed, encrypted in
// place. Detected structurally (matches encrypt()'s `iv:authTag:ciphertext` hex format)
// rather than by a migration-version flag, so this is safe to re-run if a previous attempt
// was interrupted partway (e.g. the dev server restarting mid-loop) without double-encrypting
// a row that already got converted but crashed before its email_hash was written.
const ENCRYPTED_FORMAT = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i;
const unmigrated = db.prepare(`SELECT id, email FROM users WHERE email_hash IS NULL`).all() as {
  id: number;
  email: string;
}[];
if (unmigrated.length > 0) {
  const update = db.prepare(`UPDATE users SET email = ?, email_hash = ? WHERE id = ?`);
  db.exec('BEGIN TRANSACTION');
  try {
    for (const row of unmigrated) {
      const plaintext = ENCRYPTED_FORMAT.test(row.email) ? decrypt(row.email) : row.email;
      update.run(ENCRYPTED_FORMAT.test(row.email) ? row.email : encrypt(plaintext), hashForLookup(plaintext), row.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  console.log(`[db] Encrypted email for ${unmigrated.length} existing user(s).`);
}
db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash)`);

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
// Per-reel "ever scored >=50%" marker -- map-level reels require this on every reel in a
// level before the next level unlocks (see routes/reels.ts POST /:reelId/submit).
if (!reelWatchCols.some((c) => c.name === 'passed_quiz')) {
  db.exec(`ALTER TABLE reel_watch_progress ADD COLUMN passed_quiz INTEGER NOT NULL DEFAULT 0`);
}
