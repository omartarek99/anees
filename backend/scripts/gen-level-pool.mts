// One-off generator: writes backend/seed-data/level-pool.json -- the question pool behind the adventure-map levels. 10 difficulty
// tiers (levels 1-5 = tier 1 ... levels 46-50 = tier 10) x Math/Science x grade 5/6, 10 questions each, from the school question
// bank. Tier 1 is the easiest warm-up and tier 10 is MEDIUM -- never hard. Clicking a level serves 4 random questions of its tier
// (2 Math + 2 Science). Run from backend/:  npx tsx --env-file=.env scripts/gen-level-pool.mts   (resumes if interrupted)
import fs from 'node:fs';
import { generateQuizQuestions } from '../src/lib/gemini.js';
import { buildReference, lessonsOf, type BankSubject } from '../src/lib/questionBank.js';
import { teacherReelQuestionSchema } from '../src/lib/schemas.js';

const FILE = 'seed-data/level-pool.json';
type Cell = { subject: BankSubject; grade: number; tier: number; questions: unknown[] };
const cells: Cell[] = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')).cells : [];

const HINTS = [
  'LEVEL: tier 1 of 10 -- the VERY EASIEST warm-up: one simple step, small numbers, a basic fact a child knows right after the lesson starts.',
  'LEVEL: tier 2 of 10 -- very easy: one simple step with friendly numbers.',
  'LEVEL: tier 3 of 10 -- easy: direct questions on the lesson.',
  'LEVEL: tier 4 of 10 -- easy: direct, with slightly bigger numbers or one more detail.',
  'LEVEL: tier 5 of 10 -- easy to a little more: one or two simple steps.',
  'LEVEL: tier 6 of 10 -- a bit above easy: one or two steps, a short real-life situation is fine.',
  'LEVEL: tier 7 of 10 -- between easy and medium: two steps.',
  'LEVEL: tier 8 of 10 -- light medium: two steps, a short situation.',
  'LEVEL: tier 9 of 10 -- medium: needs a little thinking, still fair for the grade.',
  'LEVEL: tier 10 of 10 -- MEDIUM (the top of the game): needs some thinking, but never hard or tricky.',
];

async function ask(subject: BankSubject, grade: number, tier: number, call: number): Promise<any[]> {
  const book = lessonsOf(subject, grade);
  // later tiers draw on later lessons of the book; the two calls of a tier use neighbouring lessons
  const slot = (tier - 1) * 2 + call;
  const lesson = book[Math.min(book.length - 1, Math.floor((slot * book.length) / 20))];
  console.log(`  ${subject} g${grade} tier ${tier} call ${call} -> ${lesson.title}`);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await generateQuizQuestions({
      scriptText: '',
      scriptTextAr: '',
      subjectName: subject === 'math' ? 'Math' : 'Science',
      grade,
      count: 5,
      topic: lesson.title,
      difficulty: tier >= 9 ? 'medium' : 'easy',
      extraHint: HINTS[tier - 1],
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

for (let tier = 1; tier <= 10; tier++) {
  for (const grade of [5, 6]) {
    for (const subject of ['math', 'science'] as const) {
      if (cells.some((c) => c.subject === subject && c.grade === grade && c.tier === tier)) continue;
      const q = [...(await ask(subject, grade, tier, 0)), ...(await ask(subject, grade, tier, 1))];
      cells.push({ subject, grade, tier, questions: q });
      fs.writeFileSync(FILE, JSON.stringify({ cells }, null, 1));
    }
  }
}
console.log('done', cells.length, 'cells');
