import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callGemini } from './gemini.js';

// The school question bank for Math and Science, grades 5 and 6, terms 1 and 2 (backend/question-bank/<subject>-<grade>-<term>.md).
// ~40 Arabic questions per lesson, with NO answer key: it is used as source material. For a given lesson (a video, or a lesson name
// a teacher types) the matching bank lessons are found and handed to the AI, which writes new questions from them and works out the
// correct answers itself.

export type BankSubject = 'math' | 'science';
export const BANK_GRADES = [5, 6] as const;

type BankQuestion = { kind: 'mcq' | 'fill' | 'tf' | 'problem'; text: string };
export type BankLesson = {
  subject: BankSubject;
  grade: number;
  term: number;
  unit: string;
  title: string;
  questions: BankQuestion[];
};

const BANK_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../question-bank');
const SECTION_KINDS: BankQuestion['kind'][] = ['mcq', 'fill', 'tf', 'problem'];

let cache: BankLesson[] | null = null;

function parseFile(subject: BankSubject, grade: number, term: number, text: string): BankLesson[] {
  const lessons: BankLesson[] = [];
  let unit = '';
  let lesson: BankLesson | null = null;
  let kind: BankQuestion['kind'] = 'mcq';
  let current: BankQuestion | null = null;
  const flush = () => {
    if (lesson && current) lesson.questions.push(current);
    current = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('#### ')) {
      flush();
      // أولًا / ثانيًا / ثالثًا / رابعًا -- the order is the same in every lesson
      const order = ['أولًا', 'ثانيًا', 'ثالثًا', 'رابعًا'].findIndex((w) => line.includes(w));
      if (order >= 0) kind = SECTION_KINDS[order];
    } else if (line.startsWith('### ')) {
      flush();
      const title = line.replace(/^###\s*/, '').trim();
      lesson = { subject, grade, term, unit, title, questions: [] };
      lessons.push(lesson);
    } else if (line.startsWith('## ')) {
      flush();
      lesson = null;
      unit = line.replace(/^##\s*/, '').trim();
    } else if (lesson) {
      const q = /^\d+\.\s+(.*)$/.exec(line);
      if (q) {
        flush();
        current = { kind, text: q[1].trim() };
      } else if (current && line.trim()) {
        // answer choices ("   - أ) ...") and wrapped lines belong to the question above
        current.text += '\n' + line.trim().replace(/^-\s*/, '');
      }
    }
  }
  flush();
  return lessons.filter((l) => l.questions.length > 0);
}

export function loadBank(): BankLesson[] {
  if (cache) return cache;
  const all: BankLesson[] = [];
  for (const subject of ['math', 'science'] as const) {
    for (const grade of BANK_GRADES) {
      for (const term of [1, 2]) {
        const file = path.join(BANK_DIR, `${subject}-${grade}-${term}.md`);
        try {
          all.push(...parseFile(subject, grade, term, fs.readFileSync(file, 'utf8')));
        } catch (err) {
          console.warn(`[questionBank] could not read ${path.basename(file)}:`, err);
        }
      }
    }
  }
  cache = all;
  return all;
}

// Arabic is matched loosely: no diacritics, alef/yaa/taa-marbuta variants folded, the leading "ال" dropped.
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.replace(/^ال/, ''))
    .filter((t) => t.length >= 3);
}

const STOP = new Set(['الدرس', 'درس', 'كيف', 'ماذا', 'ما', 'هو', 'هي', 'من', 'في', 'علي', 'الي', 'عن', 'مع', 'لا', 'the', 'and', 'for', 'how', 'what', 'lesson']);

function lessonsFor(subject: BankSubject, grade: number | null): BankLesson[] {
  return loadBank().filter((l) => l.subject === subject && (grade === null || l.grade === grade));
}

function scoreLessons(pool: BankLesson[], query: string): { lesson: BankLesson; score: number }[] {
  const q = new Set(tokens(query).filter((t) => !STOP.has(t)));
  if (q.size === 0) return [];
  return pool
    .map((lesson) => {
      const own = new Set(tokens(lesson.title).filter((t) => !STOP.has(t)));
      const unit = new Set(tokens(lesson.unit).filter((t) => !STOP.has(t)));
      let hits = 0;
      for (const t of own) if (q.has(t)) hits += 2;
      for (const t of unit) if (q.has(t)) hits += 0.5;
      // share of the lesson title that the query covers, so a long script does not favour long titles
      return { lesson, score: own.size ? hits / (own.size + 1) : 0 };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

const PICK_SCHEMA = { type: 'OBJECT', properties: { lessons: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['lessons'] };

// Titles in the bank are Arabic. When the lesson text does not overlap with them (an English video title, a short name), ask the AI
// to choose from the list of lesson titles -- a tiny call, much cheaper than sending the questions.
async function pickWithAi(pool: BankLesson[], topic: string): Promise<BankLesson[]> {
  const list = pool.map((l, i) => `${i}: ${l.unit} / ${l.title}`).join('\n');
  const r = await callGemini(
    `A teacher wants questions on this lesson: "${topic}".\nBelow is the list of lessons of the school book (Arabic). Return the numbers of the 1 or 2 lessons that match it best, best first. Return an empty list if none of them matches.\n\n${list}`,
    PICK_SCHEMA,
    0
  );
  if (!r.ok) return [];
  const ids = (r.data as { lessons?: unknown })?.lessons;
  if (!Array.isArray(ids)) return [];
  return ids.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < pool.length).slice(0, 2).map((n) => pool[n]);
}

export type BankMatch = { lessons: BankLesson[]; reference: string };

/** The bank lessons that fit a lesson, plus a text block of their questions to put in the AI prompt. null when nothing fits. */
export async function findBankMatch(params: { subject: BankSubject; grade: number | null; topic: string; topicAr?: string; scriptText?: string; scriptTextAr?: string }): Promise<BankMatch | null> {
  const pool = lessonsFor(params.subject, params.grade);
  if (pool.length === 0) return null;

  // Title first (strong signal), then the scripts as a fallback.
  const byTitle = scoreLessons(pool, `${params.topicAr ?? ''} ${params.topic}`);
  // a second lesson only when it is nearly as good a match as the first
  let chosen: BankLesson[] = byTitle.filter((s) => s.score >= 0.4 && s.score >= byTitle[0].score * 0.75).slice(0, 2).map((s) => s.lesson);
  if (chosen.length === 0) {
    chosen = await pickWithAi(pool, `${params.topicAr ? params.topicAr + ' / ' : ''}${params.topic}`);
  }
  if (chosen.length === 0) {
    const byScript = scoreLessons(pool, `${params.scriptTextAr ?? ''} ${params.scriptText ?? ''}`);
    chosen = byScript.filter((s) => s.score >= 0.3 && s.score >= byScript[0].score * 0.75).slice(0, 2).map((s) => s.lesson);
  }
  if (chosen.length === 0) return null;
  return { lessons: chosen, reference: buildReference(chosen) };
}

/** Reference text for the prompt: a spread of every kind of question from each lesson, capped so the prompt stays small. */
export function buildReference(lessons: BankLesson[], maxChars = 6500): string {
  const perLesson = Math.floor(maxChars / lessons.length);
  const parts = lessons.map((l) => {
    const header = `# ${l.unit} -- ${l.title}`;
    let used = header.length;
    const picked: string[] = [];
    // walk the questions with a stride so the sample covers the whole lesson (easy ones first, harder later)
    const stride = Math.max(1, Math.ceil(l.questions.length / 24));
    for (let i = 0; i < l.questions.length; i += stride) {
      const text = l.questions[i].text;
      if (used + text.length + 4 > perLesson) break;
      picked.push(`- ${text}`);
      used += text.length + 4;
    }
    return `${header}\n${picked.join('\n')}`;
  });
  return parts.join('\n\n');
}

/** The single best bank lesson for a title by word overlap alone (no AI call); null when nothing fits well. */
export function matchByTitle(subject: BankSubject, grade: number | null, text: string): BankLesson | null {
  const best = scoreLessons(lessonsFor(subject, grade), text)[0];
  return best && best.score >= 0.4 ? best.lesson : null;
}

export function lessonsOf(subject: BankSubject, grade: number): BankLesson[] {
  return lessonsFor(subject, grade);
}
