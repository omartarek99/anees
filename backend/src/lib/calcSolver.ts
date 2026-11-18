import crypto from 'node:crypto';
import type { BankItem, SolvedItem } from './bankWorksheet.js';

// A plain calculation of the question bank ("أوجد ناتج الجمع: 5 1/9 − 2 2/3", "أوجد ناتج الضرب: 4.7 × 0.1", "اقسم: 840 ÷ 21") is solved here with exact
// arithmetic -- the right answer is certain, and the three wrong choices are the mistakes a student really makes. No AI, no waiting, no limit.
// Anything this code is not sure about (a remainder, an estimate, a rounding, an unknown) returns null and is left to the answer file / the AI.

type Q = { n: bigint; d: bigint }; // an exact fraction, d > 0, in lowest terms
type Style = 'int' | 'decimal' | 'fraction';

const gcd = (a: bigint, b: bigint): bigint => {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
};
const make = (n: bigint, d: bigint): Q => {
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
};
const add = (a: Q, b: Q) => make(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Q, b: Q) => make(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => make(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => (b.n === 0n ? null : make(a.n * b.d, a.d * b.n));
const eq = (a: Q, b: Q) => a.n === b.n && a.d === b.d;

// ---------- reading the calculation ----------

type Tok = { t: 'num'; q: Q; style: Style } | { t: 'op'; v: string };

const TOKEN = /\s*(?:(\d+) (\d+)\/(\d+)|(\d+)\/(\d+)|(\d{1,3}(?: \d{3})+|\d+)(?:\.(\d+))?|([+−×÷()]))/y;

function tokenize(src: string): Tok[] | null {
  const out: Tok[] = [];
  TOKEN.lastIndex = 0;
  let pos = 0;
  while (pos < src.length) {
    if (/^\s*$/.test(src.slice(pos))) break;
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(src);
    if (!m) return null;
    pos = TOKEN.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'num', q: make(BigInt(m[1]) * BigInt(m[3]) + BigInt(m[2]), BigInt(m[3])), style: 'fraction' });
    else if (m[4] !== undefined) out.push({ t: 'num', q: make(BigInt(m[4]), BigInt(m[5])), style: 'fraction' });
    else if (m[6] !== undefined) {
      const whole = m[6].replace(/ /g, '');
      if (m[7] !== undefined) out.push({ t: 'num', q: make(BigInt(whole + m[7]), 10n ** BigInt(m[7].length)), style: 'decimal' });
      else out.push({ t: 'num', q: make(BigInt(whole), 1n), style: 'int' });
    } else out.push({ t: 'op', v: m[8] });
  }
  return out.length ? out : null;
}

type Node = { k: 'num'; q: Q } | { k: 'bin'; op: string; l: Node; r: Node };

function parse(toks: Tok[]): Node | null {
  let i = 0;
  const atom = (): Node | null => {
    const t = toks[i];
    if (!t) return null;
    if (t.t === 'num') { i++; return { k: 'num', q: t.q }; }
    if (t.v === '(') {
      i++;
      const e = expr();
      if (!e || toks[i]?.t !== 'op' || (toks[i] as any).v !== ')') return null;
      i++;
      return e;
    }
    return null;
  };
  const term = (): Node | null => {
    let l = atom();
    while (l && toks[i]?.t === 'op' && ((toks[i] as any).v === '×' || (toks[i] as any).v === '÷')) {
      const op = (toks[i] as any).v as string;
      i++;
      const r = atom();
      if (!r) return null;
      l = { k: 'bin', op, l, r };
    }
    return l;
  };
  const expr = (): Node | null => {
    let l = term();
    while (l && toks[i]?.t === 'op' && ((toks[i] as any).v === '+' || (toks[i] as any).v === '−')) {
      const op = (toks[i] as any).v as string;
      i++;
      const r = term();
      if (!r) return null;
      l = { k: 'bin', op, l, r };
    }
    return l;
  };
  const e = expr();
  return e && i === toks.length ? e : null;
}

function evaluate(n: Node): Q | null {
  if (n.k === 'num') return n.q;
  const a = evaluate(n.l), b = evaluate(n.r);
  if (!a || !b) return null;
  if (n.op === '+') return add(a, b);
  if (n.op === '−') return sub(a, b);
  if (n.op === '×') return mul(a, b);
  return div(a, b);
}

// ---------- writing a number the way the book writes it ----------

const group = (s: string) => (s.length > 4 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : s);

function decimalOf(q: Q): { whole: bigint; frac: string } | null {
  // a terminating decimal only: the denominator has no prime factor except 2 and 5
  let d = q.d, twos = 0, fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos++; }
  while (d % 5n === 0n) { d /= 5n; fives++; }
  if (d !== 1n) return null;
  const places = Math.max(twos, fives);
  const scaled = (q.n * 10n ** BigInt(places)) / q.d;
  const s = scaled.toString().padStart(places + 1, '0');
  return { whole: BigInt(s.slice(0, s.length - places)), frac: s.slice(s.length - places) };
}

function show(q: Q, style: Style): string | null {
  if (q.n < 0n) return null;
  if (style === 'int') return q.d === 1n ? group(q.n.toString()) : null;
  if (style === 'decimal') {
    const dec = decimalOf(q);
    if (!dec) return null;
    const frac = dec.frac.replace(/0+$/, '');
    return frac ? `${group(dec.whole.toString())}.${frac}` : group(dec.whole.toString());
  }
  if (q.d === 1n) return group(q.n.toString());
  const whole = q.n / q.d, rest = q.n % q.d;
  return whole > 0n ? `${group(whole.toString())} ${rest}/${q.d}` : `${rest}/${q.d}`;
}

// ---------- wrong choices: the mistakes students make ----------

function rng(seed: string) {
  let a = crypto.createHash('sha1').update(seed).digest().readUInt32LE(0);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrongAnswers(node: Node, answer: Q, style: Style): Q[] {
  const out: Q[] = [];
  const push = (q: Q | null) => { if (q && q.n >= 0n && !eq(q, answer)) out.push(q); };
  // the operation done the other way round (a + b instead of a − b, a × b instead of a ÷ b)
  if (node.k === 'bin') {
    const a = evaluate(node.l), b = evaluate(node.r);
    if (a && b) {
      if (node.op === '+') push(sub(a, b)), push(sub(b, a));
      if (node.op === '−') push(add(a, b));
      if (node.op === '×') push(div(a, b)), push(div(b, a));
      if (node.op === '÷') push(mul(a, b)), push(div(b, a));
      if (style === 'fraction' && a.d !== 1n && b.d !== 1n && a.n < a.d && b.n < b.d && node.op !== '÷') {
        // the fractions' tops and bottoms added separately: 1/2 + 1/3 = 2/5
        push(make(a.n + b.n, a.d + b.d));
      }
    }
  }
  // the decimal point in the wrong place, one place wrong in the last digit
  if (style !== 'fraction') {
    push(mul(answer, make(10n, 1n)));
    push(div(answer, make(10n, 1n)));
    const dec = style === 'decimal' ? decimalOf(answer) : null;
    const unit = style === 'decimal' && dec ? make(1n, 10n ** BigInt(Math.max(1, dec.frac.replace(/0+$/, '').length))) : make(answer.n >= 100n ? 10n : 1n, 1n);
    push(add(answer, unit));
    push(sub(answer, unit));
    push(add(answer, mul(unit, make(10n, 1n))));
    push(sub(answer, mul(unit, make(10n, 1n))));
  } else {
    const unit = make(1n, answer.d);
    push(add(answer, unit));
    push(sub(answer, unit));
    push(add(answer, make(1n, 1n)));
    push(sub(answer, make(1n, 1n)));
    if (node.k === 'bin' && node.op === '÷' && answer.n !== 0n) push(make(answer.d, answer.n));
  }
  return out;
}

const PLAIN_HEAD =
  /^(?:(?:أوجد|اوجد) (?:كلّ )?(?:ناتج|المجموع|الفرق)|اقسم|اطرح|اجمع|حُلّ\. اجمع ما بداخل الأقواس أوّلًا|استعمل ترتيب العمليّات|قدّر (?:ثمّ|أولًا ثمّ) أوجد|قدّر أولًا ثمّ أوجد)/;
// an estimate, a remainder, a grid or mental-maths hint, a place, a rounding: not a plain "find the result"
const NOT_PLAIN_HEAD = /^قدّر ناتج|متناغمة|الذهني|شبكة|باقي|المنزلة|منزلة|قرّب|أقرب|الفاصلة|أقواسًا|أدخل|معكوس|مطلق/;

/** The exact answer, four choices and the explanation of a plain calculation, or null when the code is not sure. */
export function solveCalculation(item: BankItem): SolvedItem | null {
  if (item.image || item.kind === 'mcq' || item.kind === 'tf') return null;
  const at = item.text.lastIndexOf(':');
  if (at < 0) return null;
  const head = item.text.slice(0, at).trim(), tail = item.text.slice(at + 1).trim();
  if (!PLAIN_HEAD.test(head) || NOT_PLAIN_HEAD.test(head) || /\d/.test(head) || /[ء-ي_=?؟]/.test(tail)) return null;
  const toks = tokenize(tail);
  if (!toks || !toks.some((t) => t.t === 'op' && t.v !== '(' && t.v !== ')')) return null;
  const node = parse(toks);
  if (!node) return null;
  const answer = evaluate(node);
  if (!answer || answer.n < 0n) return null;

  // the way the answer is written follows the numbers of the question
  const kinds = new Set(toks.filter((t): t is Extract<Tok, { t: 'num' }> => t.t === 'num').map((t) => t.style));
  if (kinds.has('decimal') && kinds.has('fraction')) return null;
  const style: Style = kinds.has('fraction') ? 'fraction' : kinds.has('decimal') ? 'decimal' : 'int';
  const right = show(answer, style);
  if (!right) return null; // a division with a remainder, a repeating decimal ...

  const r = rng(item.key);
  const seen = new Set([right]);
  const wrong: string[] = [];
  const pool = wrongAnswers(node, answer, style).map((q) => show(q, style)).filter((s): s is string => !!s);
  // the order of the mistakes is shuffled, the same way every time for the same question
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  for (const s of pool) if (!seen.has(s) && wrong.length < 3) { seen.add(s); wrong.push(s); }
  for (let k = 2; wrong.length < 3 && k < 12; k++) {
    const s = show(add(answer, make(BigInt(k), style === 'fraction' ? answer.d : 1n)), style);
    if (s && !seen.has(s)) { seen.add(s); wrong.push(s); }
  }
  if (wrong.length < 3) return null;

  const choices = [right, ...wrong];
  for (let i = choices.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]]; }
  const line = `${tail} = ${right}`;
  return { choices, correctIndex: choices.indexOf(right), explanation: `Working it out: ${line}.`, explanationAr: `الحل: ${line}.` };
}
