import type { QuizQuestion } from './QuizCard';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';

export type ResultItem = {
  questionId: number;
  chosenIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
  explanationAr?: string | null;
};

export function QuizResults({ questions, results }: { questions: QuizQuestion[]; results: ResultItem[] }) {
  const { t, lang } = useLanguage();
  return (
    <div className="stack">
      {results.map((r) => {
        const q = questions.find((x) => x.id === r.questionId);
        if (!q) return null;
        return (
          <div
            key={r.questionId}
            className="card"
            style={{ borderInlineStart: `6px solid ${r.isCorrect ? 'var(--success)' : 'var(--danger)'}` }}
          >
            <p style={{ fontWeight: 700, marginBottom: 8 }}>
              {r.isCorrect ? '✅' : '❌'} {q.text}
            </p>
            {!r.isCorrect && r.chosenIndex >= 0 && (
              <p style={{ color: 'var(--danger)', fontSize: 14, margin: '4px 0' }}>
                {t('common.yourAnswer')} {q.choices[r.chosenIndex]}
              </p>
            )}
            <p style={{ color: 'var(--success)', fontSize: 14, margin: '4px 0', fontWeight: 700 }}>
              {t('common.correctAnswer')} {q.choices[r.correctIndex]}
            </p>
            <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>
              💡 {pickText(lang, r.explanation, r.explanationAr)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
