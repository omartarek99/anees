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

// Teacher-authored announcements, added after the initial news_posts table.
const newsCols = db.prepare(`PRAGMA table_info(news_posts)`).all() as { name: string }[];
if (!newsCols.some((c) => c.name === 'author_user_id')) {
  db.exec(`ALTER TABLE news_posts ADD COLUMN author_user_id INTEGER REFERENCES users(id)`);
}
