// What a person types must make sense for the field it is in, and when it doesn't, they are told exactly what is wrong (the same rules
// run on the server: backend/src/lib/textRules.ts, which has the final say). Each rule returns the key of its message in i18n.ts
// (section `validation`), or null when the text is fine. An empty value is never a problem here: "required" is checked separately.
//
//   username  letters (Arabic or English), numbers and _ only, with at least one letter
//   name      a person's or a school's name: needs letters
//   words     a title, a lesson name, a bio: needs letters, not one character typed again and again
//   sentence  a lesson explanation or an answer's explanation: at least 3 real words
//   question  a quiz question: words or numbers ("7 × 6 = ?" is fine), not symbols only
//   arabic    an Arabic copy of a text: needs Arabic letters
export type TextRule = 'username' | 'name' | 'words' | 'sentence' | 'question' | 'arabic';

const LETTER = /\p{L}/u;
const ARABIC_LETTER = /[ء-يٱ-ۓ]/;
const USERNAME_CHARS = /^[A-Za-z0-9_ء-ي٠-٩ٱ-ۓ]+$/;
const DIGIT = /[\p{Nd}]/u;

/** the same letter typed again and again ("aaaaaa", "ههههههه") is not a word */
function isRepeatedLetter(s: string): boolean {
  const letters = [...s].filter((c) => LETTER.test(c));
  return letters.length >= 4 && new Set(letters.map((c) => c.toLowerCase())).size === 1;
}
const wordCount = (s: string) => s.split(/\s+/).filter((w) => LETTER.test(w)).length;

export function textProblem(raw: string, rule: TextRule): string | null {
  const s = raw.trim();
  if (!s) return null;
  switch (rule) {
    case 'username':
      if (!USERNAME_CHARS.test(s)) return 'validation.usernameChars';
      if (!LETTER.test(s)) return 'validation.usernameLetter';
      return null;
    case 'name':
      if (!LETTER.test(s)) return 'validation.nameLetters';
      return isRepeatedLetter(s) ? 'validation.repeated' : null;
    case 'words':
      if (!LETTER.test(s)) return 'validation.wordsLetters';
      return isRepeatedLetter(s) ? 'validation.repeated' : null;
    case 'sentence':
      if (!LETTER.test(s)) return 'validation.sentenceLetters';
      if (isRepeatedLetter(s)) return 'validation.repeated';
      return wordCount(s) < 3 ? 'validation.sentenceWords' : null;
    case 'question':
      return LETTER.test(s) || DIGIT.test(s) ? null : 'validation.questionContent';
    case 'arabic':
      return ARABIC_LETTER.test(s) ? null : 'validation.arabicLetters';
  }
}

/** the first answers that repeat another answer of the same question (compared without case and extra spaces), by index */
export function duplicateChoices(choices: string[]): boolean[] {
  const seen = new Set<string>();
  return choices.map((c) => {
    const k = c.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!k) return false;
    if (seen.has(k)) return true;
    seen.add(k);
    return false;
  });
}
