// Reading direction for a question's text. `dir="auto"` isn't enough: the Arabic question mark
// (U+061F) counts as a strong right-to-left character, so a pure-math question like "7 x 6 = <qm>"
// would still render mirrored. Only text that actually contains Arabic letters reads right-to-left.
const ARABIC_LETTER = /[\u0621-\u064A\u0671-\u06D3]/;
export function textDir(text: string): 'rtl' | 'ltr' {
  return ARABIC_LETTER.test(text) ? 'rtl' : 'ltr';
}

// How a question is laid out (QuizCard, the worksheet preview and print, the results, the boss fight): the paragraph keeps the PAGE's
// direction, so in Arabic it is right-aligned with its number on the right, and the text itself sits in a <bdi dir={textDir(text)}>:
// a maths-only question or answer ("36 ÷ 6 = ؟", "56 cm") still reads left to right inside that right-aligned line.

/** The label of choice i: أ ب ج د in Arabic (as Arabic school tests letter them), A B C D otherwise. */
export function choiceLabel(i: number, lang: string): string {
  return (lang === 'ar' ? ['أ', 'ب', 'ج', 'د', 'هـ', 'و'] : ['A', 'B', 'C', 'D', 'E', 'F'])[i] ?? String(i + 1);
}
