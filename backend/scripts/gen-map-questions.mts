// One-off generator: writes backend/seed-data/map-questions.json -- the questions of every map level, taken from the school question
// bank (Math/Science, grades 5-6) and written by the AI with answers. Normal levels get 4 questions, boss fights 6 (half Math, half
// Science). Everything runs easy -> medium, nothing hard. Run from backend/:  npx tsx --env-file=.env scripts/gen-map-questions.mts
// The server applies the file at boot (src/lib/mapQuestions.ts).
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { generateQuizQuestions } from '../src/lib/gemini.js';
import { buildReference, lessonsOf, matchByTitle, type BankLesson, type BankSubject } from '../src/lib/questionBank.js';
import { teacherReelQuestionSchema } from '../src/lib/schemas.js';

const db = new DatabaseSync('data/app.db', { readOnly: true });
const levels = db
  .prepare(`SELECT m.level_number n, m.kind, m.title, m.title_ar titleAr, s.key subject FROM map_levels m LEFT JOIN subjects s ON s.id = m.subject_id ORDER BY m.level_number`)
  .all() as { n: number; kind: string; title: string; titleAr: string; subject: BankSubject | null }[];

const out: Record<string, unknown[]> = fs.existsSync('seed-data/map-questions.json') ? JSON.parse(fs.readFileSync('seed-data/map-questions.json', 'utf8')).levels : {};
const used = new Set<string>();

function spread(subject: BankSubject, grade: number, index: number, of: number): BankLesson {
  const all = lessonsOf(subject, grade);
  return all[Math.min(all.length - 1, Math.floor((index * all.length) / Math.max(1, of)))];
}

async function ask(lesson: BankLesson, count: number, hard: boolean): Promise<any[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await generateQuizQuestions({
      scriptText: '',
      scriptTextAr: '',
      subjectName: lesson.subject === 'math' ? 'Math' : 'Science',
      grade: lesson.grade,
      count,
      topic: lesson.title,
      difficulty: hard ? 'medium' : 'easy',
      progression: 'easy-to-medium',
      bankReference: buildReference([lesson], 5000),
    });
    if (r.ok && Array.isArray(r.data)) {
      const valid = r.data.flatMap((q) => {
        const p = teacherReelQuestionSchema.safeParse(q);
        return p.success && p.data.correctIndex >= 0 && p.data.correctIndex <= 3 && (attempt >= 2 || !used.has(p.data.questionText)) ? [p.data] : [];
      });
      if (valid.length >= count) {
        valid.slice(0, count).forEach((q) => used.add(q.questionText));
        return valid.slice(0, count);
      }
    }
    console.log('  retry', attempt + 1, r.ok ? '(too few valid)' : r.error);
    await new Promise((res) => setTimeout(res, 2500));
  }
  throw new Error(`could not generate for ${lesson.title}`);
}

let mathSeen = 0;
let sciSeen = 0;
const mathLevels = levels.filter((l) => l.kind === 'normal' && l.subject === 'math');
const sciLevels = levels.filter((l) => l.kind === 'normal' && l.subject === 'science');
for (const l of levels) {
  if (out[l.n]) { console.log('level', l.n, 'already done'); continue; }
  const grade = l.n <= 25 ? 5 : 6;
  if (l.kind === 'normal' && l.subject) {
    const list = l.subject === 'math' ? mathLevels : sciLevels;
    const idx = list.findIndex((x) => x.n === l.n);
    const lesson =
      matchByTitle(l.subject, grade, `${l.titleAr} ${l.title}`) ?? spread(l.subject, grade, idx % Math.ceil(list.length / 2), Math.ceil(list.length / 2));
    console.log('level', l.n, l.subject, '->', lesson.grade, lesson.title);
    out[l.n] = await ask(lesson, 4, l.n % 10 > 5 || l.n > 20);
  } else if (l.kind === 'boss') {
    const k = l.n / 5;
    const math = spread("math", grade, (k - 1) % 5, 5);
    const sci = spread("science", grade, (k - 1) % 5, 5);
    console.log('boss', l.n, '->', math.title, '+', sci.title);
    const m = await ask(math, 3, k > 2);
    const s = await ask(sci, 3, k > 2);
    out[l.n] = [m[0], s[0], m[1], s[1], m[2], s[2]];
  }
  fs.writeFileSync('seed-data/map-questions.json', JSON.stringify({ levels: out }, null, 1));
}
console.log('done', Object.keys(out).length, 'levels');
