import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText, translateApiError } from '../lib/i18n';
import { QuizCard, type QuizAnswer, type QuizQuestion } from '../components/QuizCard';
import { QuizResults, type ResultItem } from '../components/QuizResults';
import { Topbar } from '../components/Topbar';

type QuizResponse = {
  level: { levelNumber: number; title: string; titleAr: string };
  questions: { id: number; text: string; textAr?: string | null; choices: string[]; choicesAr?: string[] | null }[];
};

type SubmitResponse = {
  results: ResultItem[];
  correctCount: number;
  total: number;
  xpEarned: number;
  stars: number;
  passed: boolean;
  leveledUp: boolean;
  newPlayerLevel: number;
};

// A map level is a round of 4 questions (Math and Science mixed): click a level, answer, and at least half right opens the next level.
export function LevelQuizPage() {
  const { levelNumber } = useParams();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { refreshUser } = useAuth();
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Bumped to ask for a fresh set of 4 random questions.
  const [round, setRound] = useState(0);

  useEffect(() => {
    setQuiz(null);
    setResult(null);
    setError(null);
    api
      .get<QuizResponse>(`/map/quiz/${Number(levelNumber)}`)
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
      const data = await api.post<SubmitResponse>(`/map/quiz/${Number(levelNumber)}/submit`, { answers });
      setResult(data);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('map.loadError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack">
      <Topbar
        title={t('levelQuiz.title', { n: Number(levelNumber) })}
        subtitle={quiz ? pickText(lang, quiz.level.title, quiz.level.titleAr) : undefined}
      />

      {error && <div className="form-error-banner" role="alert">{error}</div>}
      {!quiz && !error && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}
      {error && !quiz && (
        <button className="btn btn-secondary" onClick={() => navigate('/map')}>
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
            <p style={{ marginTop: 10, fontWeight: 700 }}>{result.passed ? t('levelQuiz.passed') : t('levelQuiz.failed')}</p>
          </div>
          <QuizResults questions={questions} results={result.results} />
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => navigate('/map')}>
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
  );
}
