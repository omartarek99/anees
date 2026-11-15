import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';

type Status = 'none' | 'pending' | 'approved' | 'rejected';

/**
 * A teacher sends a photo or PDF of their teaching certificate here; an admin approves it (backend routes/teacherCertificate.ts). Until then they
 * can browse everything but not post lessons or send worksheets. Shown in place of the lesson form while the certificate is not approved.
 */
export function TeacherCertificateCard() {
  const { user, refreshUser } = useAuth();
  const { t, lang } = useLanguage();
  const status = (user?.teacherCertStatus ?? 'none') as Status;
  const note = user?.teacherCertNote;
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setSending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('certificate', file);
      await api.postForm('/teacher-certificate', form);
      setFile(null);
      await refreshUser();
    } catch (err) {
      setError(translateApiError(lang, err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="card stack cert-card">
      <h3 style={{ fontSize: 16, margin: 0 }}>{t('teacherCert.title')}</h3>
      <span className={`cert-status is-${status}`}>{t(`teacherCert.status_${status}`)}</span>
      <p style={{ margin: 0 }}>{t(status === 'pending' ? 'teacherCert.pendingBody' : 'teacherCert.body')}</p>
      {status === 'rejected' && note && (
        <p className="muted" style={{ margin: 0 }}>
          {t('teacherCert.reason')} {note}
        </p>
      )}
      {status !== 'pending' && (
        <form className="stack" style={{ gap: 10 }} onSubmit={send}>
          {error && (
            <div className="form-error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="field">
            <label htmlFor="teacher-cert">{t('teacherCert.fileLabel')}</label>
            <input id="teacher-cert" type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
            <small className="muted">{t('teacherCert.fileHint')}</small>
          </div>
          <button className="btn btn-primary" type="submit" disabled={!file || sending} style={{ width: 'fit-content' }}>
            {sending ? t('teacherCert.sending') : t('teacherCert.send')}
          </button>
        </form>
      )}
    </div>
  );
}
