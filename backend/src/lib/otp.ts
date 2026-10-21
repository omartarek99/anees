import crypto from 'node:crypto';
import { db } from '../db/db.js';

// Emailed 6-digit codes. Only an HMAC of the code is stored, never the code itself. Two separate
// uses, each with its own table so a code for one can never be used for the other:
//   'verify' = confirm a new account's email,  'reset' = reset a forgotten password.
export type OtpKind = 'verify' | 'reset';
const TABLE: Record<OtpKind, string> = { verify: 'email_otps', reset: 'password_reset_otps' };

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5; // wrong guesses allowed per code -- then a new code is needed
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_HOUR = 6;
const HOUR_MS = 60 * 60 * 1000;

type OtpRow = {
  user_id: number;
  code_hash: string;
  expires_at: string;
  attempts: number;
  last_sent_at: string;
  send_count: number;
  window_start: string;
};

function hashCode(kind: OtpKind, userId: number, code: string): string {
  return crypto.createHmac('sha256', process.env.ENCRYPTION_KEY ?? '').update(`${kind}:${userId}:${code}`).digest('hex');
}

export type CreateOtpResult = { ok: true; code: string } | { ok: false; reason: 'cooldown' | 'too_many' };

/** Creates (or replaces) the user's code. Refuses if one was sent less than a minute ago, or
 * if too many were requested within the hour -- so the endpoint can't be used to spam an
 * inbox or to farm guesses by requesting codes endlessly. */
export function createOtp(userId: number, kind: OtpKind = 'verify'): CreateOtpResult {
  const table = TABLE[kind];
  const now = Date.now();
  const row = db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).get(userId) as OtpRow | undefined;

  let windowStart = now;
  let sendCount = 1;
  if (row) {
    if (now - Date.parse(row.last_sent_at) < RESEND_COOLDOWN_MS) return { ok: false, reason: 'cooldown' };
    if (now - Date.parse(row.window_start) < HOUR_MS) {
      if (row.send_count >= MAX_SENDS_PER_HOUR) return { ok: false, reason: 'too_many' };
      windowStart = Date.parse(row.window_start);
      sendCount = row.send_count + 1;
    }
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  db.prepare(
    `INSERT INTO ${table} (user_id, code_hash, expires_at, attempts, last_sent_at, send_count, window_start)
     VALUES (?,?,?,0,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
       attempts = 0, last_sent_at = excluded.last_sent_at, send_count = excluded.send_count, window_start = excluded.window_start`
  ).run(
    userId,
    hashCode(kind, userId, code),
    new Date(now + OTP_TTL_MS).toISOString(),
    new Date(now).toISOString(),
    sendCount,
    new Date(windowStart).toISOString()
  );
  return { ok: true, code };
}

export type VerifyOtpResult = 'ok' | 'invalid' | 'expired' | 'locked';

/** Checks a submitted code. Does NOT consume it -- call clearOtp() once everything that has to
 * happen after a correct code has succeeded, so a failure in between doesn't burn the code. */
export function verifyOtp(userId: number, code: string, kind: OtpKind = 'verify'): VerifyOtpResult {
  const table = TABLE[kind];
  const row = db.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).get(userId) as OtpRow | undefined;
  if (!row) return 'expired';
  if (Date.now() > Date.parse(row.expires_at)) return 'expired';
  if (row.attempts >= MAX_ATTEMPTS) return 'locked';

  const given = Buffer.from(hashCode(kind, userId, code));
  const stored = Buffer.from(row.code_hash);
  if (given.length === stored.length && crypto.timingSafeEqual(given, stored)) return 'ok';

  db.prepare(`UPDATE ${table} SET attempts = attempts + 1 WHERE user_id = ?`).run(userId);
  return row.attempts + 1 >= MAX_ATTEMPTS ? 'locked' : 'invalid';
}

export function clearOtp(userId: number, kind: OtpKind = 'verify'): void {
  db.prepare(`DELETE FROM ${TABLE[kind]} WHERE user_id = ?`).run(userId);
}
