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
