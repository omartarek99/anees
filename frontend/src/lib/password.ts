// What a new password must be. The backend (backend/src/lib/password.ts) is the one that enforces it; keep the two in
// step. This copy shows the rules while the user types, so they are never surprised by the server's answer.
const PASSWORD_MIN = 10;
const COMMON_WORDS = /password|passw0rd|qwerty|asdfgh|12345|letmein|welcome|iloveyou|admin|anees/i;

// `key` is the i18n entry (auth.<key>) that says it.
export const passwordRules = [
  { key: 'pwRuleLength', ok: (p: string) => p.length >= PASSWORD_MIN },
  { key: 'pwRuleUpper', ok: (p: string) => /\p{Lu}/u.test(p) },
  { key: 'pwRuleLower', ok: (p: string) => /\p{Ll}/u.test(p) },
  { key: 'pwRuleNumber', ok: (p: string) => /\p{Nd}/u.test(p) },
  { key: 'pwRuleSymbol', ok: (p: string) => /[^\p{L}\p{N}\s]/u.test(p) },
] as const;

/** What is wrong beyond the five rules, as an i18n key: a common word, or longer than bcrypt reads (72 bytes). */
export function passwordFlaw(p: string): 'pwCommon' | 'pwTooLong' | null {
  if (COMMON_WORDS.test(p)) return 'pwCommon';
  return new TextEncoder().encode(p).length > 72 ? 'pwTooLong' : null;
}

export const isStrongPassword = (p: string) => passwordRules.every((r) => r.ok(p)) && !passwordFlaw(p);
