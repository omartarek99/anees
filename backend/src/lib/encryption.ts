import crypto from 'node:crypto';

// AES-256-GCM: authenticated encryption, so a tampered/corrupted ciphertext throws on
// decrypt instead of silently returning garbage -- important for a column an attacker with
// raw DB-file access might otherwise try to flip bits in.
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce, the GCM-recommended size (not the AES block size).

const keyHex = process.env.ENCRYPTION_KEY;
if (!keyHex || !/^[0-9a-f]{64}$/i.test(keyHex)) {
  // Unlike Firebase/Supabase/Gemini (optional features that log a warning and no-op), this
  // can't degrade gracefully -- the users table's email column is stored encrypted once
  // migrated (see db.ts), so a missing/wrong key means every read of it throws, not "one
  // feature is disabled." Failing loudly at boot beats failing confusingly per-request.
  throw new Error(
    'ENCRYPTION_KEY is missing or not 64 hex characters (32 bytes). Generate one with ' +
      `\`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\` and set it ` +
      'in backend/.env (see backend/.env.example). Changing this key makes existing encrypted ' +
      'data unreadable -- back it up like any other secret, don\'t rotate it casually.'
  );
}
const KEY = Buffer.from(keyHex, 'hex');

/** Encrypts a plaintext string for storage. Output encodes the per-call random IV and the
 * GCM auth tag alongside the ciphertext (all hex, colon-joined) so decrypt() is self-contained
 * -- callers never need to manage IVs themselves. Non-deterministic: encrypting the same
 * input twice gives different output, which is why lookups use hashForLookup() instead. */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

export function decrypt(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Malformed encrypted value (expected iv:authTag:ciphertext).');
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Deterministic, non-reversible lookup key for an encrypted column -- encrypt() can't be
 * searched/uniqueness-checked directly (random IV means the same email encrypts differently
 * every time), so callers store/query this alongside the encrypted value instead. Normalizes
 * the same way the old plaintext `lower(email)` comparisons did, so existing case-insensitive
 * matching behavior doesn't change. HMAC (not a plain hash) so the lookup key itself can't be
 * brute-forced offline from the DB file without also having ENCRYPTION_KEY. */
export function hashForLookup(value: string): string {
  return crypto.createHmac('sha256', KEY).update(value.trim().toLowerCase()).digest('hex');
}
