import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError, pickText } from '../lib/i18n';
import { formatWatchTime } from '../lib/format';
import { Topbar } from '../components/Topbar';

type WatchStats = {
  id: number;
  title: string;
  titleAr: string | null;
  grade: number;
  watchers: number;
  totalWatchedSeconds: number;
  avgWatchedSeconds: number;
};

function TeacherWatchReport() {
  const { t, lang } = useLanguage();
  const [stats, setStats] = useState<WatchStats[] | null>(null);

  useEffect(() => {
    api
      .get<{ reels: WatchStats[] }>('/teacher-reels/reports/watch-time')
      .then((data) => setStats(data.reels))
      .catch(() => setStats([]));
  }, []);

  if (!stats) return null;

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('teacherReels.watchReportTitle')}</h3>
      {stats.length === 0 && <p className="muted">{t('teacherReels.watchReportEmpty')}</p>}
      <div className="stack" style={{ gap: 10 }}>
        {stats.map((r) => (
          <div key={r.id} className="card">
            <strong>{pickText(lang, r.title, r.titleAr)}</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
              {t('teacherReels.watchReportWatchers', { n: String(r.watchers) })}
              {' · '}
              {t('teacherReels.watchReportTotal', { time: formatWatchTime(r.totalWatchedSeconds) })}
              {' · '}
              {t('teacherReels.watchReportAvg', { time: formatWatchTime(r.avgWatchedSeconds) })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

type SubjectOption = { id: number; key: string; name: string; nameAr?: string | null; icon: string };

type ReelSummary = {
  id: number;
  title: string;
  titleAr?: string | null;
  videoUrl: string | null;
  grade: number;
  subjectName: string;
  subjectNameAr?: string | null;
  questionCount: number;
};

type QuestionForm = {
  questionText: string;
  questionTextAr: string;
  choices: [string, string, string, string];
  choicesAr: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  explanationAr: string;
};

function emptyQuestion(): QuestionForm {
  return {
    questionText: '',
    questionTextAr: '',
    choices: ['', '', '', ''],
    choicesAr: ['', '', '', ''],
    correctIndex: 0,
    explanation: '',
    explanationAr: '',
  };
}

export function TeacherReelsPage() {
  const { t, lang } = useLanguage();
  const [subjects, setSubjects] = useState<SubjectOption[] | null>(null);
  const [grades, setGrades] = useState<number[]>([]);
  const [reels, setReels] = useState<ReelSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [grade, setGrade] = useState('');
  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [scriptTextAr, setScriptTextAr] = useState('');
  const [questions, setQuestions] = useState<QuestionForm[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [existingVideoUrl, setExistingVideoUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);

  function loadOptions() {
    api
      .get<{ subjects: SubjectOption[]; grades: number[] }>('/teacher-reels/options')
      .then((data) => {
        setSubjects(data.subjects);
        setGrades(data.grades);
      })
      .catch(() => setLoadError(t('teacherReels.loadError')));
  }

  function loadReels() {
    api
      .get<{ reels: ReelSummary[] }>('/teacher-reels')
      .then((data) => setReels(data.reels))
      .catch(() => setLoadError(t('teacherReels.loadError')));
  }

  useEffect(() => {
    loadOptions();
    loadReels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setEditingId(null);
    setSubjectId('');
    setGrade('');
    setTitle('');
    setTitleAr('');
    setScriptText('');
    setScriptTextAr('');
    setQuestions([]);
    setVideoFile(null);
    setExistingVideoUrl(null);
    setFormError(null);
  }

  async function handleEdit(id: number) {
    setFormError(null);
    try {
      const detail = await api.get<{
        subjectId: number;
        grade: number;
        title: string;
        titleAr: string;
        scriptText: string;
        scriptTextAr: string;
        videoUrl: string | null;
        questions: {
          questionText: string;
          questionTextAr: string;
          choices: string[];
          choicesAr: string[];
          correctIndex: number;
          explanation: string;
          explanationAr: string;
        }[];
      }>(`/teacher-reels/${id}`);
      setEditingId(id);
      setSubjectId(String(detail.subjectId));
      setGrade(String(detail.grade));
      setTitle(detail.title);
      setTitleAr(detail.titleAr || '');
      setScriptText(detail.scriptText);
      setScriptTextAr(detail.scriptTextAr || '');
      setQuestions(
        detail.questions.map((q) => ({
          questionText: q.questionText,
          questionTextAr: q.questionTextAr || '',
          choices: [q.choices[0], q.choices[1], q.choices[2], q.choices[3]],
          choicesAr: [q.choicesAr?.[0] || '', q.choicesAr?.[1] || '', q.choicesAr?.[2] || '', q.choicesAr?.[3] || ''],
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          explanationAr: q.explanationAr || '',
        }))
      );
      setVideoFile(null);
      setExistingVideoUrl(detail.videoUrl);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setFormError(translateApiError(lang, message));
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.delete(`/teacher-reels/${id}`);
      setReels((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
      if (editingId === id) resetForm();
    } catch {
      loadReels();
    }
  }

  function updateQuestion(index: number, patch: Partial<QuestionForm>) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function updateChoice(qIndex: number, cIndex: number, value: string, ar: boolean) {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== qIndex) return q;
        const key = ar ? 'choicesAr' : 'choices';
        const next = [...q[key]] as [string, string, string, string];
        next[cIndex] = value;
        return { ...q, [key]: next };
      })
    );
  }

  function addQuestion() {
    if (questions.length >= 10) return;
    setQuestions((prev) => [...prev, emptyQuestion()]);
  }

  async function handleGenerateQuestions() {
    setFormError(null);
    setGeneratingQuestions(true);
    try {
      const data = await api.post<{
        questions: {
          questionText: string;
          questionTextAr: string;
          choices: string[];
          choicesAr: string[];
          correctIndex: number;
          explanation: string;
          explanationAr: string;
        }[];
      }>('/teacher-reels/generate-questions', {
        scriptText,
        scriptTextAr,
        subjectId: Number(subjectId),
        grade: Number(grade),
        count: Math.min(4, 10 - questions.length),
      });
      setQuestions((prev) => [
        ...prev,
        ...data.questions.map((q) => ({
          questionText: q.questionText,
          questionTextAr: q.questionTextAr || '',
          choices: [q.choices[0], q.choices[1], q.choices[2], q.choices[3]] as [string, string, string, string],
          choicesAr: [q.choicesAr?.[0] || '', q.choicesAr?.[1] || '', q.choicesAr?.[2] || '', q.choicesAr?.[3] || ''] as [
            string,
            string,
            string,
            string,
          ],
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          explanationAr: q.explanationAr || '',
        })),
      ]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setFormError(translateApiError(lang, message));
    } finally {
      setGeneratingQuestions(false);
    }
  }

  function removeQuestion(index: number) {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const payload = {
        subjectId: Number(subjectId),
        grade: Number(grade),
        title,
        titleAr,
        scriptText,
        scriptTextAr,
        questions: questions.map((q) => ({
          questionText: q.questionText,
          questionTextAr: q.questionTextAr,
          choices: q.choices,
          choicesAr: q.choicesAr,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          explanationAr: q.explanationAr,
        })),
      };

      const reelId = editingId ?? (await api.post<{ id: number }>('/teacher-reels', payload)).id;
      if (editingId) await api.patch(`/teacher-reels/${editingId}`, payload);

      if (videoFile) {
        const formData = new FormData();
        formData.append('video', videoFile);
        await api.postForm(`/teacher-reels/${reelId}/video`, formData);
      }

      resetForm();
      loadReels();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setFormError(translateApiError(lang, message));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack">
      <Topbar title={t('teacherReels.pageTitle')} subtitle={t('teacherReels.pageSubtitle')} />

      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>
          {editingId ? t('teacherReels.editTitle') : t('teacherReels.composerTitle')}
        </h3>
        <form onSubmit={handleSubmit}>
          {formError && <div className="form-error-banner">{formError}</div>}

          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="reelSubject">{t('teacherReels.subjectLabel')}</label>
              <select id="reelSubject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
                <option value="">{t('teacherReels.subjectPlaceholder')}</option>
                {subjects?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {pickText(lang, s.name, s.nameAr)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label htmlFor="reelGrade">{t('teacherReels.gradeLabel')}</label>
              <select id="reelGrade" value={grade} onChange={(e) => setGrade(e.target.value)} required>
                <option value="">{t('teacherReels.gradePlaceholder')}</option>
                {grades.map((g) => (
                  <option key={g} value={g}>
                    {t('teacherReels.gradeOption', { number: String(g) })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="reelTitle">{t('teacherReels.titleLabel')}</label>
            <input id="reelTitle" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="reelTitleAr">{t('teacherReels.titleArLabel')}</label>
            <input id="reelTitleAr" dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} maxLength={120} />
          </div>
          <div className="field">
            <label htmlFor="reelScript">{t('teacherReels.scriptLabel')}</label>
            <textarea
              id="reelScript"
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              required
              maxLength={2000}
              rows={4}
            />
          </div>
          <div className="field">
            <label htmlFor="reelScriptAr">{t('teacherReels.scriptArLabel')}</label>
            <textarea
              id="reelScriptAr"
              dir="rtl"
              value={scriptTextAr}
              onChange={(e) => setScriptTextAr(e.target.value)}
              maxLength={2000}
              rows={4}
            />
          </div>

          <div className="field">
            <label htmlFor="reelVideo">{t('teacherReels.videoLabel')}</label>
            <input
              id="reelVideo"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
            />
            <small className="muted">{t('teacherReels.videoHint')}</small>
            {existingVideoUrl && !videoFile && (
              <p className="muted" style={{ marginTop: 6 }}>
                {t('teacherReels.currentVideo')}
              </p>
            )}
          </div>

          <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
            <div>
              <h4 style={{ fontSize: 14, marginBottom: 4 }}>{t('teacherReels.questionsTitle')}</h4>
              <p className="muted" style={{ fontSize: 13, margin: 0 }}>{t('teacherReels.questionsOptionalHint')}</p>
            </div>
            <button
              type="button"
              className="btn btn-gold btn-sm"
              disabled={generatingQuestions || questions.length >= 10 || scriptText.trim().length < 10 || !subjectId || !grade}
              title={t('teacherReels.generateQuestionsHint')}
              onClick={handleGenerateQuestions}
            >
              {generatingQuestions ? t('teacherReels.generatingQuestions') : t('teacherReels.generateQuestionsButton')}
            </button>
          </div>
          {questions.map((q, qi) => (
            <div className="card" key={qi} style={{ marginBottom: 12, background: 'var(--surface-2, rgba(0,0,0,0.03))' }}>
              <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 13 }}>
                  {t('teacherReels.questionNumber', { number: String(qi + 1) })}
                </strong>
                <button type="button" className="btn btn-secondary" onClick={() => removeQuestion(qi)}>
                  {t('teacherReels.removeQuestion')}
                </button>
              </div>
              <div className="field">
                <label>{t('teacherReels.questionTextLabel')}</label>
                <input
                  value={q.questionText}
                  onChange={(e) => updateQuestion(qi, { questionText: e.target.value })}
                  required
                  maxLength={300}
                />
              </div>
              <div className="field">
                <label>{t('teacherReels.questionTextArLabel')}</label>
                <input
                  dir="rtl"
                  value={q.questionTextAr}
                  onChange={(e) => updateQuestion(qi, { questionTextAr: e.target.value })}
                  maxLength={300}
                />
              </div>
              {[0, 1, 2, 3].map((ci) => (
                <div className="field" key={ci} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="radio"
                    name={`correct-${qi}`}
                    checked={q.correctIndex === ci}
                    onChange={() => updateQuestion(qi, { correctIndex: ci })}
                    title={t('teacherReels.correctAnswerHint')}
                  />
                  <input
                    style={{ flex: 1 }}
                    placeholder={t('teacherReels.choicePlaceholder', { number: String(ci + 1) })}
                    value={q.choices[ci]}
                    onChange={(e) => updateChoice(qi, ci, e.target.value, false)}
                    required
                    maxLength={120}
                  />
                  <input
                    style={{ flex: 1 }}
                    dir="rtl"
                    placeholder={t('teacherReels.choiceArPlaceholder', { number: String(ci + 1) })}
                    value={q.choicesAr[ci]}
                    onChange={(e) => updateChoice(qi, ci, e.target.value, true)}
                    maxLength={120}
                  />
                </div>
              ))}
              <div className="field">
                <label>{t('teacherReels.explanationLabel')}</label>
                <input
                  value={q.explanation}
                  onChange={(e) => updateQuestion(qi, { explanation: e.target.value })}
                  required
                  maxLength={500}
                />
              </div>
              <div className="field">
                <label>{t('teacherReels.explanationArLabel')}</label>
                <input
                  dir="rtl"
                  value={q.explanationAr}
                  onChange={(e) => updateQuestion(qi, { explanationAr: e.target.value })}
                  maxLength={500}
                />
              </div>
            </div>
          ))}
          {questions.length < 10 && (
            <button type="button" className="btn btn-secondary" onClick={addQuestion} style={{ marginBottom: 16 }}>
              {t('teacherReels.addQuestion')}
            </button>
          )}

          <div className="flex gap-sm">
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              {submitting ? t('teacherReels.saving') : editingId ? t('teacherReels.saveChanges') : t('teacherReels.createButton')}
            </button>
            {editingId && (
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                {t('teacherReels.cancelEdit')}
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('teacherReels.myReelsTitle')}</h3>
        {loadError && <div className="form-error-banner">{loadError}</div>}
        {!reels && !loadError && (
          <div className="empty-state">
            <div className="spinner" />
          </div>
        )}
        {reels && reels.length === 0 && !loadError && <p className="muted">{t('teacherReels.noReels')}</p>}
        <div className="stack" style={{ gap: 10 }}>
          {reels?.map((reel) => (
            <div key={reel.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{pickText(lang, reel.title, reel.titleAr)}</strong>
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                  {t('teacherReels.reelMeta', {
                    grade: String(reel.grade),
                    subject: pickText(lang, reel.subjectName, reel.subjectNameAr),
                    questions: String(reel.questionCount),
                  })}
                </p>
              </div>
              <div className="flex gap-sm">
                <button type="button" className="btn btn-secondary" onClick={() => handleEdit(reel.id)}>
                  {t('teacherReels.editButton')}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => handleDelete(reel.id)}>
                  {t('teacherReels.deleteButton')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <TeacherWatchReport />
    </div>
  );
}
