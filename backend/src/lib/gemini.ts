const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.warn(
    '[gemini] GEMINI_API_KEY not set (see backend/.env.example) -- auto-generating quiz ' +
      'questions from a lesson script is disabled until backend/.env is filled in.'
  );
}

// Fast + cheap is the right tradeoff here -- this is short-form, grounded (the whole lesson
// script is right there in the prompt) multiple-choice generation, not open-ended reasoning.
const MODEL = 'gemini-3.6-flash';
const BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

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
}): Promise<GeminiResult<unknown>> {
  if (!GEMINI_API_KEY) {
    return { ok: false, error: 'NOT_CONFIGURED' };
  }

  const prompt = `You are writing a multiple-choice quiz for a ${params.subjectName} lesson aimed at grade ${params.grade} students (around age ${4 + params.grade}-${5 + params.grade}).

Lesson script (English):
"""
${params.scriptText}
"""
${
  params.scriptTextAr
    ? `Lesson script (Arabic):
"""
${params.scriptTextAr}
"""
`
    : ''
}
Write exactly ${params.count} multiple-choice questions that test understanding of THIS lesson specifically -- not general knowledge beyond what it covers. For each question:
- Exactly 4 answer choices, only one correct.
- correctIndex is the 0-based index of the correct choice.
- A short one-sentence explanation of why that answer is correct, written for a grade-${params.grade} student.
- Provide both an English version AND an Arabic version of the question, its 4 choices, and the explanation (questionTextAr/choicesAr/explanationAr). Write natural, grade-appropriate Modern Standard Arabic, not a literal machine translation.
- Keep the language simple, encouraging, and age-appropriate. No content outside what a 5th-grade classroom would cover.

Return ONLY the JSON array, matching the provided schema exactly.`;

  try {
    const res = await fetch(`${BASE_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: QUESTIONS_RESPONSE_SCHEMA,
          temperature: 0.6,
        },
      }),
    });

    const data = (await res.json()) as any;
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
