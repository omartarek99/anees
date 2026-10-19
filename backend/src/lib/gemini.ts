const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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
const quotaSkipUntil = new Map<string, number>();

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
}${difficultyHint ? `${difficultyHint}\n` : ''}
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

  try {
    let res: Response | null = null;
    let data: any = null;
    const now = Date.now();
    const candidates = MODELS.filter((m) => (quotaSkipUntil.get(m) ?? 0) <= now);
    // Everything was recently out of quota -- still try them all rather than fail without asking.
    for (const model of candidates.length > 0 ? candidates : MODELS) {
      let r: Response;
      let d: any;
      try {
        r = await fetch(`${urlFor(model)}?key=${GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // A hung upstream must not hang the user's request forever.
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: QUESTIONS_RESPONSE_SCHEMA,
              temperature: params.avoidQuestions && params.avoidQuestions.length > 0 ? 0.9 : 0.6,
            },
          }),
        });
        d = await r.json();
      } catch {
        continue; // timeout / network blip on this model -- try the next one
      }
      res = r;
      data = d;
      if (r.ok) break;
      if (r.status === 429 && /quota/i.test(String(d?.error?.message ?? ''))) {
        quotaSkipUntil.set(model, Date.now() + QUOTA_SKIP_MS);
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
