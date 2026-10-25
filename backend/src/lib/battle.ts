import { db } from '../db/db.js';

// Boss battles are limited: three lost fights, then a 24-hour wait counted from the moment of the last loss. The tries
// also come back by themselves a day after the first loss of a streak. A cleared boss can be replayed freely (see map.ts).

export const BATTLE_TRIES = 3;
export const BATTLE_WAIT_MS = 24 * 60 * 60 * 1000;

export type BattleStatus = {
  triesLeft: number;
  maxTries: number;
  /** ISO time the wait ends, or null when the player can fight. */
  lockedUntil: string | null;
};

type Row = { fails: number; window_start: string | null; locked_until: string | null };

const readRow = (userId: number) => db.prepare(`SELECT fails, window_start, locked_until FROM battle_status WHERE user_id = ?`).get(userId) as Row | undefined;

export function getBattleStatus(userId: number, now = Date.now()): BattleStatus {
  const row = readRow(userId);
  const lockedUntil = row?.locked_until ? Date.parse(row.locked_until) : 0;
  if (lockedUntil > now) return { triesLeft: 0, maxTries: BATTLE_TRIES, lockedUntil: new Date(lockedUntil).toISOString() };
  const windowOpen = row?.window_start && now - Date.parse(row.window_start) < BATTLE_WAIT_MS;
  return { triesLeft: BATTLE_TRIES - (windowOpen ? row!.fails : 0), maxTries: BATTLE_TRIES, lockedUntil: null };
}

/** Counts a lost fight; the third loss starts the 24-hour wait. */
export function recordBattleLoss(userId: number, now = Date.now()): BattleStatus {
  const row = readRow(userId);
  const windowOpen = row?.window_start && now - Date.parse(row.window_start) < BATTLE_WAIT_MS;
  const fails = (windowOpen ? row!.fails : 0) + 1;
  const windowStart = windowOpen ? row!.window_start : new Date(now).toISOString();
  const locked = fails >= BATTLE_TRIES;
  db.prepare(
    `INSERT INTO battle_status (user_id, fails, window_start, locked_until) VALUES (?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET fails = excluded.fails, window_start = excluded.window_start, locked_until = excluded.locked_until`
  ).run(userId, locked ? 0 : fails, locked ? null : windowStart, locked ? new Date(now + BATTLE_WAIT_MS).toISOString() : null);
  return getBattleStatus(userId, now);
}

/** SQL for "has beaten level 50, the treasure battle": those players wear the shield next to their name. `userId` is the column to test. */
export const shieldSql = (userId: string) =>
  `EXISTS (SELECT 1 FROM user_level_progress p JOIN map_levels m ON m.id = p.map_level_id
    WHERE p.user_id = ${userId} AND m.level_number = 50 AND p.status = 'completed')`;

export const hasShield = (userId: number): boolean => !!(db.prepare(`SELECT ${shieldSql('?')} AS s`).get(userId) as { s: number }).s;
