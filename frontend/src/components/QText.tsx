import type { ReactNode } from 'react';
import { textDir } from '../lib/bidi';
import { useLanguage } from '../lib/language-context';

// A run of maths inside a sentence: numbers (Western or Arabic-Indic) with the operators, blanks and brackets between them, e.g.
// "8 __ 5 = 13", "250 + 125", "3/4", "(2 + 3) × 4". It must start and end on a number, a blank or a bracket.
const MATH_RUN = /[\d٠-٩_(][\d٠-٩\s+\-−×÷=_.,%/()^²³]*[\d٠-٩_)²³]|[\d٠-٩]/g;
const HAS_DIGIT = /[\d٠-٩]/;

/** The text of a question, an answer or an explanation, laid out the way school books print it:
 *  - Arabic site, a text with an equals sign: the whole equation reads right to left like the page around it, so "3 × 100 = ؟"
 *    shows as "؟ = 100 × 3" with the unknown on the left (each number keeps its own digits in order);
 *  - otherwise an Arabic sentence reads right to left and every maths run inside it reads left to right ("250 + 125");
 *  - a text with no Arabic letters reads left to right as a whole.
 *  Maths runs never break across lines. */
export function QText({ text }: { text: string }) {
  const { lang } = useLanguage();
  const equationRtl = lang === 'ar' && text.includes('=');
  if (!equationRtl && textDir(text) === 'ltr') return <bdi dir="ltr">{text}</bdi>;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH_RUN)) {
    if (!HAS_DIGIT.test(m[0])) continue;
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(
      <bdi key={at} dir={equationRtl ? 'rtl' : 'ltr'} className="quiz-math">
        {m[0]}
      </bdi>
    );
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <bdi dir="rtl">{parts}</bdi>;
}
