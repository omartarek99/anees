import { z } from 'zod';

// Everything that decides what a password may be and how a local one is stored. Anyone who signs up has their
// password hashed by Firebase (users.password_hash stays ''); only local accounts (admin, test accounts) keep a
// bcrypt hash of their own, and a database trigger (schema.sql) refuses anything else in that column.

/** bcrypt work factor for every hash we create (OWASP's floor is 10; this is only paid on a local account's login). */
export const BCRYPT_COST = 12;

const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt ignores everything after 72 bytes, so a longer password would be only partly checked
// Beats the composition rule on its own ("Password123!" has every kind of character). Keep in step with
// frontend/src/lib/password.ts, which shows the same rules while the user types.
const COMMON_WORDS = /password|passw0rd|qwerty|asdfgh|12345|letmein|welcome|iloveyou|admin|anees/i;

/** A new password: long enough, with a capital letter, a small letter, a number and a symbol, and no common word. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters.`)
  .refine((p) => Buffer.byteLength(p) <= PASSWORD_MAX_BYTES, 'Password is too long.')
  .refine(
    (p) => /\p{Lu}/u.test(p) && /\p{Ll}/u.test(p) && /\p{Nd}/u.test(p) && /[^\p{L}\p{N}\s]/u.test(p),
    'Password must have a capital letter, a small letter, a number and a symbol.'
  )
  .refine((p) => !COMMON_WORDS.test(p), 'That password is too easy to guess. Choose another.');
