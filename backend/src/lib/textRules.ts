import { z } from 'zod';

// The server's half of the text rules (the browser's half, for messages while typing: frontend/src/lib/textRules.ts). Each field gets a
// message that says exactly what is wrong with what was typed; the English sentence is what the API sends, and the frontend shows its
// Arabic translation (i18n.ts apiErrorMap). An empty value passes here: whether a field may be empty is the schema's business.

const LETTER = /\p{L}/u;
const ARABIC_LETTER = /[ء-يٱ-ۓ]/;
const DIGIT = /\p{Nd}/u;
/** letters of either alphabet, numbers (Western or Arabic-Indic) and _ */
export const USERNAME_CHARS = /^[A-Za-z0-9_ء-ي٠-٩ٱ-ۓ]+$/;

const isRepeatedLetter = (s: string) => {
  const letters = [...s].filter((c) => LETTER.test(c));
  return letters.length >= 4 && new Set(letters.map((c) => c.toLowerCase())).size === 1;
};
const wordCount = (s: string) => s.split(/\s+/).filter((w) => LETTER.test(w)).length;
const blankOr = (test: (s: string) => boolean) => (s: string) => !s.trim() || test(s.trim());

export const REPEATED = 'This looks like one letter typed again and again. Write real words.';

/** A name (a person's, a school's): needs letters. */
export const nameText = (schema: z.ZodString, what: string) =>
  schema
    .refine(blankOr((s) => LETTER.test(s)), `Write the ${what} in letters, not only numbers or symbols.`)
    .refine(blankOr((s) => !isRepeatedLetter(s)), REPEATED);

/** A title, a lesson name, a bio: needs letters. */
export const wordsText = (schema: z.ZodString, what: string) =>
  schema
    .refine(blankOr((s) => LETTER.test(s)), `Write the ${what} in words, not only numbers or symbols.`)
    .refine(blankOr((s) => !isRepeatedLetter(s)), REPEATED);

/** An explanation: at least 3 real words. */
export const sentenceText = (schema: z.ZodString, what: string) =>
  schema
    .refine(blankOr((s) => LETTER.test(s)), `Write the ${what} in words, not only numbers or symbols.`)
    .refine(blankOr((s) => !isRepeatedLetter(s)), REPEATED)
    .refine(blankOr((s) => !LETTER.test(s) || wordCount(s) >= 3), `The ${what} is too short. Write it in at least 3 words.`);

/** A quiz question: words or numbers ("7 × 6 = ?" is a fine maths question), not symbols only. */
export const questionText = (schema: z.ZodString) =>
  schema.refine(blankOr((s) => LETTER.test(s) || DIGIT.test(s)), 'Write the question in words or numbers, not only symbols.');

/** The Arabic copy of a text: when it is filled in, it has to be Arabic. */
export const arabicText = (schema: z.ZodString, what: string) =>
  schema.refine(blankOr((s) => ARABIC_LETTER.test(s)), `The Arabic ${what} has no Arabic letters. Write it in Arabic, or leave it empty.`);

/** No two answers of one question may be the same (ignoring case and extra spaces). */
export const distinctChoices = (choices: string[]) => {
  const keys = choices.map((c) => c.trim().toLowerCase().replace(/\s+/g, ' ')).filter(Boolean);
  return new Set(keys).size === keys.length;
};
export const DUPLICATE_CHOICES = 'Two answers of a question are the same. Make every answer different.';
