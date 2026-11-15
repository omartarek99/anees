import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';

type Row = {
  userId: number;
  username: string;
  displayName: string;
  email: string | null;
  schoolName: string | null;
  teacherSubject: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'none';
  note: string | null;
  sentAt: string | null;
};

/** The teachers' certificates (backend routes/teacherCertificate.ts), waiting ones first: open the file, then approve or reject it. */
export function AdminTeacherProofsPanel() {
  const { t, lang } = useLanguage();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = () =>
    api
      .get<Row[]>('/admin/teacher-certificates')
      .then(setRows)
      .catch(() => setError(t('teacherCert.adminLoadError')));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function review(row: Row, approve: boolean) {
    const note = approve ? undefined : window.prompt(t('teacherCert.adminRejectPrompt')) ?? undefined;
    if (!approve && note === undefined) return; // cancelled
    setBusy(row.userId);
    setError(null);
    try {
      await api.post(`/admin/teacher-certificates/${row.userId}/review`, { approve, note: note || undefined });
      await load();
    } catch (err) {
      setError(translateApiError(lang, err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card stack">
      {error && (
        <div className="form-error-banner" role="alert">
          {error}
        </div>
      )}
      {!rows && !error && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}
      {rows && rows.length === 0 && <p className="muted">{t('teacherCert.adminEmpty')}</p>}
      {rows?.map((r) => (
        <div key={r.userId} className="cert-row" style={{ borderBlockEnd: '1px solid var(--sand-dark)', paddingBlock: 10 }}>
          <div className="stack" style={{ gap: 2 }}>
            <strong>
              {r.displayName} <span className="muted">@{r.username}</span>
            </strong>
            <span className="muted" style={{ fontSize: 13 }}>
              {[r.email, r.schoolName, r.sentAt].filter(Boolean).join(' | ')}
            </span>
            <span className={`cert-status is-${r.status}`}>{t(`teacherCert.status_${r.status}`)}</span>
            {r.status === 'rejected' && r.note && <span className="muted" style={{ fontSize: 13 }}>{r.note}</span>}
          </div>
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            <a className="btn btn-secondary btn-sm" href={`/api/admin/teacher-certificates/${r.userId}/file`} target="_blank" rel="noopener noreferrer">
              {t('teacherCert.adminOpen')}
            </a>
            {r.status !== 'approved' && (
              <button className="btn btn-primary btn-sm" disabled={busy === r.userId} onClick={() => review(r, true)}>
                {t('teacherCert.adminApprove')}
              </button>
            )}
            {r.status !== 'rejected' && (
              <button className="btn btn-ghost btn-sm" disabled={busy === r.userId} onClick={() => review(r, false)}>
                {t('teacherCert.adminReject')}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
