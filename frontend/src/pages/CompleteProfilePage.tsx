import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { AuthShell } from '../components/AuthShell';
import { TEACHER_SUBJECTS } from '../lib/teacherSubjects';

/**
 * The one step after "Sign up with Google": the account exists but has no name, school or grade yet, so the app shows only this until it is filled.
 *  - a student gives their name, school and grade;
 *  - a teacher gives their ID photo (checked like at an ordinary teacher sign-up), name, school and the subject they teach.
 */
export function CompleteProfilePage() {
  const { user, completeProfile, logout } = useAuth();
  const { t, lang } = useLanguage();
  const teacher = user?.role === 'teacher';
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [schoolName, setSchoolName] = useState('');
  const [grade, setGrade] = useState('');
  const [teacherSubject, setTeacherSubject] = useState('');
  const [idDocument, setIdDocument] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (schoolName.trim().length < 2) {
      setError(t('auth.schoolInvalid'));
      return;
    }
    setSubmitting(true);
    try {
      await completeProfile({
        displayName: displayName.trim(),
        schoolName: schoolName.trim(),
        grade: teacher ? undefined : Number(grade),
        teacherSubject: teacher ? teacherSubject : undefined,
        idDocument: teacher ? idDocument ?? undefined : undefined,
      });
      // the user is updated: the protected layout now lets them into the app
    } catch (err) {
      setError(translateApiError(lang, err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell title={t('auth.completeTitle')} subtitle={t(teacher ? 'auth.completeSubtitleTeacher' : 'auth.completeSubtitleStudent')}>
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="form-error-banner" role="alert">
            {error}
          </div>
        )}

        {teacher && (
          <div className="field">
            <label htmlFor="idDocument">{t('auth.teacherIdLabel')}</label>
            <input id="idDocument" type="file" accept="image/jpeg,image/png" onChange={(e) => setIdDocument(e.target.files?.[0] ?? null)} required title={t('auth.teacherIdHint')} />
            <small className="muted">{t('auth.teacherIdHint')}</small>
          </div>
        )}

        <div className="field">
          <label htmlFor="displayName">{t('auth.name')}</label>
          <input id="displayName" data-rule="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} maxLength={40} autoComplete="name" />
        </div>

        <div className="field">
          <label htmlFor="schoolName">{t('auth.school')}</label>
          <input
            id="schoolName"
            data-rule="name"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
            placeholder={t('auth.schoolPlaceholder')}
            autoComplete="organization"
          />
        </div>

        {teacher ? (
          <div className="field">
            <label htmlFor="teacherSubject">{t('auth.teacherSubject')}</label>
            <select id="teacherSubject" value={teacherSubject} onChange={(e) => setTeacherSubject(e.target.value)} required>
              <option value="" disabled>
                {t('auth.teacherSubjectPlaceholder')}
              </option>
              {TEACHER_SUBJECTS.map((key) => (
                <option key={key} value={key}>
                  {t(`auth.subject_${key}`)}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="field">
            <label htmlFor="grade">{t('auth.grade')}</label>
            {/* a list to pick from (and change at any time before sending), like the grade pickers on the profile and in the admin panel */}
            <select id="grade" value={grade} onChange={(e) => setGrade(e.target.value)} required title={t('auth.gradeHint')}>
              <option value="" disabled>
                {t('teacherReels.gradePlaceholder')}
              </option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => (
                <option key={g} value={g}>
                  {t('teacherReels.gradeOption', { number: String(g) })}
                </option>
              ))}
            </select>
          </div>
        )}

        <button className="btn btn-primary btn-block" type="submit" disabled={submitting}>
          {submitting ? t(teacher ? 'auth.completeCheckingId' : 'auth.completing') : t('auth.completeButton')}
        </button>
      </form>
      <p className="text-center muted" style={{ marginTop: 18 }}>
        <a
          href="/login"
          onClick={(e) => {
            e.preventDefault();
            void logout();
          }}
        >
          {t('auth.completeLogout')}
        </a>
      </p>
    </AuthShell>
  );
}
