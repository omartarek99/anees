import type { ReactNode } from 'react';
import { textDir } from '../lib/bidi';
import { useLanguage } from '../lib/language-context';

// A run of maths inside a sentence: numbers (Western or Arabic-Indic) and unknowns (x, y) with the operators, blanks and brackets between them, e.g.
// "8 __ 5 = 13", "250 + 125", "3/4", "(2 + 3) × 4". It must start and end on a number, a blank or a bracket.
const MATH_RUN = /[\dA-Za-z٠-٩_(√∛][\dA-Za-z٠-٩\s+\-−×÷=≠≤≥<>_.,%/()^⁰¹²³⁴⁵⁶⁷⁸⁹⁻√∛π]*[\dA-Za-z٠-٩_)⁰¹²³⁴⁵⁶⁷⁸⁹√∛π]|[\d٠-٩]/g;
const HAS_DIGIT = /[\d٠-٩]/;
// 3/4 and the mixed number 5 2/5 (a whole number, a space, a fraction): drawn as school books draw them, one number over the other with a line between
const FRACTION = /(?<![\d/.])(?:(\d{1,3})\s+(\d{1,3})\/(\d{1,3})|(\d{1,3})\/(\d{1,3}))(?![\d/])/g;

const frac = (n: string, d: string) => (
  <span className="mfrac">
    <span className="mfrac-n">{n}</span>
    <span className="mfrac-d">{d}</span>
  </span>
);

/** A piece of maths text with its fractions and mixed numbers drawn stacked. Each one is its own left-to-right unit, so a mixed number keeps its whole
 *  part on the left of the fraction even inside an equation that reads right to left. */
function withFractions(text: string, keyBase: number): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(FRACTION)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <bdi key={keyBase + at} dir="ltr" className="mnum">
        {m[1] !== undefined && <span className="mwhole">{m[1]}</span>}
        {m[1] !== undefined ? frac(m[2], m[3]) : frac(m[4], m[5])}
      </bdi>
    );
    last = at + m[0].length;
  }
  if (last === 0) return [text];
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The text of a question, an answer or an explanation, laid out the way school books print it:
 *  - Arabic site, a text with an equals sign: the whole equation reads right to left like the page around it, so "3 × 100 = ؟"
 *    shows as "؟ = 100 × 3" with the unknown on the left (each number keeps its own digits in order);
 *  - otherwise an Arabic sentence reads right to left and every maths run inside it reads left to right ("250 + 125");
 *  - a text with no Arabic letters reads left to right as a whole.
 *  Maths runs never break across lines. */
export function QText({ text }: { text: string }) {
  const { lang } = useLanguage();
  const equationRtl = lang === 'ar' && text.includes('=');
  if (!equationRtl && textDir(text) === 'ltr') return <bdi dir="ltr">{withFractions(text, 0)}</bdi>;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH_RUN)) {
    if (!HAS_DIGIT.test(m[0])) continue;
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(
      <bdi key={at} dir={equationRtl ? 'rtl' : 'ltr'} className="quiz-math">
        {withFractions(m[0], at)}
      </bdi>
    );
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <bdi dir="rtl">{parts}</bdi>;
}
