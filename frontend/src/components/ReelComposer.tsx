import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError, pickText } from '../lib/i18n';
import { MAX_VIDEO_BYTES, uploadLessonVideo } from '../lib/videoUpload';

type SubjectOption = { id: number; key: string; name: string; nameAr?: string | null; icon: string };

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

/**
 * The lesson form: subject, grade, title, script, the video, and the quiz questions. Used by a teacher (their own lessons: TeacherReelsPage) and by an
 * admin (add a video, edit any teacher's lesson: AdminVideosPanel) -- both go through the same /teacher-reels endpoints, which accept either role.
 * `editId` is the lesson being edited (null: a new one); `onSaved` is called once the lesson (and its video) is saved; `onCancel` adds a Cancel button.
 */
export function ReelComposer({ editId, onSaved, onCancel, bare = false }: { editId: number | null; onSaved: () => void; onCancel?: () => void; bare?: boolean }) {
  const { t, lang } = useLanguage();
  const [subjects, setSubjects] = useState<SubjectOption[] | null>(null);
  const [grades, setGrades] = useState<number[]>([]);
  // The lesson this form is saving to: the one being edited, or the new one once it has been created (so a retry after a failed video upload updates it).
  const [currentId, setCurrentId] = useState<number | null>(editId);
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
  // how the video's upload is going while saving: a percentage while it is being sent, 'checking' once it is up
  const [uploadState, setUploadState] = useState<number | 'checking' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // The Create / Auto-generate buttons are far below this banner -- bring a new error into view.
  const formErrorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (formError) formErrorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [formError]);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);

  const [optionsError, setOptionsError] = useState<string | null>(null);
  // A lesson is written once, in Arabic or English. Lessons made earlier with a separate Arabic title / script keep those two fields while edited, so nothing is lost.
  const [hasArabicExtra, setHasArabicExtra] = useState(false);

  useEffect(() => {
    api
      .get<{ subjects: SubjectOption[]; grades: number[] }>('/teacher-reels/options')
      .then((data) => {
        setSubjects(data.subjects);
        setGrades(data.grades);
      })
      .catch(() => setOptionsError(t('teacherReels.loadError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setCurrentId(null);
    setSubjectId('');
    setGrade('');
    setTitle('');
    setTitleAr('');
    setScriptText('');
    setScriptTextAr('');
    setQuestions([]);
    setVideoFile(null);
    setExistingVideoUrl(null);
    setHasArabicExtra(false);
    setFormError(null);
  }

  // Opening a lesson for editing (or switching to another) loads it into the form; no lesson clears the form.
  useEffect(() => {
    if (editId === null) {
      resetForm();
      return;
    }
    let cancelled = false;
    setFormError(null);
    api
      .get<{
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
      }>(`/teacher-reels/${editId}`)
      .then((detail) => {
        if (cancelled) return;
        setCurrentId(editId);
        setSubjectId(String(detail.subjectId));
        setGrade(String(detail.grade));
        setTitle(detail.title);
        setTitleAr(detail.titleAr || '');
        setScriptText(detail.scriptText);
        setScriptTextAr(detail.scriptTextAr || '');
        setHasArabicExtra(!!(detail.titleAr || detail.scriptTextAr));
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
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
        setFormError(translateApiError(lang, message));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

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
        title,
        titleAr,
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

  // A new lesson can only be created once the teacher has given it a topic name, the lesson text, at least one complete question (the question and all four choices) and the video.
  const hasCompleteQuestion = questions.some((q) => q.questionText.trim() && q.choices.every((c) => c.trim()));
  const readyToCreate = title.trim().length >= 2 && scriptText.trim().length > 0 && hasCompleteQuestion && (!!videoFile || !!existingVideoUrl);
  const blockCreate = !currentId && !readyToCreate;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (blockCreate) return;
    if (videoFile && videoFile.size > MAX_VIDEO_BYTES) {
      setFormError(t('teacherReels.videoTooLarge'));
      return;
    }
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

      let reelId = currentId;
      if (reelId) {
        await api.patch(`/teacher-reels/${reelId}`, payload);
      } else {
        // Switch to edit mode right away: if the video upload below fails, pressing the button
        // again must update this lesson, not create a duplicate.
        reelId = (await api.post<{ id: number }>('/teacher-reels', payload)).id;
        setCurrentId(reelId);
      }

      if (videoFile) {
        setUploadState(0);
        await uploadLessonVideo(reelId, videoFile, (f) => setUploadState(Math.round(f * 100)), () => setUploadState('checking'));
      }

      resetForm();
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setFormError(translateApiError(lang, message));
    } finally {
      setSubmitting(false);
      setUploadState(null);
    }
  }

  const Wrapper = bare ? 'div' : 'div';
  return (
    <Wrapper className={bare ? undefined : 'card'}>
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>
        {currentId ? t('teacherReels.editTitle') : t('teacherReels.composerTitle')}
      </h3>
      {optionsError && <div className="form-error-banner">{optionsError}</div>}
        <form onSubmit={handleSubmit}>
          {formError && (
            <div ref={formErrorRef} className="form-error-banner" role="alert">
              {formError}
            </div>
          )}

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
            <input id="reelTitle" className="lesson-text-field" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder={t('teacherReels.anyLanguageHint')} />
          </div>
          {hasArabicExtra && (
            <div className="field">
              <label htmlFor="reelTitleAr">{t('teacherReels.titleArLabel')}</label>
              <input id="reelTitleAr" dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} maxLength={120} />
            </div>
          )}
          <div className="field">
            <label htmlFor="reelScript">{t('teacherReels.scriptLabel')}</label>
            <textarea
              id="reelScript"
              className="lesson-text-field"
              dir="auto"
              placeholder={t('teacherReels.anyLanguageHint')}
              value={scriptText}
              onChange={(e) => setScriptText(e.target.value)}
              required
              maxLength={2000}
              rows={4}
            />
          </div>
          {hasArabicExtra && (
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
          )}

          <div className="field">
            <label htmlFor="reelVideo">{t('teacherReels.videoLabel')}</label>
            <input
              id="reelVideo"
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                if (file && file.size > MAX_VIDEO_BYTES) {
                  // too big: say so now, and drop the choice so it can't be sent
                  setFormError(t('teacherReels.videoTooLarge'));
                  e.target.value = '';
                  setVideoFile(null);
                  return;
                }
                setFormError(null);
                setVideoFile(file);
              }}
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
              disabled={generatingQuestions || questions.length >= 10 || title.trim().length < 2 || !subjectId || !grade}
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
                <div className="field" key={ci} style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <input
                    type="radio"
                    name={`correct-${qi}`}
                    checked={q.correctIndex === ci}
                    onChange={() => updateQuestion(qi, { correctIndex: ci })}
                    title={t('teacherReels.correctAnswerHint')}
                    aria-label={t('teacherReels.markCorrect', { number: String(ci + 1) })}
                    style={{ flex: '0 0 auto', width: 'auto' }}
                  />
                  <input
                    style={{ flex: '1 1 180px', minWidth: 0 }}
                    aria-label={t('teacherReels.choicePlaceholder', { number: String(ci + 1) })}
                    placeholder={t('teacherReels.choicePlaceholder', { number: String(ci + 1) })}
                    value={q.choices[ci]}
                    onChange={(e) => updateChoice(qi, ci, e.target.value, false)}
                    required
                    maxLength={120}
                  />
                  <input
                    style={{ flex: '1 1 180px', minWidth: 0 }}
                    dir="rtl"
                    aria-label={t('teacherReels.choiceArPlaceholder', { number: String(ci + 1) })}
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
            <button className="btn btn-primary" type="submit" disabled={submitting || blockCreate}>
              {submitting
                ? uploadState === 'checking'
                  ? t('teacherReels.checkingVideo')
                  : typeof uploadState === 'number'
                    ? t('teacherReels.uploadingVideo', { pct: String(uploadState) })
                    : t('teacherReels.saving')
                : currentId
                  ? t('teacherReels.saveChanges')
                  : t('teacherReels.createButton')}
            </button>
            {onCancel && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  resetForm();
                  onCancel();
                }}
              >
                {t('teacherReels.cancelEdit')}
              </button>
            )}
          </div>
          {blockCreate && <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{t('teacherReels.createNeeds')}</p>}
        </form>
    </Wrapper>
  );
}
