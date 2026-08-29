import { useState } from 'react';
import { useLanguage } from '../lib/language-context';

export type QuizQuestion = { id: number; text: string; choices: string[] };
export type QuizAnswer = { questionId: number; choiceIndex: number };

export function QuizCard({
  questions,
  onSubmit,
  submitting,
  submitLabel,
}: {
  questions: QuizQuestion[];
  onSubmit: (answers: QuizAnswer[]) => void;
  submitting: boolean;
  submitLabel?: string;
}) {
  const { t } = useLanguage();
  const [answers, setAnswers] = useState<Record<number, number>>({});

  const allAnswered = questions.every((q) => answers[q.id] !== undefined);

  function choose(questionId: number, choiceIndex: number) {
    setAnswers((prev) => ({ ...prev, [questionId]: choiceIndex }));
  }

  function handleSubmit() {
    const payload: QuizAnswer[] = questions.map((q) => ({ questionId: q.id, choiceIndex: answers[q.id] }));
    onSubmit(payload);
  }

  return (
    <div className="stack">
      {questions.map((q, qi) => (
        <div key={q.id} className="card">
          <p style={{ fontWeight: 700, marginBottom: 12 }}>
            {qi + 1}. {q.text}
          </p>
          <div className="stack" style={{ gap: 8 }}>
            {q.choices.map((choice, ci) => {
              const selected = answers[q.id] === ci;
              return (
                <button
                  key={ci}
                  type="button"
                  onClick={() => choose(q.id, ci)}
                  className="btn"
                  style={{
                    justifyContent: 'flex-start',
                    textAlign: 'start',
                    background: selected ? 'var(--maroon-pale)' : 'var(--sand-light)',
                    border: selected ? '2px solid var(--maroon)' : '2px solid transparent',
                    color: 'var(--ink)',
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: selected ? 'var(--maroon)' : 'var(--sand-dark)',
                      color: 'white',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {String.fromCharCode(65 + ci)}
                  </span>
                  {choice}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <button className="btn btn-primary btn-block" disabled={!allAnswered || submitting} onClick={handleSubmit}>
        {submitting ? t('quiz.checking') : submitLabel ?? t('quiz.submit')}
      </button>
    </div>
  );
}
