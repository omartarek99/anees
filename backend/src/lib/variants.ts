import { keyOf, type BankItem } from './bankWorksheet.js';
import type { BankLesson } from './questionBank.js';

// A maths lesson of the school book can have too few usable questions (the bank has the book's questions only). Its pool is then filled up to MATH_POOL with
// the plain calculations of the lesson written again with OTHER NUMBERS -- made by code, never by the AI: the wording stays the book's own. The AI is only
// asked to work out the answers and the four choices, and to check the question (lib/bankWorksheet.ts).
// Any other extra question (a word problem, a science question) has to be written into the question bank itself, by a person.
export const MATH_MIN = 8;
export const MATH_POOL = 30;
const PER_TEMPLATE = 4; // one calculation is renumbered at most this many times: thirty copies of one sum is not a worksheet

function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const group = (digits: string) => (digits.length > 3 ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : digits);

/** A whole number of the same size and with the same trailing zeros, close to the original: 2 000 -> 2 600, 45 -> 38. */
function otherInteger(raw: string, r: () => number): string {
  const digits = raw.replace(/ /g, '');
  const v = Number(digits);
  if (v <= 1) return raw;
  const zeros = /0+$/.exec(digits)?.[0].length ?? 0;
  const lead = Number(digits.slice(0, digits.length - zeros));
  const lo = lead < 10 ? Math.max(2, lead - 3) : Math.ceil(lead * 0.7);
  const hi = lead < 10 ? Math.min(9, lead + 4) : Math.floor(lead * 1.4);
  let next = lead;
  for (let i = 0; i < 8 && next === lead; i++) next = pick(r, lo, Math.max(lo + 1, hi));
  const out = String(next) + '0'.repeat(zeros);
  return raw.includes(' ') || out.length > 4 ? group(out) : out;
}

/** A decimal with the same number of places (the last place is never 0): 3.45 -> 5.21. */
function otherDecimal(whole: string, dec: string, r: () => number): string {
  const w = Number(whole.replace(/ /g, ''));
  let nw = w < 10 ? pick(r, Math.max(0, w - 3), Math.min(9, w + 3)) : Math.max(1, Math.floor(w * (0.75 + r() * 0.5)));
  if (w >= 1 && nw === 0) nw = 1;
  let d = '';
  for (let i = 0; i < dec.length; i++) d += i === dec.length - 1 ? String(pick(r, 1, 9)) : String(pick(r, 0, 9));
  return `${group(String(nw))}.${d}`;
}

/** A fraction with the same denominator: 3/8 -> 5/8 (1/2 and 1/1 are left as they are). */
function otherFraction(a: string, b: string, r: () => number): [string, string] {
  const num = Number(a), den = Number(b);
  if (den <= 2) return [a, b];
  let next = num;
  if (num < den) for (let i = 0; i < 8 && next === num; i++) next = pick(r, 1, den - 1);
  else for (let i = 0; i < 8 && next === num; i++) next = pick(r, den + 1, den * 2 - 1);
  return [String(next), b];
}

// a mixed number "5 1/9", a fraction "3/4", a decimal "3.45", a whole number "2 000". Numbers tied to letters or powers (10³, x², A1) are left alone.
const NUMBER = /(?<![A-Za-z⁰-⁹⁻²³¹\d.\/])(?:(\d{1,3}) (\d{1,3})\/(\d{1,3})(?![\d\/])|(\d{1,3})\/(\d{1,3})(?![\d\/])|(\d{1,3}(?: \d{3})+|\d+)(?:\.(\d+))?)(?![⁰-⁹⁻²³¹\d\/A-Za-z])/g;

const value = (t: string): number => {
  const mixed = /^(\d+) (\d+)\/(\d+)$/.exec(t);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(t.replace(/ /g, ''));
};

const OPERAND = String.raw`(\d[\d ]*(?:\.\d+)?(?: \d+\/\d+)?|\d+\/\d+)`;
const SUBTRACTION = new RegExp(String.raw`^\s*` + OPERAND + String.raw`\s*−\s*` + OPERAND + String.raw`\s*$`);

/** "A − B" with B bigger than A would have a negative answer: the two numbers change places. */
function orderSubtraction(text: string): string {
  const at = text.lastIndexOf(':');
  const m = SUBTRACTION.exec(text.slice(at + 1));
  if (!m) return text;
  const a = m[1].trim(), b = m[2].trim();
  return value(a) < value(b) ? `${text.slice(0, at + 1)} ${b} − ${a}` : text;
}

function renumberNumbers(text: string, r: () => number): string {
  return text.replace(NUMBER, (m, mw, ma, mb, fa, fb, iw, dec) => {
    if (mw !== undefined) {
      const [na, nb] = otherFraction(ma, mb, r);
      return `${otherInteger(mw, r)} ${na}/${nb}`;
    }
    if (fa !== undefined) {
      const [na, nb] = otherFraction(fa, fb, r);
      return `${na}/${nb}`;
    }
    if (dec !== undefined) return otherDecimal(iw, dec, r);
    return otherInteger(iw, r);
  });
}

const renumber = (text: string, r: () => number) => orderSubtraction(renumberNumbers(text, r));

// Only a plain calculation is renumbered: an instruction without numbers, then ":" and nothing but the calculation ("أوجد ناتج الجمع: 5 1/9 − 2 2/3",
// "اقسم: 215 ÷ 2"). A word problem has totals and number words (10 أشهر / 11 شهرًا) that a blind change would break, and numbers that carry the meaning
// (place value, powers, blanks, rounding) must stay.
const NOT_RENUMBER = /الصيغة|منزلة|المنزلة|قيمة الرقم|الرقم|قوى|أس|قرّب|قرب|أقرب|تقريب|____|[⁰-⁹²³¹]/;
function isPlainCalculation(text: string): boolean {
  const at = text.lastIndexOf(':');
  if (at < 0 || NOT_RENUMBER.test(text)) return false;
  const head = text.slice(0, at), tail = text.slice(at + 1);
  return !/\d/.test(head) && /\d/.test(tail) && /[+−\-×÷=\/]/.test(tail) && !/[ء-ي]/.test(tail) && tail.length < 60;
}

/** More questions made from the plain calculations among these bank questions, with their numbers changed. */
export function numberVariants(base: BankItem[], need: number, subject: string, grade: number, lessonTitle: string): BankItem[] {
  const usable = base.filter((b) => !b.image && b.kind !== 'mcq' && isPlainCalculation(b.text));
  const out: BankItem[] = [];
  const seen = new Set(base.map((b) => b.text));
  for (const src of usable) {
    let made = 0;
    for (let attempt = 0; made < PER_TEMPLATE && out.length < need && attempt < 40; attempt++) {
      const r = rng(`${lessonTitle}|${src.key}|${attempt}`);
      const text = renumber(src.text, r);
      if (text === src.text || seen.has(text)) continue;
      seen.add(text);
      made++;
      out.push({ ...src, text, key: keyOf(subject, grade, `${lessonTitle}|var|${text}`), position: 0.3 + 0.4 * r(), image: null });
    }
  }
  return out;
}

/** The questions a lesson can offer: the bank's usable ones; a maths lesson with too few is topped up with renumbered calculations. */
export function extendPool(lesson: BankLesson, items: BankItem[]): BankItem[] {
  if (lesson.subject !== 'math' || items.length >= MATH_MIN) return items;
  return [...items, ...numberVariants(items, MATH_POOL - items.length, lesson.subject, lesson.grade, lesson.title)];
}
