import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SolvedItem } from './bankWorksheet.js';

// The answers of the question bank: for each question (by its key, lib/bankWorksheet.ts) the four choices, the right one and the explanation, worked out ONCE
// (npm run bank:answers: exact arithmetic for plain calculations, the AI -- two separate solves that must agree -- for the rest) and kept in the bank itself,
// so a worksheet is made with no AI call at all: instant, the same answers every time, and no use of the AI limit. A question that is not in the file is
// solved by the AI when it is asked for, as before. A question the check found unusable (unclear, wrong Arabic, no single answer) is listed as rejected and
// is never put on a worksheet.

const ANSWERS_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../question-bank/answers.json');

type StoredAnswer = { c: string[]; i: number; e: string; a: string; by: 'calc' | 'ai' | 'hand' };
type AnswerFile = { answers: Record<string, StoredAnswer>; rejected: Record<string, string> };

export function readAnswerFile(): AnswerFile {
  try {
    const data = JSON.parse(fs.readFileSync(ANSWERS_FILE, 'utf8')) as Partial<AnswerFile>;
    return { answers: data.answers ?? {}, rejected: data.rejected ?? {} };
  } catch {
    return { answers: {}, rejected: {} };
  }
}

export function writeAnswerFile(file: AnswerFile) {
  const sorted = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  fs.writeFileSync(ANSWERS_FILE, JSON.stringify({ answers: sorted(file.answers), rejected: sorted(file.rejected) }, null, 0) + '\n');
}

let cache: AnswerFile | null = null;
const loaded = () => (cache ??= readAnswerFile());

/** The stored answer of a bank question, or null when it has none (then the AI solves it). */
export function bankAnswer(key: string): SolvedItem | null {
  const a = loaded().answers[key];
  if (!a || !Array.isArray(a.c) || !(a.c.length === 2 || a.c.length === 4) || !Number.isInteger(a.i) || a.i < 0 || a.i >= a.c.length) return null;
  return { choices: a.c, correctIndex: a.i, explanation: a.e, explanationAr: a.a || a.e };
}

/** True for a question the check found unusable. */
export const isRejected = (key: string) => key in loaded().rejected;
