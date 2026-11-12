import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RiVideoLine } from '@remixicon/react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { textProblem } from '../lib/textRules';
import { pickText, translateApiError } from '../lib/i18n';
import { choiceLabel } from '../lib/bidi';
import { QText } from '../components/QText';
import { QuizCard, type QuizAnswer, type QuizQuestion } from '../components/QuizCard';
import { QuizResults, type ResultItem } from '../components/QuizResults';
import { Topbar } from '../components/Topbar';
import { DifficultyDial, type DialOption } from '../components/DifficultyDial';
import { PrintableWorksheet } from '../components/PrintableWorksheet';

type Subject = 'math' | 'science';

// The other subjects lessons can be about. Worksheets are only made for Math and Science for now, so these are shown but locked ("not available yet" when pointed at).
const LOCKED_SUBJECTS = ['islamic', 'arabic', 'english', 'ict', 'social', 'art'] as const;
type Difficulty = 'easy' | 'medium' | 'hard';

// The artwork for the subjects and three difficulty levels (public/images/worksheets/<name>.webp).
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
  // Set when a student opened a worksheet a teacher sent (POST /worksheets/received/:id/start): who sent it.
  sentWorksheetId?: number;
  teacherName?: string;
};

// A worksheet a teacher sent to every student, as both lists show it: the teacher's own (GET /worksheets/sent, with how many students solved
// it) and a student's "From your teachers" (GET /worksheets/received, with where this student is on it).
type SentWorksheet = {
  id: number;
  subject: string;
  difficulty: Difficulty;
  total: number;
  topic: string | null;
  video: { id: number; title: string; titleAr: string | null } | null;
  createdAt: string;
};
type TeacherSentWorksheet = SentWorksheet & { solvedCount: number };
type ReceivedWorksheet = SentWorksheet & { teacherName: string; status: 'new' | 'started' | 'solved'; score: number | null };

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
  xpLost: number;
};

/** A teacher's look at a worksheet before printing or sending it: the questions and their choices, with nothing to answer. */
function WorksheetPreview({ questions }: { questions: QuizQuestion[] }) {
  const { lang } = useLanguage();
  return (
    <ol className="ws-preview">
      {questions.map((q, qi) => (
        <li key={q.id} className="card">
          <p className="ws-preview-question quiz-q">
            {qi + 1}. <QText text={q.text} />
          </p>
          <ul className="ws-preview-choices">
            {q.choices.map((choice, ci) => (
              <li key={ci}>
                <span aria-hidden className="ws-choice-label">{choiceLabel(ci, lang)}</span>
                <span className="quiz-choice-text">
<QText text={choice} />
</span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export function WorksheetsPage() {
  const { user, refreshUser } = useAuth();
  const { t, lang } = useLanguage();
  // A teacher builds a worksheet to look over, print and send to every student -- not to solve it (the server takes answers from students only).
  const isTeacher = user?.role === 'teacher';
  const [subject, setSubject] = useState<Subject>('math');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [worksheet, setWorksheet] = useState<GenerateResponse | null>(null);
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Teacher: whether the worksheet on screen has been sent (alreadySent: it had been sent before), and the ones sent so far.
  const [sent, setSent] = useState<{ alreadySent: boolean } | null>(null);
  const [sending, setSending] = useState(false);
  const [sentList, setSentList] = useState<TeacherSentWorksheet[] | null>(null);
  // Student: the worksheets teachers sent, and the one being opened.
  const [received, setReceived] = useState<ReceivedWorksheet[] | null>(null);
  const [opening, setOpening] = useState<number | null>(null);
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
    loadSentWorksheets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The teacher's sent worksheets, or the student's "From your teachers".
  function loadSentWorksheets() {
    if (isTeacher) {
      api
        .get<{ worksheets: TeacherSentWorksheet[] }>('/worksheets/sent')
        .then((d) => setSentList(d.worksheets))
        .catch(() => setSentList([]));
    } else {
      api
        .get<{ worksheets: ReceivedWorksheet[] }>('/worksheets/received')
        .then((d) => setReceived(d.worksheets))
        .catch(() => setReceived([]));
    }
  }

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

  // A video worksheet can be about any subject the video is in.
  const subjectName = (key: string) => t(key === 'math' || key === 'science' ? `worksheets.${key}` : `worksheets.subject_${key}`);
  const dateOf = (sqlite: string) => new Date(sqlite.replace(' ', 'T') + 'Z').toLocaleDateString(lang === 'ar' ? 'ar-QA' : 'en-US');

  const questions: QuizQuestion[] =
    worksheet?.questions.map((q) => ({
      id: q.id,
      text: pickText(lang, q.text, q.textAr),
      choices: lang === 'ar' && q.choicesAr ? q.choicesAr : q.choices,
    })) ?? [];

  async function generate() {
    const topicProblem = selectedVideo ? null : textProblem(typedName, 'words');
    if (topicProblem) {
      setError(t(topicProblem));
      return;
    }
    setError(null);
    setLoading(true);
    setResult(null);
    setSent(null);
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

  // A student opens a worksheet a teacher sent: their own attempt at it, solved like any other.
  async function openReceived(sentId: number) {
    setError(null);
    setOpening(sentId);
    try {
      const data = await api.post<GenerateResponse>(`/worksheets/received/${sentId}/start`);
      setResult(null);
      setWorksheet(data);
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('common.genericError'));
      loadSentWorksheets(); // e.g. already solved in another tab: show it as solved
    } finally {
      setOpening(null);
    }
  }

  async function send() {
    if (!worksheet) return;
    setError(null);
    setSending(true);
    try {
      const data = await api.post<{ alreadySent: boolean }>(`/worksheets/${worksheet.worksheetId}/send`);
      setSent({ alreadySent: data.alreadySent });
      loadSentWorksheets();
    } catch (err) {
      setError(err instanceof ApiError ? translateApiError(lang, err.message) : t('common.genericError'));
    } finally {
      setSending(false);
    }
  }

  async function submit(answers: QuizAnswer[]) {
    if (!worksheet) return;
    setSubmitting(true);
    try {
      const data = await api.post<SubmitResponse>(`/worksheets/${worksheet.worksheetId}/submit`, { answers });
      setResult(data);
      if (worksheet.sentWorksheetId) loadSentWorksheets();
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
    setSent(null);
  }

  // Browsers print their own header/footer (page title + URL) on every printed page --
  // no page can turn that off outright, that's the print dialog's own "Headers and
  // footers" checkbox, entirely up to whoever is printing. What a page *can* do is
  // control what that header actually says, since it reads the live document.title --
  // blanking it just for the print and restoring it on `afterprint` (fires whether the
  // teacher actually printed or cancelled) keeps the tab's real title everywhere
  // else without a blank title ever being visible on screen.
  function handlePrint() {
    const original = document.title;
    document.title = ' ';
    const restore = () => {
      document.title = original;
      window.removeEventListener('afterprint', restore);
    };
    window.addEventListener('afterprint', restore);
    window.print();
  }

  // One row of either sent list: the subject's picture, what the sheet is about, its details, and `end` (its status or what to do with it).
  const sheetRow = (w: SentWorksheet, from: string | null, end: ReactNode) => {
    const about = w.video ? pickText(lang, w.video.title, w.video.titleAr) : w.topic;
    return (
      <li key={w.id} className="list-row" style={{ flexWrap: 'wrap' }}>
        <span className="list-row-icon">
          <img src={art(w.subject)} alt="" width={28} height={28} />
        </span>
        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
          <strong>
            {subjectName(w.subject)}
            {about && (
              <>
                {' · '}
                <bdi>{about}</bdi>
              </>
            )}
          </strong>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
            {[from, t(`worksheets.${w.difficulty}`), `${t('worksheets.countLabel')}: ${w.total}`, dateOf(w.createdAt)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex gap-sm" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {end}
        </div>
      </li>
    );
  };

  return (
    <div className="stack">
      <Topbar title={t('worksheets.title')} subtitle={t(isTeacher ? 'worksheets.subtitleTeacher' : 'worksheets.subtitle')} />

      {error && (
        <div ref={errorRef} className="form-error-banner" role="alert">
          {error}
        </div>
      )}
      {worksheet?.aiUnavailable && !result && <div className="form-error-banner">{t('worksheets.aiFallbackNote')}</div>}
      {sent && (
        <div className="form-success-banner" role="status">
          {t(sent.alreadySent ? 'worksheets.alreadySent' : 'worksheets.sentDone')}
        </div>
      )}

      {!isTeacher && !worksheet && received && received.length > 0 && (
        <div className="card stack">
          <h3 style={{ fontSize: 16, margin: 0 }}>{t('worksheets.receivedTitle')}</h3>
          <ul className="stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
            {received.map((w) =>
              sheetRow(
                w,
                t('worksheets.fromTeacher', { name: w.teacherName }),
                w.status === 'solved' ? (
                  <span className="badge badge-success">{t('worksheets.statusSolved', { score: w.score ?? 0, total: w.total })}</span>
                ) : (
                  <>
                    <span className={`badge ${w.status === 'new' ? 'badge-gold' : 'badge-maroon'}`}>
                      {t(w.status === 'new' ? 'worksheets.statusNew' : 'worksheets.statusStarted')}
                    </span>
                    <button type="button" className="btn btn-primary btn-sm" disabled={opening !== null} onClick={() => openReceived(w.id)}>
                      {t(w.status === 'new' ? 'worksheets.start' : 'worksheets.continue')}
                    </button>
                  </>
                )
              )
            )}
          </ul>
        </div>
      )}

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
              {LOCKED_SUBJECTS.map((key) => (
                <span key={key} className="pill-locked" data-tip={t('worksheets.notAvailable')}>
                  <button type="button" className="category-pill" disabled aria-disabled="true" tabIndex={-1} aria-label={`${t(`worksheets.subject_${key}`)} — ${t('worksheets.notAvailable')}`}>
                    <span className="category-pill-icon"><img src={art(key)} alt="" /></span>
                    {t(`worksheets.subject_${key}`)}
                  </button>
                </span>
              ))}
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
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ fontSize: 18 }}>
              <img src={art(worksheet.subject)} alt="" width={26} height={26} style={{ verticalAlign: -7, marginInlineEnd: 6, display: 'inline-block' }} />
              {subjectName(worksheet.subject)} —{' '}
              {t(`worksheets.${worksheet.difficulty}`)}
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
              {worksheet.teacherName && (
                <span className="muted" style={{ fontSize: 14, display: 'block', fontWeight: 600 }}>
                  {t('worksheets.fromTeacher', { name: worksheet.teacherName })}
                </span>
              )}
            </h2>
            <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
              {/* Printing a worksheet for a class and sending it to the students are the teacher's side of a worksheet -- students solve it
                  in the app instead, so these stay out of their view. */}
              {isTeacher && (
                <>
                  <button className="btn btn-secondary btn-sm" onClick={handlePrint} style={{ whiteSpace: 'nowrap' }}>
                    {t('worksheets.print')}
                  </button>
                  {!sent && (
                    <button className="btn btn-primary btn-sm" onClick={send} disabled={sending} style={{ whiteSpace: 'nowrap' }}>
                      {sending ? t('worksheets.sending') : t('worksheets.sendAll')}
                    </button>
                  )}
                </>
              )}
              <button className="btn btn-ghost btn-sm" onClick={reset}>
                {sent ? t('worksheets.generateAnother') : t('common.cancel')}
              </button>
            </div>
          </div>
          {isTeacher ? (
            <>
              <p className="muted" style={{ margin: 0 }}>{t('worksheets.previewNote')}</p>
              <WorksheetPreview questions={questions} />
              <PrintableWorksheet
                subjectLabel={
                  subjectName(worksheet.subject) +
                  (worksheet.video ? ` · ${pickText(lang, worksheet.video.title, worksheet.video.titleAr)}` : '') +
                  (worksheet.topic ? ` · ${worksheet.topic} · ${t('worksheets.gradeOption', { n: grade })}` : '')
                }
                subjectIcon={art(worksheet.subject)}
                difficultyLabel={t(`worksheets.${worksheet.difficulty}`)}
                difficultyIcon={art(worksheet.difficulty)}
                questions={questions}
              />
            </>
          ) : (
            <QuizCard questions={questions} onSubmit={submit} submitting={submitting} />
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
            {result.xpLost > 0 && <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>{t('common.xpLost', { xp: result.xpLost })}</p>}
          </div>
          <QuizResults questions={questions} results={result.results} />
          <button className="btn btn-primary btn-block" onClick={reset}>
            {t(worksheet.sentWorksheetId ? 'worksheets.backToWorksheets' : 'worksheets.generateAnother')}
          </button>
        </div>
      )}

      {isTeacher && sentList && (
        <div className="card stack">
          <h3 style={{ fontSize: 16, margin: 0 }}>{t('worksheets.sentTitle')}</h3>
          {sentList.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>{t('worksheets.sentEmpty')}</p>
          ) : (
            <ul className="stack" style={{ gap: 10, listStyle: 'none', margin: 0, padding: 0 }}>
              {sentList.map((w) => sheetRow(w, null, <span className="badge badge-success">{t('worksheets.solvedBy', { n: w.solvedCount })}</span>))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
