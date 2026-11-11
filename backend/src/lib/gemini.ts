// One key or several. The keys are tried in this order, and the next one is used when the one before is out of quota (or rejected):
//   GEMINI_API_KEY          the main key
//   GEMINI_API_KEY_BACKUP   a second key, used only when the main one cannot answer
//   GEMINI_API_KEYS         (optional) any number of keys, comma separated -- they come after the two above
// Note: the daily quota belongs to the Google PROJECT, not to the key: a second key of the same project shares its quota, so the backup has to come from a
// different project. Keys are never logged or sent anywhere except to Google.
const clean = (v: string | undefined) => v?.trim().replace(/^["']+|["']+$/g, '').trim() || '';
const KEYS = [...new Set([clean(process.env.GEMINI_API_KEY), clean(process.env.GEMINI_API_KEY_BACKUP), ...(process.env.GEMINI_API_KEYS ?? '').split(',').map(clean)].filter(Boolean))];
const GEMINI_API_KEY = KEYS[0];
if (KEYS.length > 1) console.log(`[gemini] ${KEYS.length} API keys configured (the others are used when the first is out of quota)`);

if (!GEMINI_API_KEY) {
  console.warn(
    '[gemini] GEMINI_API_KEY not set (see backend/.env.example) -- auto-generating quiz ' +
      'questions from a lesson script is disabled until backend/.env is filled in.'
  );
}

// Fast + cheap is the right tradeoff here -- this is short-form, grounded (the whole lesson
// script is right there in the prompt) multiple-choice generation, not open-ended reasoning.
// Tried in order. Each model has its OWN daily quota / capacity on Google's side, so when one
// is out of quota (429) or overloaded (503) the next one is used instead of failing the
// request -- the best-quality model first, the lite ones as the safety net. Override with a
// comma-separated GEMINI_MODELS in backend/.env.
const MODELS = (process.env.GEMINI_MODELS ?? 'gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3-flash-preview,gemini-3.8-flash')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const urlFor = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// A model that just answered "quota exceeded" is skipped for a while -- the quota is per day,
// so re-asking it on every click only adds latency.
const QUOTA_SKIP_MS = 30 * 60 * 1000;
const quotaSkipUntil = new Map<string, number>(); // key: `${keyIndex}:${model}` -- the quota is per key's project and per model
const badKeyUntil = new Map<number, number>(); // a key Google refused (invalid, disabled): skipped for a while
const BAD_KEY_SKIP_MS = 10 * 60 * 1000;
// Models that answered 400 to a thinking setting (not every model accepts every level): asked again without it, and remembered.
const thinkingRejected = new Set<string>();

// Gemini's structured-output schema is an OpenAPI-3.0-ish subset, not literal JSON Schema
// (uppercase type names, no `minItems`/`maxItems` on arrays -- length is enforced by the
// prompt + the zod validation the caller runs on the parsed result instead).
const QUESTIONS_RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      questionText: { type: 'STRING' },
      questionTextAr: { type: 'STRING' },
      choices: { type: 'ARRAY', items: { type: 'STRING' } },
      choicesAr: { type: 'ARRAY', items: { type: 'STRING' } },
      correctIndex: { type: 'INTEGER' },
      explanation: { type: 'STRING' },
      explanationAr: { type: 'STRING' },
    },
    // The working (explanation) is written before the answer (correctIndex): the model solves the question in its own output first.
    propertyOrdering: ['questionText', 'choices', 'explanation', 'correctIndex', 'questionTextAr', 'choicesAr', 'explanationAr'],
    required: ['questionText', 'questionTextAr', 'choices', 'choicesAr', 'correctIndex', 'explanation', 'explanationAr'],
  },
};

export type GeminiResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function generateQuizQuestions(params: {
  scriptText: string;
  scriptTextAr: string;
  subjectName: string;
  grade: number;
  count: number;
  // Optional -- set when the quiz is for a worksheet tied to a specific video: the lesson's
  // title is the topic the questions must be about, and difficulty tunes how hard they are.
  topic?: string;
  topicAr?: string;
  // Questions already used for this lesson -- the model must write NEW ones, so each
  // generated worksheet differs from the previous ones.
  avoidQuestions?: string[];
  difficulty?: 'easy' | 'medium' | 'hard';
  // 'worksheet' = practice sheets: mostly short numeric/calculation problems instead of the
  // wordier conceptual questions used for lesson quizzes.
  style?: 'worksheet';
  // Questions from the school question bank (questionBank.ts) for the lesson: the new questions are written in the same
  // spirit and on the same skills, with the correct answers worked out here since the bank has none.
  bankReference?: string;
  // 'easy-to-medium' = the list starts easy and ends medium; never hard.
  progression?: 'easy-to-medium';
  // Free-text level instruction (e.g. exactly how easy), added next to the difficulty line.
  extraHint?: string;
}): Promise<GeminiResult<unknown>> {
  if (!GEMINI_API_KEY) {
    return { ok: false, error: 'NOT_CONFIGURED' };
  }

  const difficultyHint =
    params.difficulty === 'easy'
      ? 'Difficulty: EASY -- direct recall of the lesson\'s key facts, simple wording.'
      : params.difficulty === 'medium'
        ? 'Difficulty: MEDIUM -- a mix of recall and simple application of what the lesson teaches.'
        : params.difficulty === 'hard'
          ? 'Difficulty: HARD -- application and reasoning questions that need real understanding of the lesson.'
          : '';

  const prompt = `You are writing a multiple-choice quiz for a ${params.subjectName} lesson aimed at grade ${params.grade} students (around age ${4 + params.grade}-${5 + params.grade}).
${
  params.topic
    ? `
Lesson topic / video title: "${params.topic}"${params.topicAr ? ` (Arabic: "${params.topicAr}")` : ''}
Every question must be about this topic. If the script below is short, use the topic itself and what a grade-${params.grade} ${params.subjectName} class would cover about it.
`
    : ''
}${difficultyHint ? `${difficultyHint}\n` : ''}${params.extraHint ? `${params.extraHint}\n` : ''}${
    params.progression === 'easy-to-medium'
      ? 'ORDER AND LEVEL: start with the easiest question and get gradually harder, ending at MEDIUM. Do NOT write any hard or tricky question.\n'
      : ''
  }${
    params.bankReference
      ? `
SCHOOL QUESTION BANK for this lesson (Arabic, from the official practice material; it has NO answers):
"""
${params.bankReference}
"""
Base your questions on these: same skills, same topics, same kind of numbers and wording. Do NOT copy one word for word -- write fresh variations (change the numbers or the situation), and solve each one yourself so the correct answer is certain. Skip any bank question whose wording is unclear or that cannot be a multiple-choice question.
`
      : ''
  }
${
  params.scriptText
    ? `Lesson script (English):
"""
${params.scriptText}
"""
`
    : `(No lesson script was provided -- write the questions from the topic above, using what a grade-${params.grade} ${params.subjectName} class is taught about it.)
`
}${
  params.scriptTextAr
    ? `Lesson script (Arabic):
"""
${params.scriptTextAr}
"""
`
    : ''
}
${
  params.avoidQuestions && params.avoidQuestions.length > 0
    ? `These questions were already used -- do NOT repeat or merely rephrase any of them; cover different facts, angles and examples from the lesson:
${params.avoidQuestions.map((q) => `- ${q}`).join('\n')}

`
    : ''
}${
  params.style === 'worksheet'
    ? `QUESTION STYLE (very important -- this is a practice worksheet):
- About 90% of the questions (at least ${Math.ceil(params.count * 0.9)} of ${params.count}) must be CALCULATION problems: the student works something out with numbers (add, subtract, multiply, divide, fractions, decimals, percentages, units and measurement, comparing/ordering numbers, simple formulas, area/perimeter, time, money...) related to the topic. Not definitions, not recall, not "which statement is true".
- Keep every question SHORT and CLEAR: one short sentence, or just the expression itself (for example "0.35 + 0.4 = ?" or "What is 3/4 of 20?"). No stories, no long wording, no unnecessary details.
- Answer choices must be short: plain numbers, or numbers with a unit.
- At most ${Math.max(0, params.count - Math.ceil(params.count * 0.9))} question(s) may be a short non-numeric question about the topic.
- If the topic is a science topic, use numeric questions wherever they are NATURAL (measurements, counting items in a simple example, comparing quantities, units, simple energy/time/distance calculations). Never force a number into a question where it makes no sense.
- Every question must have exactly ONE clearly correct answer. Double-check all arithmetic and facts before answering. Do not write a question that is ambiguous, trick-like, or whose wording does not make sense; if unsure, write a simpler, cleaner one.
- In the explanation, show the working in one short line.

`
    : ''
}Write exactly ${params.count} multiple-choice questions that test understanding of THIS lesson specifically -- not general knowledge beyond what it covers. For each question:
- Exactly 4 answer choices, only one correct.
- correctIndex is the 0-based index of the correct choice.
- A short one-sentence explanation of why that answer is correct, written for a grade-${params.grade} student.
- Provide both an English version AND an Arabic version of the question, its 4 choices, and the explanation (questionTextAr/choicesAr/explanationAr). Write natural, grade-appropriate Modern Standard Arabic, not a literal machine translation.
- Keep the language simple, encouraging, and age-appropriate. No content outside what a 5th-grade classroom would cover.

Return ONLY the JSON array, matching the provided schema exactly.`;

  // 'minimal' thinking: by default the faster models "think" for thousands of tokens before writing the questions (10s instead of 3s for five of them).
  return callGemini(prompt, QUESTIONS_RESPONSE_SCHEMA, params.avoidQuestions && params.avoidQuestions.length > 0 ? 0.9 : 0.6, 60_000, { thinking: 'minimal' });
}

// One structured-output call down the model fallback chain; the caller validates what comes back.
export async function callGemini(prompt: string, schema: unknown, temperature: number, budgetMs = 60_000, options: { thinking?: 'minimal' } = {}): Promise<GeminiResult<unknown>> {
  if (!GEMINI_API_KEY) {
    return { ok: false, error: 'NOT_CONFIGURED' };
  }
  try {
    let res: Response | null = null;
    let data: any = null;
    const now = Date.now();
    // One overall budget across the whole model fallback chain: five models x 40s would hold the
    // request open ~200s, past the hosting proxy's own limit (about 100s).
    const deadline = now + budgetMs;
    const liveKeys = KEYS.map((k, i) => i).filter((i) => (badKeyUntil.get(i) ?? 0) <= now);
    const keyOrder = liveKeys.length > 0 ? liveKeys : KEYS.map((k, i) => i);
    // The pairs to try: the first key with every model, then the next key with every model, ... A pair that was recently out of quota is left for last.
    const pairs = keyOrder.flatMap((ki) => MODELS.map((m) => ({ ki, m })));
    const fresh = pairs.filter((p) => (quotaSkipUntil.get(`${p.ki}:${p.m}`) ?? 0) <= now);
    const queue = fresh.length > 0 ? fresh : pairs; // everything was recently out of quota: still try them all rather than fail without asking
    for (const { ki, m: model } of queue) {
      const budget = deadline - Date.now();
      if (budget < 2_000) break;
      const apiKey = KEYS[ki];
      let r: Response;
      let d: any;
      try {
        const post = (withThinking: boolean) =>
          fetch(`${urlFor(model)}?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // A hung upstream must not hang the user's request forever.
            signal: AbortSignal.timeout(Math.min(25_000, budget)), // a model that has not answered in 25s is not going to help: try the next one
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: schema,
                temperature,
                ...(withThinking ? { thinkingConfig: { thinkingLevel: options.thinking } } : {}),
              },
            }),
          });
        const useThinking = !!options.thinking && !thinkingRejected.has(model);
        r = await post(useThinking);
        d = await r.json();
        if (useThinking && r.status === 400 && /thinking/i.test(String(d?.error?.message ?? ''))) {
          thinkingRejected.add(model);
          r = await post(false);
          d = await r.json();
        }
      } catch {
        continue; // timeout / network blip on this model -- try the next one
      }
      res = r;
      data = d;
      if (r.ok) break;
      if (r.status === 429 && /quota/i.test(String(d?.error?.message ?? ''))) {
        quotaSkipUntil.set(`${ki}:${model}`, Date.now() + QUOTA_SKIP_MS);
      }
      // The key itself was refused (wrong, disabled, restricted): every model would say the same, so go straight to the next key.
      if (r.status === 403 || (r.status === 400 && /api key|API_KEY/i.test(String(d?.error?.message ?? '')))) {
        badKeyUntil.set(ki, Date.now() + BAD_KEY_SKIP_MS);
        console.error(`[gemini] key #${ki + 1} was refused (HTTP ${r.status}); trying the next key if there is one`);
        continue;
      }
      // Quota / overload / model unavailable: next model. Anything else (bad request,
      // auth) would fail identically on every model, so stop.
      if (![429, 503, 500, 404].includes(r.status)) break;
    }

    if (!res) {
      return { ok: false, error: 'NETWORK_ERROR' };
    }
    if (!res.ok) {
      return { ok: false, error: data?.error?.message ?? `HTTP_${res.status}` };
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      return { ok: false, error: 'EMPTY_RESPONSE' };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: 'INVALID_JSON' };
    }

    return { ok: true, data: parsed };
  } catch {
    return { ok: false, error: 'NETWORK_ERROR' };
  }
}
