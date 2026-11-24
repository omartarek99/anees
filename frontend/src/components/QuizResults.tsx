import { RiCheckboxCircleFill, RiCloseCircleFill, RiLightbulbLine } from '@remixicon/react';
import { QFigure } from './QFigure';
import type { QuizQuestion } from './Quiz';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { QText } from './QText';

export type ResultItem = {
  questionId: number;
  chosenIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
  explanationAr?: string | null;
  // the answers as text (reels send them: a matching question has no choices on the page)
  chosenText?: string | null;
  chosenTextAr?: string | null;
  correctText?: string;
  correctTextAr?: string;
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
            <p className="quiz-q" style={{ marginBottom: 8 }}>
              {r.isCorrect ? <RiCheckboxCircleFill size={18} aria-hidden="true" color="var(--success)" style={{ verticalAlign: '-3px' }} /> : <RiCloseCircleFill size={18} aria-hidden="true" color="var(--danger)" style={{ verticalAlign: '-3px' }} />} <QText text={q.text} />
            </p>
            <QFigure image={q.image} />
            {!r.isCorrect && (r.chosenText || r.chosenIndex >= 0) && (
              <p style={{ color: 'var(--danger)', fontSize: 14, margin: '4px 0' }}>
                {t('common.yourAnswer')} <QText text={r.chosenText ? pickText(lang, r.chosenText, r.chosenTextAr) : q.choices[r.chosenIndex]} />
              </p>
            )}
            <p style={{ color: 'var(--success)', fontSize: 14, margin: '4px 0', fontWeight: 700 }}>
              {t('common.correctAnswer')} <QText text={r.correctText ? pickText(lang, r.correctText, r.correctTextAr) : q.choices[r.correctIndex]} />
            </p>
            <p className="muted quiz-q" style={{ fontSize: 14, marginTop: 6, fontWeight: 400 }}>
              <RiLightbulbLine size={16} aria-hidden="true" style={{ verticalAlign: '-3px' }} /> <QText text={pickText(lang, r.explanation, r.explanationAr)} />
            </p>
          </div>
        );
      })}
    </div>
  );
}
