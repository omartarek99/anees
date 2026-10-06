// Reading direction for a question's text. `dir="auto"` isn't enough: the Arabic question mark
// (U+061F) counts as a strong right-to-left character, so a pure-math question like "7 x 6 = <qm>"
// would still render mirrored. Only text that actually contains Arabic letters reads right-to-left.
const ARABIC_LETTER = /[\u0621-\u064A\u0671-\u06D3]/;
export function textDir(text: string): 'rtl' | 'ltr' {
  return ARABIC_LETTER.test(text) ? 'rtl' : 'ltr';
}
