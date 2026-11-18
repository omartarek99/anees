// Maths in worksheets is written the same way in the English and the Arabic version: numbers with the Western digits 0-9 and the unknowns with Latin letters
// (x, y, z) -- never ٣ ٤ or س ص. The AI is told so, and this makes sure of it for what it wrote and for questions saved earlier.

// letters AND their marks (fatha, shadda ... U+064B-065F, U+0670) and tatweel: a س / ص / ع that touches any of them is part of a word
const ARABIC_LETTER = '\u0621-\u065F\u0670\u0640\u0671-\u06D3';
const DIGIT_OFFSET = (d: string) => String(d.charCodeAt(0) % 16); // ٠-٩ and ۰-۹ both start at a code point divisible by 16
// a lone س / ص / ع (not part of an Arabic word) is an unknown: x / y / z
const LONE_LETTER = new RegExp(`(?<![${ARABIC_LETTER}])([سصع])(?![${ARABIC_LETTER}])`, 'g');
const TIME_WORDS = /الساع|صباح|مساء|\d\s*:\s*\d/;

export function mathLatin(text: string): string {
  if (!text) return text;
  let s = text
    .replace(/[٠-٩۰-۹]/g, DIGIT_OFFSET)
    .replace(/(\d)٫(\d)/g, '$1.$2') // Arabic decimal separator
    .replace(/(\d)٬(?=\d)/g, '$1') // Arabic thousands separator
    .replace(/٪/g, '%');
  if (/[ء-ي]/.test(s)) {
    const isTime = TIME_WORDS.test(s); // "8 ص" is 8 a.m., not "8 y"
    s = s.replace(LONE_LETTER, (m, letter: string) => (letter === 'س' ? 'x' : letter === 'ع' ? 'z' : isTime ? m : 'y'));
  }
  return s;
}

export const mathLatinAll = (items: string[]) => items.map(mathLatin);

// A question that is only an expression ("5 2/5 + 1 1/10") is written as a real equation with the unknown at the end: "5 2/5 + 1 1/10 = ?" ("= ؟" in Arabic).
const PURE_EXPRESSION = /^[\d\s+\-−×÷*/().^⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;
export function asEquation(text: string, arabic: boolean): string {
  const t = text.trim();
  if (!t || t.includes('=') || !/[+\-−×÷*]/.test(t.replace(/^-/, '')) || !PURE_EXPRESSION.test(t)) return text;
  return `${t} = ${arabic ? '؟' : '?'}`;
}
