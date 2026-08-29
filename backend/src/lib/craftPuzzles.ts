function pick(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function choice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export type CraftPuzzle = { question: string; answer: number; choices: number[] };

/** Pure arithmetic notation (digits/operators), so no Arabic variant is needed. */
export function generateCraftPuzzle(tier: 1 | 2 | 3 | 4): CraftPuzzle {
  let a: number, b: number, c: number, op: string, answer: number, question: string;

  if (tier === 1) {
    op = choice(['+', '-']);
    a = pick(1, 20);
    b = pick(1, 20);
    if (op === '-' && b > a) [a, b] = [b, a];
    answer = op === '+' ? a + b : a - b;
    question = `${a} ${op} ${b}`;
  } else if (tier === 2) {
    op = choice(['+', '-', '×']);
    if (op === '×') {
      a = pick(2, 10);
      b = pick(2, 10);
      answer = a * b;
    } else {
      a = pick(10, 100);
      b = pick(1, 100);
      if (op === '-' && b > a) [a, b] = [b, a];
      answer = op === '+' ? a + b : a - b;
    }
    question = `${a} ${op} ${b}`;
  } else if (tier === 3) {
    op = choice(['×', '÷', '+', '-']);
    if (op === '×') {
      a = pick(2, 12);
      b = pick(2, 12);
      answer = a * b;
      question = `${a} × ${b}`;
    } else if (op === '÷') {
      b = pick(2, 12);
      answer = pick(2, 12);
      a = b * answer;
      question = `${a} ÷ ${b}`;
    } else {
      a = pick(20, 200);
      b = pick(1, 200);
      if (op === '-' && b > a) [a, b] = [b, a];
      answer = op === '+' ? a + b : a - b;
      question = `${a} ${op} ${b}`;
    }
  } else {
    if (Math.random() < 0.6) {
      a = pick(2, 12);
      b = pick(2, 12);
      c = pick(1, 20);
      answer = a * b + c;
      question = `${a} × ${b} + ${c}`;
    } else {
      op = choice(['×', '÷']);
      if (op === '×') {
        a = pick(6, 15);
        b = pick(6, 15);
        answer = a * b;
      } else {
        b = pick(3, 15);
        answer = pick(3, 15);
        a = b * answer;
      }
      question = `${a} ${op} ${b}`;
    }
  }

  const opts = new Set<number>([answer]);
  const spread = Math.max(3, Math.round(answer * 0.15));
  while (opts.size < 4) {
    const val = answer + pick(-spread, spread);
    if (val !== answer && val >= 0 && !opts.has(val)) opts.add(val);
  }
  const choices = Array.from(opts);
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { question, answer, choices };
}
