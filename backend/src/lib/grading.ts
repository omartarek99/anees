// Shared multiple-choice grading: reels, boss fights, and worksheets all score a batch of
// { questionId, choiceIndex } answers against a set of questions the same way.

export type GradableQuestion = {
  id: number;
  correct_index: number;
  explanation: string;
  explanation_ar: string;
};

export type SubmittedAnswer = { questionId: number; choiceIndex: number };

export type GradedResult = {
  questionId: number;
  chosenIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
  explanationAr: string;
};

export function gradeAnswers<T extends GradableQuestion>(
  questions: T[],
  answers: SubmittedAnswer[]
): { results: GradedResult[]; correctCount: number } {
  let correctCount = 0;
  const results = questions.map((q) => {
    const answer = answers.find((a) => a.questionId === q.id);
    const chosenIndex = answer ? answer.choiceIndex : -1;
    const isCorrect = chosenIndex === q.correct_index;
    if (isCorrect) correctCount += 1;
    return {
      questionId: q.id,
      chosenIndex,
      correctIndex: q.correct_index,
      isCorrect,
      explanation: q.explanation,
      explanationAr: q.explanation_ar,
    };
  });
  return { results, correctCount };
}
