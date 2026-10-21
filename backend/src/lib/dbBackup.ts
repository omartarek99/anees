import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { supabaseAdmin } from './supabase.js';

// Keeps the SQLite database alive on hosts with no persistent disk (e.g. Render's free plan, where
// the app folder is wiped on every deploy/restart): a snapshot is uploaded to a PRIVATE Supabase
// Storage bucket whenever the data changed, and downloaded again at startup if there is no local
// database file. With a real persistent disk the local file already exists at startup, so nothing
// is restored -- the snapshots then simply act as an off-site backup.
//
// On by default in production when Supabase is configured. DB_BACKUP=off disables it, DB_BACKUP=on
// forces it outside production (used for testing).

const BUCKET = process.env.DB_BACKUP_BUCKET ?? 'db-backups';
const OBJECT = process.env.DB_BACKUP_OBJECT ?? 'app.db';
const INTERVAL_MS = Math.max(5, Number(process.env.DB_BACKUP_INTERVAL_SEC ?? 60)) * 1000;

export function backupEnabled(): boolean {
  if (!supabaseAdmin) return false;
  const flag = process.env.DB_BACKUP;
  if (flag === 'off') return false;
  return flag === 'on' || process.env.NODE_ENV === 'production';
}

// Only true once we know the local database is the authority: either it was restored from the
// backup, there was no backup yet (first ever run), or a local file already existed. If reading
// the backup FAILED we never upload, so an empty fresh database can't overwrite a good backup.
let uploadsAllowed = false;
let uploading = false;

async function ensureBucket(): Promise<void> {
  const { error } = await supabaseAdmin!.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw new Error(`could not create the "${BUCKET}" bucket: ${error.message}`);
  }
}

/** Call BEFORE opening the database. Throws (so the host restarts the server) if an existing
 * backup can't be read -- starting empty then would let people sign up into data that is lost. */
export async function restoreDatabaseIfMissing(dbPath: string): Promise<void> {
  if (!backupEnabled()) return;
  if (fs.existsSync(dbPath)) {
    uploadsAllowed = true;
    console.log('[backup] a local database file exists -- not restoring from the backup');
    return;
  }
  await ensureBucket();
  const { data, error } = await supabaseAdmin!.storage.from(BUCKET).download(OBJECT);
  if (error) {
    if (/not found|404|does not exist/i.test(`${error.message} ${JSON.stringify(error)}`)) {
      uploadsAllowed = true;
      console.log('[backup] no backup found yet -- starting a new database');
      return;
    }
    throw new Error(`[backup] could not read the database backup: ${error.message}`);
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, bytes);
  uploadsAllowed = true;
  console.log(`[backup] restored the database from the backup (${Math.round(bytes.length / 1024)} KB)`);
}

/** Uploads a consistent snapshot (VACUUM INTO folds the WAL in). Never throws. */
export async function backupNow(db: DatabaseSync, reason: string): Promise<boolean> {
  if (!backupEnabled() || !uploadsAllowed || uploading) return false;
  uploading = true;
  const tmp = path.join(os.tmpdir(), `anees-backup-${process.pid}-${Date.now()}.db`);
  try {
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const bytes = fs.readFileSync(tmp);
    const bucket = supabaseAdmin!.storage.from(BUCKET);
    // Keep the previous good snapshot as ".prev" in case the newest one is ever bad.
    await bucket.remove([`${OBJECT}.prev`]);
    await bucket.copy(OBJECT, `${OBJECT}.prev`);
    const { error } = await bucket.upload(OBJECT, bytes, { upsert: true, contentType: 'application/octet-stream' });
    if (error) throw new Error(error.message);
    console.log(`[backup] saved the database to Supabase (${Math.round(bytes.length / 1024)} KB, ${reason})`);
    return true;
  } catch (err) {
    console.error('[backup] saving the database failed:', err instanceof Error ? err.message : err);
    return false;
  } finally {
    uploading = false;
    fs.rmSync(tmp, { force: true });
  }
}

/** Snapshot whenever something changed (checked every DB_BACKUP_INTERVAL_SEC, default 60), and
 * once more when the host stops the server (deploys and restarts send SIGTERM first). */
export function startDatabaseBackups(db: DatabaseSync): void {
  if (!backupEnabled()) return;
  let lastChanges = -1;
  const timer = setInterval(async () => {
    const { c } = db.prepare(`SELECT total_changes() AS c`).get() as { c: number };
    if (c === lastChanges) return;
    if (await backupNow(db, 'changes')) lastChanges = c;
  }, INTERVAL_MS);
  timer.unref();

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, async () => {
      await backupNow(db, `shutdown (${signal})`);
      process.exit(0);
    });
  }
  console.log(`[backup] on: snapshots go to the private "${BUCKET}" bucket every ${INTERVAL_MS / 1000}s when data changed`);
}
