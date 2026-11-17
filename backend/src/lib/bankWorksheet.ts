import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { callGemini, type GeminiImage } from './gemini.js';
import { verifyArithmetic } from './arithmeticCheck.js';
import { mathLatin, mathLatinAll } from './mathText.js';
import { moderateContent } from './moderation.js';
import { BANK_IMAGE_DIR, type BankLesson } from './questionBank.js';

// Worksheets are made ONLY from the school question bank (lib/questionBank.ts): the question text -- every word and number -- is the bank's, untouched,
// and the multiple-choice answers of a bank question are used as they are. The bank has no answer key, so the AI is asked for the answers only:
// which choice is right, (for a gap or a problem, which have no choices in the bank) four possible answers, and a one-line explanation. It never
// writes or rewrites a question: whatever question text it sends back is ignored.

export type BankItem = {
  /** Stable id of the question (the same question always has the same key, so its solved answers are saved and reused) */
  key: string;
  kind: 'mcq' | 'fill' | 'tf' | 'problem';
  text: string;
  /** The bank's own 4 choices (multiple choice), the two fixed answers (true / false), null when the AI has to give the choices */
  choices: string[] | null;
  /** 0 (first of its section, easy) .. 1 (last, harder) */
  position: number;
  /** The figure of the question from the book (a file in question-bank/images), when it has one */
  image: string | null;
};

export type SolvedItem = { choices: string[]; correctIndex: number; explanation: string; explanationAr: string };

export const TF_CHOICES = ['صح', 'خطأ'];

const keyOf = (subject: string, grade: number, text: string) => crypto.createHash('sha1').update(`${subject}|${grade}|${text}`).digest('hex').slice(0, 16);

/** The bank's questions of these lessons as worksheet candidates. */
export function bankItems(lessons: BankLesson[]): BankItem[] {
  const items: BankItem[] = [];
  for (const lesson of lessons) {
    const perKind = new Map<string, number>();
    for (const q of lesson.questions) perKind.set(q.kind, (perKind.get(q.kind) ?? 0) + 1);
    const seen = new Map<string, number>();
    for (const q of lesson.questions) {
      const index = seen.get(q.kind) ?? 0;
      seen.set(q.kind, index + 1);
      const total = perKind.get(q.kind) ?? 1;
      const position = total > 1 ? index / (total - 1) : 0.5;
      const lines = q.text.split('\n').map((l) => l.trim()).filter(Boolean);
      let text = lines[0];
      let choices: string[] | null = null;
      if (q.kind === 'mcq') {
        const picked = lines.slice(1).map((l) => /^[أبجدهـو]\)\s*(.*)$/.exec(l)?.[1]?.trim() ?? '');
        if (picked.length !== 4 || picked.some((c) => !c)) continue; // a question without exactly 4 clear choices is left out
        choices = picked;
      } else {
        text = lines.join(' ');
        if (q.kind === 'tf') {
          text = text.replace(/\(\s*\)\s*$/, '').trim(); // the "(   )" tick box of the printed bank
          choices = TF_CHOICES;
        }
      }
      if (text.length < 3) continue;
      items.push({ key: keyOf(lesson.subject, lesson.grade, `${lesson.title}|${q.text}`), kind: q.kind, text, choices, position, image: q.image ?? null });
    }
  }
  return items;
}

/** The candidates in the order they should be tried: a mix, with the easy end of each section first for "easy", the hard end first for "hard". */
export function orderItems(items: BankItem[], difficulty: 'easy' | 'medium' | 'hard'): BankItem[] {
  const score = (i: BankItem) => {
    const noise = Math.random() * 0.5;
    return difficulty === 'easy' ? i.position + noise : difficulty === 'hard' ? 1 - i.position + noise : Math.abs(i.position - 0.5) + noise;
  };
  return items.map((i) => ({ i, s: score(i) })).sort((a, b) => a.s - b.s).map((x) => x.i);
}

const SOLVE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      n: { type: 'INTEGER' },
      usable: { type: 'BOOLEAN' },
      choices: { type: 'ARRAY', items: { type: 'STRING' } },
      explanation: { type: 'STRING' },
      correctIndex: { type: 'INTEGER' },
      explanationAr: { type: 'STRING' },
    },
    // the working comes before the answer, so the model solves the question in its own output first
    propertyOrdering: ['n', 'usable', 'choices', 'explanation', 'correctIndex', 'explanationAr'],
    required: ['n', 'usable', 'choices', 'explanation', 'correctIndex', 'explanationAr'],
  },
};

/** Asks the AI for the answers of these bank questions (the questions themselves are never sent back). Returns only the usable, checked ones. */
export async function solveItems(items: BankItem[], subjectName: string, grade: number): Promise<Map<string, SolvedItem> | { error: string }> {
  if (items.length === 0) return new Map();
  const listing = items
    .map((it, n) => {
      const head = `${n + 1}. [${it.kind}] ${it.text}${it.image ? ' (the figure of this question is attached below)' : ''}`;
      return it.kind === 'mcq' ? `${head}\n${it.choices!.map((c, i) => `   ${i}) ${c}`).join('\n')}` : head;
    })
    .join('\n');
  const prompt = `You are the answer key for a school ${subjectName} question bank, grade ${grade}. The questions below are Arabic and are official; you must NOT change, rewrite, translate or add any question -- you only solve them.

For each question return an object:
- n: its number.
- usable: false if it cannot be a clear multiple-choice question with ONE certain answer (it asks to draw, to explain in words, to give an example, is ambiguous or incomplete, or -- for [mcq] -- none of the given choices is correct). Otherwise true.
- For [mcq] (4 choices 0-3 are given): return choices as an empty list; correctIndex = the number of the one correct choice.
- For [tf] (true / false): return choices as an empty list; correctIndex = 0 if the statement is TRUE, 1 if it is FALSE.
- For [fill] (a blank ____) and [problem] (a calculation or word problem): return exactly 4 SHORT possible final answers as choices (just the number / expression / word, with a unit if the question needs one; Western digits 0-9, x y z for unknowns, superscripts like x² for powers), exactly one correct, the others plausible mistakes a student could make, all different; correctIndex = 0-based index of the correct one.
- explanation: one short English line showing the working or the reason. explanationAr: the same line in Arabic (Western digits 0-9).
Solve every question carefully and double-check all arithmetic before you answer. Return ONLY the JSON array.

Questions:
${listing}`;
  // the figures of the questions that have one go with the prompt, so the answer can be read from them
  const images: GeminiImage[] = [];
  items.forEach((it, n) => {
    if (!it.image) return;
    try {
      images.push({ label: `Figure of question ${n + 1}:`, mime: 'image/jpeg', base64: fs.readFileSync(path.join(BANK_IMAGE_DIR, it.image)).toString('base64') });
    } catch {
      // a missing file: the question is solved without it
    }
  });
  const r = await callGemini(prompt, SOLVE_SCHEMA, 0.1, 60_000, images.length ? { images } : {});
  if (!r.ok) return { error: r.error };
  const out = new Map<string, SolvedItem>();
  for (const row of Array.isArray(r.data) ? (r.data as any[]) : []) {
    const item = items[Number(row?.n) - 1];
    if (!item || row.usable !== true || !Number.isInteger(row.correctIndex)) continue;
    const choices: string[] = item.choices ?? (Array.isArray(row.choices) ? row.choices.map((c: unknown) => String(c ?? '').trim()) : []);
    const needed = item.kind === 'tf' ? 2 : 4;
    if (choices.length !== needed || row.correctIndex < 0 || row.correctIndex >= needed) continue;
    if (choices.some((c) => !c || c.length > 120) || new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) continue;
    const shown = item.kind === 'mcq' || item.kind === 'tf' ? choices : mathLatinAll(choices);
    const explanation = mathLatin(String(row.explanation ?? '').trim().slice(0, 500));
    const explanationAr = mathLatin(String(row.explanationAr ?? '').trim().slice(0, 500));
    if (!explanation || ![...shown, explanation, explanationAr].every((t) => moderateContent(t).allowed)) continue;
    // a plain sum / product the model got wrong is corrected from the arithmetic itself; a question with no true choice is dropped
    const checked = item.kind === 'mcq' || item.kind === 'fill' || item.kind === 'problem' ? verifyArithmetic({ questionText: item.text, choices: shown, correctIndex: row.correctIndex }) : { correctIndex: row.correctIndex };
    if (!checked) continue;
    out.set(item.key, { choices: shown, correctIndex: checked.correctIndex, explanation, explanationAr });
  }
  return out;
}
