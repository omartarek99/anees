import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText, translateApiError } from '../lib/i18n';
import { QuizCard, type QuizAnswer, type QuizQuestion } from '../components/QuizCard';
import { QuizResults, type ResultItem } from '../components/QuizResults';
import { Topbar } from '../components/Topbar';

type Subject = 'math' | 'science';
type Difficulty = 'easy' | 'medium' | 'hard';

type GenerateResponse = {
  worksheetId: number;
  subject: Subject;
  difficulty: Difficulty;
  xpPerCorrect: number;
  questions: { id: number; text: string; textAr?: string | null; choices: string[]; choicesAr?: string[] | null }[];
};

type SubmitResponse = {
  results: ResultItem[];
  correctCount: number;
  total: number;
  xpEarned: number;
};

export function WorksheetsPage() {
  const { refreshUser } = useAuth();
  const { t, lang } = useLanguage();
  const [subject, setSubject] = useState<Subject>('math');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [worksheet, setWorksheet] = useState<GenerateResponse | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const DIFFICULTIES: { key: Difficulty; label: string; xp: string; icon: string; color: string }[] = [
    { key: 'easy', label: t('worksheets.easy'), xp: t('worksheets.xpPerQuestion', { xp: 5 }), icon: '🌱', color: 'stat-card-green' },
    { key: 'medium', label: t('worksheets.medium'), xp: t('worksheets.xpPerQuestion', { xp: 10 }), icon: '🔥', color: 'stat-card-yellow' },
    { key: 'hard', label: t('worksheets.hard'), xp: t('worksheets.xpPerQuestion', { xp: 20 }), icon: '⚡', color: 'stat-card-pink' },
  ];

  const questions: QuizQuestion[] =
    worksheet?.questions.map((q) => ({
      id: q.id,
      text: pickText(lang, q.text, q.textAr),
      choices: lang === 'ar' && q.choicesAr ? q.choicesAr : q.choices,
    })) ?? [];

  async function generate() {
    setError(null);
    setLoading(true);
    setResult(null);
    try {
      const data = await api.post<GenerateResponse>('/worksheets/generate', { subject, difficulty });
      setWorksheet(data);
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('worksheets.genError'));
    } finally {
      setLoading(false);
    }
  }

  async function submit(answers: QuizAnswer[]) {
    if (!worksheet) return;
    setSubmitting(true);
    try {
      const data = await api.post<SubmitResponse>(`/worksheets/${worksheet.worksheetId}/submit`, { answers });
      setResult(data);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('worksheets.genError'));
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setWorksheet(null);
    setResult(null);
  }

  return (
    <div className="stack">
      <Topbar title={t('worksheets.title')} subtitle={t('worksheets.subtitle')} />

      {error && <div className="form-error-banner">{error}</div>}

      {!worksheet && (
        <div className="card stack">
          <div>
            <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>{t('worksheets.subject')}</label>
            <div className="pill-row">
              <button
                className={`category-pill stat-card-blue${subject === 'math' ? ' selected' : ''}`}
                onClick={() => setSubject('math')}
              >
                <span className="category-pill-icon">🧮</span>
                {t('worksheets.math')}
              </button>
              <button
                className={`category-pill stat-card-green${subject === 'science' ? ' selected' : ''}`}
                onClick={() => setSubject('science')}
              >
                <span className="category-pill-icon">🔬</span>
                {t('worksheets.science')}
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>{t('worksheets.difficulty')}</label>
            <div className="stack" style={{ gap: 8 }}>
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.key}
                  className={`list-row flex-between ${d.color}`}
                  style={{
                    border: difficulty === d.key ? '2px solid currentColor' : '2px solid transparent',
                    cursor: 'pointer',
                    width: '100%',
                  }}
                  onClick={() => setDifficulty(d.key)}
                >
                  <span className="flex gap-sm" style={{ alignItems: 'center' }}>
                    <span className="list-row-icon">{d.icon}</span>
                    <span style={{ fontWeight: 700 }}>{d.label}</span>
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{d.xp}</span>
                </button>
              ))}
            </div>
          </div>

          <button className="btn btn-primary btn-block" onClick={generate} disabled={loading}>
            {loading ? t('worksheets.generating') : t('worksheets.generate')}
          </button>
        </div>
      )}

      {worksheet && !result && (
        <div className="stack">
          <div className="flex-between">
            <h2 style={{ fontSize: 18 }}>
              {subject === 'math' ? t('worksheets.math') : t('worksheets.science')} —{' '}
              {t(`worksheets.${difficulty}`)}
            </h2>
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              {t('common.cancel')}
            </button>
          </div>
          <QuizCard questions={questions} onSubmit={submit} submitting={submitting} />
        </div>
      )}

      {worksheet && result && (
        <div className="stack">
          <div className="card text-center" style={{ background: 'var(--sand)' }}>
            <h2 style={{ fontSize: 22 }}>{t('reels.correctCount', { correct: result.correctCount, total: result.total })}</h2>
            <p className="badge badge-gold" style={{ fontSize: 15, marginTop: 8 }}>
              {t('common.xpGained', { xp: result.xpEarned })}
            </p>
          </div>
          <QuizResults questions={questions} results={result.results} />
          <button className="btn btn-primary btn-block" onClick={reset}>
            {t('worksheets.generateAnother')}
          </button>
        </div>
      )}
    </div>
  );
}
