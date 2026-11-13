import { z } from 'zod';

// Everything that decides what a password may be and how a local one is stored. Anyone who signs up has their
// password hashed by Firebase (users.password_hash stays ''); only local accounts (admin, test accounts) keep a
// bcrypt hash of their own, and a database trigger (schema.sql) refuses anything else in that column.

/** bcrypt work factor for every hash we create (OWASP's floor is 10; this is only paid on a local account's login). Kept at 12 on purpose: it takes
 *  about 2.3 s on the free Render plan, so a login rush of local accounts is slow, but a stolen database is harder to crack. 10 would be about
 *  4 times faster (tried and put back). A hash made with a higher cost is re-saved at this one on login (routes/auth.ts). */
export const BCRYPT_COST = 12;

const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes, so a longer password would be only partly checked
// Beats the composition rule on its own ("Password123!" has every kind of character). Keep in step with
// frontend/src/lib/password.ts, which shows the same rules while the user types.
const COMMON_WORDS = /password|passw0rd|qwerty|asdfgh|12345|letmein|welcome|iloveyou|admin|anees/i;

/** A new password: long enough, with a capital letter, a small letter, a number and a symbol, and no common word. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `The password is too short. Use at least ${PASSWORD_MIN} characters.`)
  .refine((p) => Buffer.byteLength(p) <= PASSWORD_MAX_BYTES, 'The password is too long. Use at most 72 characters (an Arabic letter counts as 2).')
  .refine(
    (p) => /\p{Lu}/u.test(p) && /\p{Ll}/u.test(p) && /\p{Nd}/u.test(p) && /[^\p{L}\p{N}\s]/u.test(p),
    'The password needs a capital letter (like A), a small letter (like a), a number and a symbol (like ! or @).'
  )
  .refine((p) => !COMMON_WORDS.test(p), 'This password is too easy to guess. Choose a different one.');
