// The AI sometimes gets a sum wrong even when it is told to double-check. A worksheet question that is nothing but a plain expression ("3.75 × 2.4 = ?",
// "What is 12.6 ÷ 0.4?") with plain-number choices can be worked out here, so the right answer is set from the arithmetic and not from the AI. Anything
// else (a story, units in the choices, a fraction) is left exactly as the AI wrote it.

const NUMBER = String.raw`-?\d+(?:\.\d+)?`;
// the whole question is one operation between two numbers
const EXPRESSION = new RegExp(String.raw`^\s*(?:(?:what\s+is|calculate|find|compute)\s+)?(${NUMBER})\s*([+\-−x×*÷/])\s*(${NUMBER})\s*(?:=\s*\??|\?)?\s*$`, 'i');
const PLAIN_NUMBER = new RegExp(String.raw`^\s*(${NUMBER})\s*$`);

type Q = { questionText: string; choices: string[]; correctIndex: number };

/** The question with its correct answer fixed from the arithmetic, the question itself when it is not a plain expression, or null when none of its choices is the true answer. */
export function verifyArithmetic<T extends Q>(q: T): T | null {
  const m = q.questionText.replace(/,/g, '').match(EXPRESSION);
  if (!m) return q;
  const a = parseFloat(m[1]);
  const b = parseFloat(m[3]);
  const op = m[2];
  if ((op === '÷' || op === '/') && b === 0) return null;
  const truth = op === '+' ? a + b : op === '-' || op === '−' ? a - b : op === '÷' || op === '/' ? a / b : a * b;

  const values = q.choices.map((c) => {
    const n = c.replace(/,/g, '').match(PLAIN_NUMBER);
    return n ? parseFloat(n[1]) : NaN;
  });
  if (values.some((v) => Number.isNaN(v))) return q; // units or words in the choices: not something to judge here

  const close = (v: number, tolerance: number) => Math.abs(v - truth) <= tolerance;
  const exact = values.findIndex((v) => close(v, 1e-9 * Math.max(1, Math.abs(truth))));
  // a quotient that does not end (10 ÷ 3) is written rounded: accept a choice within half a hundredth of it
  const isDivision = op === '÷' || op === '/';
  const rounded = exact >= 0 ? exact : isDivision ? values.findIndex((v) => close(v, 0.0051)) : -1;
  if (rounded < 0) return null;
  return rounded === q.correctIndex ? q : { ...q, correctIndex: rounded };
}
