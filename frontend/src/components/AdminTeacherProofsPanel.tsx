import { useEffect, useRef, useState } from 'react';
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
  /** false for a teacher an admin let in without a certificate */
  hasFile: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'none';
  note: string | null;
  sentAt: string | null;
};

/** The teachers' certificates (backend routes/teacherCertificate.ts). Without a search: the teachers who sent one, waiting ones first. With a search (name,
 *  username or e-mail): any teacher, even one who never sent a certificate. For each: open the file, approve or reject it, or let the teacher post lessons
 *  WITHOUT a certificate ("Allow without certificate") and take that back. */
export function AdminTeacherProofsPanel() {
  const { t, lang } = useLanguage();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const seq = useRef(0);

  const term = q.trim();
  const searching = term.length >= 2;

  const load = () => {
    const mine = ++seq.current;
    return api
      .get<Row[]>(searching ? `/admin/teacher-certificates/search?q=${encodeURIComponent(term)}` : '/admin/teacher-certificates')
      .then((r) => mine === seq.current && setRows(r))
      .catch(() => mine === seq.current && setError(t('teacherCert.adminLoadError')));
  };
  // reload as the admin types (after a short pause) and when the search is cleared
  useEffect(() => {
    if (q.length > 0 && !searching) return; // one letter: wait for a second
    const id = window.setTimeout(load, searching ? 300 : 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function run(row: Row, fn: () => Promise<unknown>) {
    setBusy(row.userId);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(translateApiError(lang, err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'));
    } finally {
      setBusy(null);
    }
  }

  function review(row: Row, approve: boolean) {
    const note = approve ? undefined : window.prompt(t('teacherCert.adminRejectPrompt')) ?? undefined;
    if (!approve && note === undefined) return; // cancelled
    return run(row, () => api.post(`/admin/teacher-certificates/${row.userId}/review`, { approve, note: note || undefined }));
  }
  const setAccess = (row: Row, allow: boolean) => run(row, () => api.post(`/admin/teacher-certificates/${row.userId}/access`, { allow }));

  return (
    <div className="card stack">
      <div className="field" style={{ margin: 0 }}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('teacherCert.adminSearch')}
          aria-label={t('teacherCert.adminSearch')}
          autoComplete="off"
        />
      </div>
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
      {rows && rows.length === 0 && <p className="muted">{t(searching ? 'teacherCert.adminNoResults' : 'teacherCert.adminEmpty')}</p>}
      {rows?.map((r) => (
        <div key={r.userId} className="cert-row" style={{ borderBlockEnd: '1px solid var(--sand-dark)', paddingBlock: 10 }}>
          <div className="stack" style={{ gap: 2 }}>
            <strong>
              {r.displayName} <span className="muted">@{r.username}</span>
            </strong>
            <span className="muted" style={{ fontSize: 13 }}>
              {[r.email, r.schoolName, r.sentAt].filter(Boolean).join(' | ')}
            </span>
            <span className={`cert-status is-${r.status}`}>
              {t(`teacherCert.status_${r.status}`)}
              {r.status === 'approved' && !r.hasFile ? ` · ${t('teacherCert.adminNoCertificate')}` : ''}
            </span>
            {r.status === 'rejected' && r.note && <span className="muted" style={{ fontSize: 13 }}>{r.note}</span>}
          </div>
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            {r.hasFile && (
              <a className="btn btn-secondary btn-sm" href={`/api/admin/teacher-certificates/${r.userId}/file`} target="_blank" rel="noopener noreferrer">
                {t('teacherCert.adminOpen')}
              </a>
            )}
            {r.hasFile && r.status !== 'approved' && (
              <button className="btn btn-primary btn-sm" disabled={busy === r.userId} onClick={() => review(r, true)}>
                {t('teacherCert.adminApprove')}
              </button>
            )}
            {r.hasFile && r.status !== 'rejected' && (
              <button className="btn btn-ghost btn-sm" disabled={busy === r.userId} onClick={() => review(r, false)}>
                {t('teacherCert.adminReject')}
              </button>
            )}
            {r.status !== 'approved' ? (
              <button className="btn btn-secondary btn-sm" disabled={busy === r.userId} onClick={() => setAccess(r, true)}>
                {t('teacherCert.adminAllow')}
              </button>
            ) : (
              // a teacher let in with a certificate is taken back with Reject above; one let in WITHOUT a certificate has only this
              !r.hasFile && (
                <button className="btn btn-ghost btn-sm" disabled={busy === r.userId} onClick={() => setAccess(r, false)}>
                  {t('teacherCert.adminTakeBack')}
                </button>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
