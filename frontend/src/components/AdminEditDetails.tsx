import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { translateApiError } from '../lib/i18n';
import { useLanguage } from '../lib/language-context';
import type { AdminUser } from './AdminUserRow';

const SUBJECTS = ['math', 'science', 'islamic', 'english', 'arabic', 'ict', 'social', 'art'] as const;
const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

/** Correct an account's class (students), school (students and teachers) and subject (teachers). The name and the email are shown but cannot be changed. */
export function AdminEditDetails({ user: u, onUpdated }: { user: AdminUser; onUpdated: (user: AdminUser) => void }) {
  const { t, lang } = useLanguage();
  const [grade, setGrade] = useState(u.grade ? String(u.grade) : '');
  const [school, setSchool] = useState(u.schoolName ?? '');
  const [subject, setSubject] = useState(u.teacherSubject ?? '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (u.role === 'admin') return null;

  const changes: { grade?: number; schoolName?: string; teacherSubject?: string } = {};
  if (u.role === 'student' && grade && Number(grade) !== u.grade) changes.grade = Number(grade);
  if (school.trim() !== (u.schoolName ?? '') && school.trim().length > 0) changes.schoolName = school.trim();
  if (u.role === 'teacher' && subject && subject !== u.teacherSubject) changes.teacherSubject = subject;
  const dirty = Object.keys(changes).length > 0;

  async function save() {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const data = await api.patch<{ user: AdminUser }>(`/admin/users/${u.id}/profile`, changes);
      onUpdated(data.user);
      setDone(true);
    } catch (err) {
      setError(translateApiError(lang, err instanceof ApiError ? err.message : 'Something went wrong on our side. Please try again in a moment.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field" style={{ margin: 0 }}>
      <label style={{ fontSize: 13, fontWeight: 600 }}>{t('admin.editDetailsTitle')}</label>
      <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 8px' }}>
        {t('admin.editDetailsNote')} <bdi dir="ltr">{u.displayName} · {u.email}</bdi>
      </p>
      <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {u.role === 'student' && (
          <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
            {t('admin.editGrade')}
            <select
              value={grade}
              onChange={(e) => {
                setGrade(e.target.value);
                setDone(false);
              }}
            >
              {!u.grade && <option value="">{t('teacherReels.gradePlaceholder')}</option>}
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {t('teacherReels.gradeOption', { number: String(g) })}
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={{ display: 'grid', gap: 4, fontSize: 12.5, flex: '1 1 220px', minWidth: 0 }}>
          {t('admin.editSchool')}
          <input
            value={school}
            maxLength={80}
            onChange={(e) => {
              setSchool(e.target.value);
              setDone(false);
            }}
          />
        </label>
        {u.role === 'teacher' && (
          <label style={{ display: 'grid', gap: 4, fontSize: 12.5 }}>
            {t('admin.editSubject')}
            <select
              value={subject}
              onChange={(e) => {
                setSubject(e.target.value);
                setDone(false);
              }}
            >
              {!u.teacherSubject && <option value="">{t('teacherReels.subjectPlaceholder')}</option>}
              {SUBJECTS.map((k) => (
                <option key={k} value={k}>
                  {t(`auth.subject_${k}` as 'auth.subject_math')}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="btn btn-primary" disabled={busy || !dirty} onClick={save}>
          {t('admin.editSave')}
        </button>
      </div>
      {error && <p className="form-error-banner" style={{ marginTop: 8, marginBottom: 0 }}>{error}</p>}
      {done && <p style={{ color: 'var(--success, #2e7d4f)', fontWeight: 700, fontSize: 13.5, margin: '6px 0 0' }}>✓ {t('admin.editSaved')}</p>}
    </div>
  );
}
