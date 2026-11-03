import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText, translateApiError } from '../lib/i18n';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { QuizCard, type QuizAnswer, type QuizQuestion } from './QuizCard';
import { QuizResults, type ResultItem } from './QuizResults';

type QuizResponse = {
  level: { levelNumber: number; title: string; titleAr: string };
  questions: { id: number; text: string; textAr?: string | null; choices: string[]; choicesAr?: string[] | null }[];
};

type SubmitResponse = {
  results: ResultItem[];
  correctCount: number;
  total: number;
  xpEarned: number;
  xpLost: number;
  stars: number;
  passed: boolean;
  leveledUp: boolean;
  newPlayerLevel: number;
};

/**
 * A map level's round of 4 questions in a pop-up window over the map (like the boss levels' arena), instead of a page of its own: click a level,
 * answer, and at least half right opens the next level. `onClose` is called when the window is closed, whether or not the round was finished
 * (the map then reloads to show what was unlocked).
 */
export function LevelQuizModal({ levelNumber, onClose }: { levelNumber: number; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const { refreshUser } = useAuth();
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Bumped to ask for a fresh set of 4 random questions.
  const [round, setRound] = useState(0);

  useEscapeToClose(onClose);

  useEffect(() => {
    setQuiz(null);
    setResult(null);
    setError(null);
    api
      .get<QuizResponse>(`/map/quiz/${levelNumber}`)
      .then(setQuiz)
      .catch((err) => setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('map.loadError')));
  }, [levelNumber, round]); // eslint-disable-line react-hooks/exhaustive-deps

  const questions: QuizQuestion[] =
    quiz?.questions.map((q) => ({
      id: q.id,
      text: pickText(lang, q.text, q.textAr),
      choices: lang === 'ar' && q.choicesAr && q.choicesAr.every(Boolean) ? q.choicesAr : q.choices,
    })) ?? [];

  async function submit(answers: QuizAnswer[]) {
    setSubmitting(true);
    setError(null);
    try {
      const data = await api.post<SubmitResponse>(`/map/quiz/${levelNumber}/submit`, { answers });
      setResult(data);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('map.loadError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-panel level-quiz-panel" role="dialog" aria-modal="true" aria-label={t('levelQuiz.title', { n: levelNumber })}>
        <div className="flex-between" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 21 }}>{t('levelQuiz.title', { n: levelNumber })}</h2>
            {quiz && <p className="muted" style={{ margin: '2px 0 0', fontSize: 14 }}>{pickText(lang, quiz.level.title, quiz.level.titleAr)}</p>}
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} aria-label={t('common.close')} title={t('common.close')} style={{ minHeight: 34, padding: '4px 12px' }}>
            ✕
          </button>
        </div>

        {error && <div className="form-error-banner" role="alert">{error}</div>}
        {!quiz && !error && (
          <div className="empty-state">
            <div className="spinner" />
          </div>
        )}
        {error && !quiz && (
          <button className="btn btn-secondary" onClick={onClose}>
            {t('levelQuiz.backToMap')}
          </button>
        )}

        {quiz && !result && <QuizCard questions={questions} onSubmit={submit} submitting={submitting} />}

        {quiz && result && (
          <div className="stack">
            <div className="card text-center" style={{ background: 'var(--sand)' }}>
              <h2 style={{ fontSize: 22 }}>{t('reels.correctCount', { correct: result.correctCount, total: result.total })}</h2>
              <p style={{ fontSize: 28, margin: '6px 0' }} aria-label={`${result.stars} / 3`}>
                {'⭐'.repeat(result.stars) || '—'}
              </p>
              <p className="badge badge-gold" style={{ fontSize: 15 }}>
                {t('common.xpGained', { xp: result.xpEarned })}
              </p>
              {result.xpLost > 0 && <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>{t('common.xpLost', { xp: result.xpLost })}</p>}
              <p style={{ marginTop: 10, fontWeight: 700 }}>{result.passed ? t('levelQuiz.passed') : t('levelQuiz.failed')}</p>
            </div>
            <QuizResults questions={questions} results={result.results} />
            <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={onClose}>
                {t('levelQuiz.backToMap')}
              </button>
              {!result.passed && (
                <button className="btn btn-secondary" onClick={() => setRound((r) => r + 1)}>
                  {t('levelQuiz.tryAgain')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
