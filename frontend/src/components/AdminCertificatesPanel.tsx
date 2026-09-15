import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';

type AdminUserSummary = { id: number; username: string; displayName: string; role: 'student' | 'teacher' | 'admin' };

type Certificate = {
  id: number;
  userId: number;
  recipientUsername: string;
  recipientDisplayName: string;
  recipientRole: 'student' | 'teacher' | 'admin';
  title: string;
  titleAr: string;
  message: string;
  messageAr: string;
  issuedByName: string | null;
  createdAt: string;
};

/** Admin-only: hand-issue a certificate to a student or teacher's profile (shown there via
 * routes/users.ts profileSummary, printable the same way a teacher's worksheet is -- see
 * PrintableCertificate.tsx), plus a history of everything sent so far. */
export function AdminCertificatesPanel() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AdminUserSummary[]>([]);
  const [recipient, setRecipient] = useState<AdminUserSummary | null>(null);
  const [title, setTitle] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [message, setMessage] = useState('');
  const [messageAr, setMessageAr] = useState('');
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [certificates, setCertificates] = useState<Certificate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  function loadCertificates() {
    api
      .get<{ certificates: Certificate[] }>('/admin/certificates')
      .then((data) => {
        setCertificates(data.certificates);
        setLoadError(null);
      })
      .catch(() => setLoadError(t('admin.loadError')));
  }

  useEffect(loadCertificates, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced recipient search against the same admin user list the Users tab uses --
  // admins are filtered out client-side since a certificate can't be issued to one.
  useEffect(() => {
    if (recipient || !search.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      api
        .get<{ users: AdminUserSummary[] }>(`/admin/users?search=${encodeURIComponent(search.trim())}`)
        .then((data) => setResults(data.users.filter((u) => u.role !== 'admin')))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(id);
  }, [search, recipient]);

  async function handleSend() {
    if (!recipient || !title.trim()) return;
    setSending(true);
    setFormError(null);
    try {
      await api.post('/admin/certificates', {
        userId: recipient.id,
        title: title.trim(),
        titleAr: titleAr.trim(),
        message: message.trim(),
        messageAr: messageAr.trim(),
      });
      setRecipient(null);
      setSearch('');
      setTitle('');
      setTitleAr('');
      setMessage('');
      setMessageAr('');
      loadCertificates();
    } catch (err) {
      setFormError(err instanceof ApiError ? translateApiError(lang, err.message) : t('admin.certSendError'));
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(cert: Certificate) {
    if (!window.confirm(t('admin.certRevokeConfirm', { name: cert.recipientDisplayName }))) return;
    try {
      await api.delete(`/admin/certificates/${cert.id}`);
      setCertificates((prev) => (prev ? prev.filter((c) => c.id !== cert.id) : prev));
    } catch {
      loadCertificates();
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="card stack">
        <div>
          <h3 style={{ fontSize: 16, margin: 0 }}>{t('admin.certIssueTitle')}</h3>
          <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
            {t('admin.certIssueSubtitle')}
          </p>
        </div>

        {formError && <div className="form-error-banner">{formError}</div>}

        <div className="field">
          <label>{t('admin.certRecipientLabel')}</label>
          {recipient ? (
            <div className="flex-between" style={{ alignItems: 'center' }}>
              <span>
                <strong>{recipient.displayName}</strong> <span className="muted">@{recipient.username}</span>
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRecipient(null)}>
                {t('admin.certRecipientChange')}
              </button>
            </div>
          ) : (
            <>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('admin.certRecipientSearchPlaceholder')}
              />
              {search.trim() && (
                <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                  {results.length === 0 && <p className="muted" style={{ fontSize: 13 }}>{t('admin.certRecipientNone')}</p>}
                  {results.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="list-row"
                      style={{ textAlign: 'start', cursor: 'pointer', width: '100%' }}
                      onClick={() => {
                        setRecipient(u);
                        setResults([]);
                      }}
                    >
                      <strong>{u.displayName}</strong> <span className="muted">@{u.username} · {u.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="field">
          <label>{t('admin.certTitleLabel')}</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={t('admin.certTitlePlaceholder')} />
        </div>
        <div className="field">
          <label>{t('admin.certTitleArLabel')}</label>
          <input value={titleAr} onChange={(e) => setTitleAr(e.target.value)} maxLength={120} dir="rtl" />
        </div>
        <div className="field">
          <label>{t('admin.certMessageLabel')}</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder={t('admin.certMessagePlaceholder')}
          />
        </div>
        <div className="field">
          <label>{t('admin.certMessageArLabel')}</label>
          <textarea value={messageAr} onChange={(e) => setMessageAr(e.target.value)} maxLength={500} rows={3} dir="rtl" />
        </div>

        <button type="button" className="btn btn-primary" disabled={!recipient || !title.trim() || sending} onClick={handleSend}>
          {t('admin.certSendButton')}
        </button>
      </div>

      <div className="card stack">
        <h3 style={{ fontSize: 16, margin: 0 }}>{t('admin.certSentTitle')}</h3>
        {loadError && <div className="form-error-banner">{loadError}</div>}
        {!certificates && !loadError && (
          <div className="empty-state">
            <div className="spinner" />
          </div>
        )}
        {certificates && certificates.length === 0 && <p className="muted">{t('admin.certNoneSent')}</p>}
        <div className="stack" style={{ gap: 10 }}>
          {certificates?.map((c) => (
            <div key={c.id} className="list-row flex-between" style={{ alignItems: 'flex-start' }}>
              <div>
                <strong>{c.title}</strong>
                <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                  {c.recipientDisplayName} (@{c.recipientUsername}) ·{' '}
                  {new Date(c.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString(lang === 'ar' ? 'ar-QA' : 'en-US')}
                </p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRevoke(c)}>
                {t('admin.certRevokeButton')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
