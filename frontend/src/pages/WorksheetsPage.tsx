import { useEffect, useRef, useState } from 'react';
import { RiVideoLine } from '@remixicon/react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { pickText, translateApiError } from '../lib/i18n';
import { QuizCard, type QuizAnswer, type QuizQuestion } from '../components/QuizCard';
import { QuizResults, type ResultItem } from '../components/QuizResults';
import { Topbar } from '../components/Topbar';
import { DifficultyDial, type DialOption } from '../components/DifficultyDial';
import { PrintableWorksheet } from '../components/PrintableWorksheet';

type Subject = 'math' | 'science';
type Difficulty = 'easy' | 'medium' | 'hard';

// The artwork for the two subjects and three difficulty levels (public/images/worksheets/<name>.webp).
const art = (name: string) => `/images/worksheets/${name}.webp`;

type GenerateResponse = {
  worksheetId: number;
  subject: Subject;
  difficulty: Difficulty;
  xpPerCorrect: number;
  video?: { id: number; title: string; titleAr: string; authorName: string };
  // The lesson name (درس) the user typed for a general worksheet.
  topic?: string;
  // The AI couldn't write questions for the typed lesson, so this is a general bank worksheet.
  aiUnavailable?: boolean;
  questions: { id: number; text: string; textAr?: string | null; choices: string[]; choicesAr?: string[] | null }[];
};

type WorksheetVideo = {
  id: number;
  title: string;
  titleAr: string;
  grade: number;
  subject: Subject;
  authorName: string;
};

type SubmitResponse = {
  results: ResultItem[];
  correctCount: number;
  total: number;
  xpEarned: number;
};

export function WorksheetsPage() {
  const { user, refreshUser } = useAuth();
  const { t, lang } = useLanguage();
  const [subject, setSubject] = useState<Subject>('math');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [worksheet, setWorksheet] = useState<GenerateResponse | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Videos this user can build a worksheet from (students: their grade's teacher videos;
  // teachers: their own uploads) -- offered as suggestions in the lesson-name box below.
  const [videos, setVideos] = useState<WorksheetVideo[]>([]);
  // The name of the lesson (درس) or of a video -- the AI writes new questions about it.
  const [lessonName, setLessonName] = useState('');
  // The grade of the lesson (the school book it comes from) and how many questions the sheet has.
  const [grade, setGrade] = useState<5 | 6>(user?.grade === 6 ? 6 : 5);
  const [count, setCount] = useState(10);
  // The Generate button sits at the bottom of the form but the error banner at the top -- bring a
  // new error into view so a failed click doesn't look like nothing happened.
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [error]);
  // A new worksheet / its results replace the form: start at the top, not mid-page.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [worksheet, result]);

  useEffect(() => {
    api
      .get<{ videos: WorksheetVideo[] }>('/worksheets/videos')
      .then((data) => setVideos(data.videos))
      .catch(() => setVideos([]));
  }, []);

  // If the typed name is exactly one of the video titles, the worksheet is built from that
  // video's description (and subject); otherwise from the typed lesson name alone.
  const typedName = lessonName.trim();
  const selectedVideo =
    typedName === ''
      ? null
      : videos.find((v) => [v.title, v.titleAr].some((n) => n && n.trim().toLowerCase() === typedName.toLowerCase())) ?? null;

  const DIFFICULTIES: DialOption<Difficulty>[] = [
    { key: 'easy', label: t('worksheets.easy'), xp: t('worksheets.xpPerQuestion', { xp: 5 }), icon: art('easy') },
    { key: 'medium', label: t('worksheets.medium'), xp: t('worksheets.xpPerQuestion', { xp: 10 }), icon: art('medium') },
    { key: 'hard', label: t('worksheets.hard'), xp: t('worksheets.xpPerQuestion', { xp: 20 }), icon: art('hard') },
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
      const body = selectedVideo ? { reelId: selectedVideo.id, difficulty, count } : { subject, difficulty, topic: typedName, grade, count };
      const data = await api.post<GenerateResponse>('/worksheets/generate', body);
      setWorksheet(data);
      // A video worksheet's subject comes from the video, not the pills.
      setSubject(data.subject);
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

  // Browsers print their own header/footer (page title + URL) on every printed page --
  // no page can turn that off outright, that's the print dialog's own "Headers and
  // footers" checkbox, entirely up to whoever is printing. What a page *can* do is
  // control what that header actually says, since it reads the live document.title --
  // blanking it just for the print and restoring it on `afterprint` (fires whether the
  // student/teacher actually printed or cancelled) keeps the tab's real title everywhere
  // else without a blank title ever being visible on screen.
  async function handlePrint() {
    const original = document.title;
    document.title = ' ';
    const restore = () => {
      document.title = original;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);

    // A page can't observe window.print() actually completing (vs. being cancelled in
    // the dialog), so "printed" here just means "clicked print" -- tracked/awarded
    // best-effort, never blocking the print itself if the request is slow or fails.
    try {
      await api.post('/worksheets/print', {});
      await refreshUser();
    } catch {
      // ignore -- points tracking is best-effort
    }
    window.print();
  }

  return (
    <div className="stack">
      <Topbar title={t('worksheets.title')} subtitle={t('worksheets.subtitle')} />

      {error && (
        <div ref={errorRef} className="form-error-banner" role="alert">
          {error}
        </div>
      )}
      {worksheet?.aiUnavailable && !result && <div className="form-error-banner">{t('worksheets.aiFallbackNote')}</div>}

      {!worksheet && (
        <div className="card stack">
          <div className="field">
            <label htmlFor="worksheet-lesson" style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>
              {t('worksheets.lessonLabel')}
            </label>
            <input
              id="worksheet-lesson"
              type="text"
              list="worksheet-lesson-options"
              value={lessonName}
              maxLength={80}
              autoComplete="off"
              onChange={(e) => {
                setLessonName(e.target.value);
                // Picking a video name also switches the subject to that video's subject.
                const name = e.target.value.trim().toLowerCase();
                const match = videos.find((v) => [v.title, v.titleAr].some((n) => n && n.trim().toLowerCase() === name));
                if (match) {
                  setSubject(match.subject);
                  if (match.grade === 5 || match.grade === 6) setGrade(match.grade);
                }
              }}
              placeholder={t('worksheets.lessonPlaceholder')}
            />
            {videos.length > 0 && (
              <datalist id="worksheet-lesson-options">
                {videos.map((v) => (
                  <option key={v.id} value={pickText(lang, v.title, v.titleAr)}>
                    {v.authorName ? t('worksheets.videoBy', { name: v.authorName }) : ''}
                  </option>
                ))}
              </datalist>
            )}
            <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{t('worksheets.lessonHint')}</p>
          </div>

          <div>
            <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>{t('worksheets.subject')}</label>
            <div className="pill-row">
              <button
                className={`category-pill stat-card-blue${subject === 'math' ? ' selected' : ''}`}
                aria-pressed={subject === 'math'}
                onClick={() => setSubject('math')}
              >
                <span className="category-pill-icon"><img src={art('math')} alt="" /></span>
                {t('worksheets.math')}
              </button>
              <button
                className={`category-pill stat-card-green${subject === 'science' ? ' selected' : ''}`}
                aria-pressed={subject === 'science'}
                onClick={() => setSubject('science')}
              >
                <span className="category-pill-icon"><img src={art('science')} alt="" /></span>
                {t('worksheets.science')}
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>{t('worksheets.gradeLabel')}</label>
            <div className="pill-row">
              {([5, 6] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`category-pill${grade === g ? ' selected' : ''}`}
                  aria-pressed={grade === g}
                  disabled={!!selectedVideo}
                  onClick={() => setGrade(g)}
                >
                  {t('worksheets.gradeOption', { n: g })}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>{t('worksheets.countLabel')}</label>
            <div className="pill-row">
              {[5, 10, 15, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`category-pill${count === n ? ' selected' : ''}`}
                  aria-pressed={count === n}
                  onClick={() => setCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontWeight: 700, marginBottom: 8, display: 'block' }}>{t('worksheets.difficulty')}</label>
            <DifficultyDial value={difficulty} options={DIFFICULTIES} onChange={setDifficulty} label={t('worksheets.difficulty')} />
          </div>

          <button
            className="btn btn-primary btn-block"
            onClick={generate}
            disabled={loading || typedName.length < 2}
          >
            {loading
              ? t('worksheets.generatingFromLesson')
              : t('worksheets.generate')}
          </button>
        </div>
      )}

      {worksheet && !result && (
        <div className="stack">
          <div className="flex-between">
            <h2 style={{ fontSize: 18 }}>
              <img src={art(subject)} alt="" width={26} height={26} style={{ verticalAlign: -7, marginInlineEnd: 6, display: 'inline-block' }} />
              {subject === 'math' ? t('worksheets.math') : t('worksheets.science')} —{' '}
              {t(`worksheets.${difficulty}`)}
              {worksheet.topic && (
                <span className="muted" style={{ fontSize: 14, display: 'block', fontWeight: 600 }}>
                  {t('worksheets.videoTopic', { title: worksheet.topic })}
                </span>
              )}
              {worksheet.video && (
                <span className="muted" style={{ fontSize: 14, display: 'block', fontWeight: 600 }}>
                  <RiVideoLine size={14} style={{ verticalAlign: -2, marginInlineEnd: 4, display: 'inline-block' }} />
                  {t('worksheets.videoTopic', { title: pickText(lang, worksheet.video.title, worksheet.video.titleAr) })}
                  {worksheet.video.authorName ? ` — ${t('worksheets.videoBy', { name: worksheet.video.authorName })}` : ''}
                </span>
              )}
            </h2>
            <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
              {/* Printing a worksheet for a class is a teacher task -- students solve it
                  interactively in-app instead, so this stays out of their view. The +10
                  badge mirrors TEACHER_PRINT_POINTS in backend lib/xp.ts -- purely a
                  heads-up before they click, the actual award happens server-side. */}
              {user?.role === 'teacher' && (
                <span className="flex gap-sm" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={handlePrint} style={{ whiteSpace: 'nowrap' }}>
                    {t('worksheets.print')}
                  </button>
                  <span
                    className="badge badge-gold"
                    style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                    title={t('worksheets.printPoints', { points: 10 })}
                  >
                    🏆 {t('worksheets.printPoints', { points: 10 })}
                  </span>
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={reset}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
          <QuizCard questions={questions} onSubmit={submit} submitting={submitting} />
          {user?.role === 'teacher' && (
            <PrintableWorksheet
              subjectLabel={
                (subject === 'math' ? t('worksheets.math') : t('worksheets.science')) +
                (worksheet.video ? ` · ${pickText(lang, worksheet.video.title, worksheet.video.titleAr)}` : '') +
                (worksheet.topic ? ` · ${worksheet.topic} · ${t('worksheets.gradeOption', { n: grade })}` : '')
              }
              subjectIcon={art(subject)}
              difficultyLabel={t(`worksheets.${difficulty}`)}
              difficultyIcon={art(difficulty)}
              questions={questions}
            />
          )}
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
