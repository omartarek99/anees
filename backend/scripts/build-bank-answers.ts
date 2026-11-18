// npm run bank:answers            -- fills backend/question-bank/answers.json: the four choices, the right answer and the explanation of every bank question
// npm run bank:answers -- --calc-only   -- only the plain calculations (exact arithmetic, no AI, no key needed)
//
// 1. A plain calculation is solved by code (lib/calcSolver.ts): the answer is certain.
// 2. Every other question is sent to the AI TWICE, in a different order, as two separate solves. The answer is kept only when both solves reach the same one.
//    A question both solves call unusable (unclear, wrong Arabic, no single answer, asks to draw / write) is listed as rejected and never goes on a worksheet.
//    A question the two solves disagree on stays without an answer (look at it, then run again).
// The script can be stopped and run again: it only works on what is still missing. Commit answers.json afterwards.
import { loadBank } from '../src/lib/questionBank.js';
import { bankItems, solveItems, type BankItem, type SolvedItem } from '../src/lib/bankWorksheet.js';
import { extendPool } from '../src/lib/variants.js';
import { solveCalculation } from '../src/lib/calcSolver.js';
import { readAnswerFile, writeAnswerFile } from '../src/lib/bankAnswers.js';

const calcOnly = process.argv.includes('--calc-only');
const file = readAnswerFile();

type Job = { subject: 'math' | 'science'; grade: number; item: BankItem };
const jobs: Job[] = [];
for (const lesson of loadBank()) {
  for (const item of extendPool(lesson, bankItems([lesson]))) jobs.push({ subject: lesson.subject, grade: lesson.grade, item });
}
const seen = new Set<string>();
const todo = jobs.filter((j) => (seen.has(j.item.key) ? false : (seen.add(j.item.key), true)));
console.log(`bank questions: ${todo.length}; with an answer already: ${todo.filter((j) => file.answers[j.item.key]).length}; rejected already: ${todo.filter((j) => file.rejected[j.item.key]).length}`);

const keep = (key: string, s: SolvedItem, by: 'calc' | 'ai') => {
  file.answers[key] = { c: s.choices, i: s.correctIndex, e: s.explanation, a: s.explanationAr, by };
};

// 1. plain calculations
let byCalc = 0;
for (const j of todo) {
  if (file.answers[j.item.key] || file.rejected[j.item.key]) continue;
  const s = solveCalculation(j.item);
  if (s) { keep(j.item.key, s, 'calc'); byCalc++; }
}
writeAnswerFile(file);
console.log(`solved by exact arithmetic: ${byCalc}`);

// 2. the rest, by the AI, twice
const norm = (t: string) => t.replace(/\s+/g, '').toLowerCase();
const rightText = (s: SolvedItem) => norm(s.choices[s.correctIndex] ?? '');
// "32 cm" and "32 سنتمتر" are the same answer: when both right answers carry numbers, the numbers decide
const digits = (s: SolvedItem) => ((s.choices[s.correctIndex] ?? '').replace(/(\d) (?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?(?:\/\d+)?/g) ?? []).join(',');
const sameAnswer = (x: SolvedItem, y: SolvedItem) => rightText(x) === rightText(y) || (digits(x) !== '' && digits(x) === digits(y));

async function main() {
  if (calcOnly) return;
  const pending = todo.filter((j) => !file.answers[j.item.key] && !file.rejected[j.item.key]);
  console.log(`left for the AI: ${pending.length}`);
  const groups = new Map<string, Job[]>();
  for (const j of pending) {
    const k = `${j.subject}|${j.grade}`;
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }
  let accepted = 0, rejected = 0, disagreed = 0, failed = 0, done = 0;
  for (const [k, list] of groups) {
    const [subject, grade] = k.split('|');
    const subjectName = subject === 'math' ? 'Maths' : 'Science';
    for (let i = 0; i < list.length; i += 10) {
      const chunk = list.slice(i, i + 10).map((j) => j.item);
      const [a, b] = await Promise.all([solveItems(chunk, subjectName, Number(grade)), solveItems([...chunk].reverse(), subjectName, Number(grade))]);
      done += chunk.length;
      if (!(a instanceof Map) || !(b instanceof Map)) {
        const why = (!(a instanceof Map) ? a.error : (b as { error: string }).error) ?? 'unknown';
        console.log(`  the AI did not answer (${why})`);
        if (why === 'NOT_CONFIGURED') { console.log('GEMINI_API_KEY is not set in backend/.env -- only the calculations were done.'); writeAnswerFile(file); return; }
        if (++failed >= 10) { console.log('Too many failures in a row (limit reached?). Run it again later.'); writeAnswerFile(file); return; }
        await new Promise((r) => setTimeout(r, 15_000 * failed)); // the AI is busy: wait a little longer each time
        i -= 10; // and try the same ten again
        continue;
      }
      failed = 0;
      for (const item of chunk) {
        const x = a.get(item.key), y = b.get(item.key);
        if (!x && !y) { file.rejected[item.key] = 'unusable'; rejected++; continue; }
        if (!x || !y) continue; // one solve usable, the other not: left for another run
        const same = item.kind === 'mcq' || item.kind === 'tf' ? x.correctIndex === y.correctIndex : sameAnswer(x, y);
        if (same) { keep(item.key, x, 'ai'); accepted++; } else { disagreed++; console.log(`  the two solves disagree: ${item.text.slice(0, 90)}`); }
      }
      writeAnswerFile(file);
      console.log(`  ${done}/${pending.length}  accepted ${accepted}, rejected ${rejected}, disagreed ${disagreed}`);
    }
  }
  console.log(`finished: accepted ${accepted}, rejected as unusable ${rejected}, the two solves disagreed ${disagreed}`);
}

await main();
const total = Object.keys(file.answers).length;
console.log(`answers.json now has ${total} answers and ${Object.keys(file.rejected).length} rejected questions.`);
writeAnswerFile(file);
process.exit(0);
