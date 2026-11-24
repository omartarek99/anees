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

const TF_CHOICES = ['صح', 'خطأ'];

export const keyOf = (subject: string, grade: number, text: string) => crypto.createHash('sha1').update(`${subject}|${grade}|${text}`).digest('hex').slice(0, 16);

// Questions that begin by asking to draw, plot, shade or fill in a table or chart (a label like "نمذج:" may come first)
const DRAW_FIRST = /^(?:[^:؟]{0,40}:\s*)?(?:مثّل بيانيًّا|مثّل وسمّ|مثّل (?:المتباينة|النقطة|النقاط)|ارسم|أنشئ|أنشيء|ظلّل|حوّط|صِل|صل |أكمل (?:الجدول|المخطّط|المخطط|النموذج)|مثّل الأعداد)/;
const DRAW_ANYWHERE = /(?:^|[\s:.؟،])(?:ارسم|ظلّل|مثّل بيانيًّا|أنشئ مخطّط|أنشئ مخطط|حوّط)(?=[\s.؟،]|$)/;
const INLINE_OPTIONS = /^(.*?)\s*\(أ\)\s*(.+?)\s+\(ب\)\s*(.+?)\s+\(ج\)\s*(.+?)\s+\(د\)\s*(.+?)(?:\s+\(هـ\)\s*(.+))?$/s;
const TRUE_FALSE_PREFIX = /^أحدّد إن كانت العبارة صحيحة أم خاطئة\s*:/;
// Free-writing tasks: explain / describe / justify, give an example or reasons, write a sentence / problem / name, "how can you ...", discuss
const OPEN_ENDED =
  /(?:^|[\s.؟،:(])(?:وضّح|أوضّح|أوضح|فسّر|أفسّر|أفسر|اشرح|أشرح|صف|أصف|ناقش|برّر|أبرّر|أعطي|أعط|اعط|أقترح|اقترح|أدوّن|حلّل|أحلّل|قارن بين الطريقتين|بيّن (?:سبب|الخطأ|كيف|لماذا|السبب))[ً-ْ]*(?=[\s.؟،:]|$)|أوجه (?:الشبه|الاختلاف)|وجه(?:ا|ي)? (?:الشبه|الاختلاف)|(?:اكتب|أكتب) (?:قاعدةً?|مسألةً?|سؤالًا|سؤالا|جملةً?|فقرةً?|مثالًا|مثالا|أمثلة|سببين|سببًا|ثلاثة|ثلاث|اسم|تعريفًا|تعريف|استنتاجين|استنتاجًا|رأيك|ملاحظات|وصفًا)|(?:اذكر|أذكر) (?:وجهي|وجهين|مثالًا|مثالا|أمثلة|ثلاث|سببين|سببًا|اسم|خاصيتين|خاصيّتين|اختلافين|فرقين|مثال)|هل تتفق|ما رأيك|في رأيك/;
// "الجزء A: ... الجزء B: ..." or "a. ... b. ...": several questions in one
const HOW_OPEN = /كيف (?:يمكنك|يمكن|تستطيع|أستطيع|تساعدك|تعرف|عرفت|أعرف|يساعدك|يساعد)/;
const MULTI_PART = /الجزء [AB]\s*:|(?:^|\s)a\.\s.*(?:\s)b\.\s/s;
const MULTI_SELECT =/اختر (?:ممّا يلي )?كلّ|اختر كل|حدّد كلّ|كلّ (?:المقادير|الجمل|الأعداد)/;

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
      let kind: BankItem['kind'] = q.kind;
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
      if (DRAW_FIRST.test(text) || DRAW_ANYWHERE.test(text)) continue; // asks to draw, plot, shade or fill in a table: cannot be a multiple-choice question
      if (q.kind !== 'mcq' && q.kind !== 'tf') {
        // a question with its options written in the text, "(أ) .. (ب) .. (ج) .. (د) ..": exactly four of them become the four choices (and leave the text);
        // five options or "choose all" cannot be shown as one-of-four, so such a question is left out
        const inline = INLINE_OPTIONS.exec(text);
        if (inline) {
          const opts = [inline[2], inline[3], inline[4], inline[5]].map((o) => o.trim());
          if (inline[6] || MULTI_SELECT.test(text) || opts.some((o) => !o)) continue;
          text = inline[1].trim();
          choices = opts;
          kind = 'mcq';
        } else if (TRUE_FALSE_PREFIX.test(text)) {
          kind = 'tf';
          choices = TF_CHOICES;
        }
      }
      // A worksheet is multiple choice only: a question that asks the student to write, explain, describe, give an example or answer in parts is left out
      if (kind !== 'mcq' && kind !== 'tf' && (OPEN_ENDED.test(text) || MULTI_PART.test(text) || (lesson.subject === 'math' && HOW_OPEN.test(text)))) continue;
      items.push({ key: keyOf(lesson.subject, lesson.grade, `${lesson.title}|${q.text}`), kind, text, choices, position, image: q.image ?? null });
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
- usable: first CHECK the question, then decide. It is usable (true) only when ALL of these hold:
  1. It stands completely on its own: a student who sees only this question (and its figure, when one is attached) has everything needed. It is NOT usable if it depends on another question or exercise, on "the example", "the table", "the picture", "the data" or "the text" that is not written in it or attached, or if it is one part (a, b, c ...) taken out of a longer question, or has an intro such as "for each of the following" with only one item left.
  2. The Arabic is correct and clear: no spelling mistakes, broken or missing words, wrong grammar that changes the meaning, or garbled characters, and the question reads as a sensible school question.
  3. The student only has to CHOOSE the answer from four options, and there is ONE certain answer that you can work out (it does not ask to draw, to shade, to complete a table or chart, to write a sentence, an example or an opinion, or to explain in words, and it is not several questions in one; and for [mcq] one of the given choices is correct; the figure, if any, really shows what the question talks about).
  Otherwise usable = false -- when in doubt, false. Never try to repair a question; just reject it.
- For [mcq] (4 choices 0-3 are given): return choices as an empty list; correctIndex = the number of the one correct choice.
- For [tf] (true / false): return choices as an empty list; correctIndex = 0 if the statement is TRUE, 1 if it is FALSE.
- For [fill] (a blank ____) and [problem] (a calculation or word problem): return exactly 4 SHORT possible final answers as choices (just the number / expression / word, with a unit if the question needs one; Western digits 0-9, x y z for unknowns, superscripts like x² for powers), exactly one correct, the others plausible mistakes a student could make, all different; correctIndex = 0-based index of the correct one.
- explanation: one short English line showing the working or the reason. explanationAr: the same line in Arabic (Western digits 0-9). Check both lines yourself before you answer: correct English, correct Arabic, no spelling or grammar mistakes, and the working really leads to your answer. You only check the question and write the choices, the answer and the explanation; you never change a word of the question.
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
