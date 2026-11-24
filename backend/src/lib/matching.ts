// A quiz in two styles, for reels (routes/reels.ts) and worksheets a student solves (routes/worksheets.ts): the first question is multiple
// choice, and of the rest the ones without a figure (at most `max`, the last ones) become a matching set when there are two or more -- each
// is paired with one answer from a shared pool of their right answers. A matching question is sent without its choices (the answers are
// never in the page), and the pool's order is the same every time (sorted by the English text), so the submit can rebuild it from the
// index sent.
type MatchRow = { id: number; choices_json: string; choices_json_ar?: string | null; correct_index: number; image?: string | null };
type Pick = { en: string; ar: string };

const rightAnswer = (q: MatchRow): Pick => {
  const en = JSON.parse(q.choices_json)[q.correct_index] as string;
  return { en, ar: (JSON.parse(q.choices_json_ar || '[]')[q.correct_index] as string | undefined) || en };
};

/** `ordered`: the questions in the order the student sees them. */
export function matchSet<T extends MatchRow>(ordered: T[], max = Infinity) {
  const eligible = ordered.slice(1).filter((q) => !q.image);
  const matched = eligible.length >= 2 ? eligible.slice(-max) : [];
  return { ids: new Set(matched.map((q) => q.id)), pool: matched.map(rightAnswer).sort((a, b) => a.en.localeCompare(b.en)) };
}

export type SentAnswer = { questionId: number; choiceIndex: number } | { questionId: number; matchIndex: number };

/**
 * Turns the answers sent into plain { questionId, choiceIndex } for lib/grading.ts: a pool answer counts as the right choice when its text is
 * the question's right answer, and as no choice (-1, wrong) otherwise. Also returns the pool answer given to each matching question, and a
 * helper that adds the answers as text to a graded result (a matching question's choices are not on the page to look them up in).
 */
export function resolveAnswers<T extends MatchRow>(ordered: T[], sent: SentAnswer[], max = Infinity) {
  const { ids, pool } = matchSet(ordered, max);
  const picked = new Map<number, Pick>();
  const answers = sent.flatMap((a) => {
    const q = ordered.find((x) => x.id === a.questionId);
    if (!q) return [];
    if ('choiceIndex' in a) return ids.has(q.id) ? [] : [a];
    const p = pool[a.matchIndex];
    if (!ids.has(q.id) || !p) return [];
    picked.set(q.id, p);
    return [{ questionId: q.id, choiceIndex: p.en === rightAnswer(q).en ? q.correct_index : -1 }];
  });
  const withText = <R extends { questionId: number; chosenIndex: number }>(r: R) => {
    const q = ordered.find((x) => x.id === r.questionId)!;
    const en = JSON.parse(q.choices_json) as string[];
    const ar = JSON.parse(q.choices_json_ar || '[]') as string[];
    const chosen = picked.get(q.id) ?? (r.chosenIndex >= 0 ? { en: en[r.chosenIndex], ar: ar[r.chosenIndex] || en[r.chosenIndex] } : null);
    const right = rightAnswer(q);
    return { ...r, chosenText: chosen?.en ?? null, chosenTextAr: chosen?.ar ?? null, correctText: right.en, correctTextAr: right.ar };
  };
  return { answers, withText };
}

/** The answer formats the submit routes accept (zod in each route): a choice, or a place in the match pool. */
export const MATCH_MAX_WORKSHEET = 4;
