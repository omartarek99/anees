// One-off generator: writes backend/seed-data/challenge-hard.json -- the HARD questions for friend challenges (Math / Science, grades 5 and 6,
// 30 per subject and grade), written by the AI from the school question bank, with answers. Easy and medium challenge questions reuse the
// map's level pool (seed-data/level-pool.json). Run from backend/:  npx tsx --env-file=.env scripts/gen-challenge-hard.mts   (resumes)
import fs from 'node:fs';
import { generateQuizQuestions } from '../src/lib/gemini.js';
import { buildReference, lessonsOf, type BankSubject } from '../src/lib/questionBank.js';
import { teacherReelQuestionSchema } from '../src/lib/schemas.js';

const FILE = 'seed-data/challenge-hard.json';
type Cell = { subject: BankSubject; grade: number; questions: unknown[] };
const cells: Cell[] = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')).cells : [];
const HINT =
  'LEVEL: HARD -- needs real thinking: two or more steps, or applying the idea in a new situation. Still fair for the grade, with exactly one clearly correct answer and no trick wording.';

async function ask(subject: BankSubject, grade: number, call: number): Promise<any[]> {
  const book = lessonsOf(subject, grade);
  // the harder questions draw on the whole book, six different lessons for the six calls
  const lesson = book[Math.min(book.length - 1, Math.floor(((call + 0.5) * book.length) / 6))];
  console.log(`  ${subject} g${grade} call ${call} -> ${lesson.title}`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await generateQuizQuestions({
      scriptText: '',
      scriptTextAr: '',
      subjectName: subject === 'math' ? 'Math' : 'Science',
      grade,
      count: 5,
      topic: lesson.title,
      difficulty: 'hard',
      extraHint: HINT,
      bankReference: buildReference([lesson], 5000),
    });
    if (r.ok && Array.isArray(r.data)) {
      const valid = r.data.flatMap((q) => {
        const p = teacherReelQuestionSchema.safeParse(q);
        return p.success && p.data.correctIndex >= 0 && p.data.correctIndex <= 3 ? [p.data] : [];
      });
      if (valid.length >= 5) return valid.slice(0, 5);
    }
    console.log('    retry', attempt + 1, r.ok ? '(too few valid)' : r.error);
    await new Promise((res) => setTimeout(res, 2500));
  }
  throw new Error('failed');
}

for (const grade of [5, 6]) {
  for (const subject of ['math', 'science'] as const) {
    if (cells.some((c) => c.subject === subject && c.grade === grade)) continue;
    const q: unknown[] = [];
    for (let call = 0; call < 6; call++) q.push(...(await ask(subject, grade, call)));
    cells.push({ subject, grade, questions: q });
    fs.writeFileSync(FILE, JSON.stringify({ cells }, null, 1));
  }
}
console.log('done', cells.length, 'cells');
