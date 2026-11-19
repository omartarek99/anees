import type { ReactNode } from 'react';
import { textDir } from '../lib/bidi';

// A run of maths inside a sentence: numbers (Western or Arabic-Indic) and unknowns (x, y) with the operators, blanks and brackets between them, e.g.
// "8 __ 5 = 13", "250 + 125", "3/4", "(2 + 3) × 4". It must start and end on a number, a blank or a bracket.
const MATH_RUN = /[\dA-Za-z٠-٩_(√∛][\dA-Za-z٠-٩\s+\-−×÷=≠≤≥<>_.,%/()^⁰¹²³⁴⁵⁶⁷⁸⁹⁻√∛π]*[\dA-Za-z٠-٩_)⁰¹²³⁴⁵⁶⁷⁸⁹√∛π]|[\d٠-٩]/g;
// a run is maths when it holds a digit, or an equation / sign / bracketed pair of unknowns: "y = 2x", "x + y", "(x, y)" (a lone letter or a unit is not)
const IS_MATH = /[\d٠-٩]|[=<>≤≥≠+×÷]|\(\s*[A-Za-z]+\s*,\s*[A-Za-z]+\s*\)/;
// 3/4 and the mixed number 5 2/5 (a whole number, a space, a fraction): drawn as school books draw them, one number over the other with a line between
// The top or bottom may also hold a letter (w/4, 3/x, 4x/5, a/b), as in algebra; letters on both sides are a fraction only for the usual algebra letters, so units
// such as m/s and km/h stay on one line.
const FRACTION = /(?<![\d/.A-Za-z])(?:(\d{1,3})\s+(\d{1,3})\/(\d{1,3})|(\d{0,3}[A-Za-z]?)\/(\d{0,3}[A-Za-z]?))(?![\d/A-Za-z])/g;
const UNIT_DENOMINATOR = /^[smhLg]$/;
const isFraction = (n: string, d: string) => n !== '' && d !== '' && (/\d/.test(n) || /\d/.test(d) || !UNIT_DENOMINATOR.test(d));

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
    if (m[1] === undefined && !isFraction(m[4], m[5])) continue;
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

/** The text of a question, an answer or an explanation, laid out the same way in the Arabic and the English version:
 *  - every maths run (numbers, unknowns, signs, brackets: "250 + 125", "y = 2x + 3", the ordered pair "(5, 3)", "(x, y)") is written in English order,
 *    left to right, even inside an Arabic sentence -- an equation is never mirrored ("3 × 100 = ?" stays "3 × 100 = ?");
 *  - an Arabic sentence reads right to left around those runs;
 *  - a text with no Arabic letters reads left to right as a whole.
 *  Maths runs never break across lines. */
export function QText({ text }: { text: string }) {
  if (textDir(text) === 'ltr') return <bdi dir="ltr">{withFractions(text, 0)}</bdi>;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MATH_RUN)) {
    if (!IS_MATH.test(m[0])) continue;
    const at = m.index ?? 0;
    if (at > last) parts.push(text.slice(last, at));
    parts.push(
      <bdi key={at} dir="ltr" className="quiz-math">
        {withFractions(m[0], at)}
      </bdi>
    );
    last = at + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <bdi dir="rtl">{parts}</bdi>;
}
