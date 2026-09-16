import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError } from '../lib/i18n';
import { CERT_TYPES, CERT_PALETTES, CERT_TYPE_LABEL_KEY, type CertificateType } from '../lib/certificateTiers';

type AdminUserSummary = { id: number; username: string; displayName: string; role: 'student' | 'teacher' | 'admin' };

type Certificate = {
  id: number;
  userId: number;
  recipientUsername: string;
  recipientDisplayName: string;
  recipientRole: 'student' | 'teacher' | 'admin';
  title: string;
  type: CertificateType;
  imageUrl: string;
  issuedByName: string | null;
  createdAt: string;
};

/** Admin-only: upload a certificate image and hand-issue it to a student or teacher's
 * profile (routes/users.ts profileSummary shows it there; CertificateAwardPopup announces
 * it with confetti on their next visit), plus a history of everything sent so far. The
 * certificate IS the uploaded image -- nothing is drawn on top of it, so issuing one only
 * needs a recipient, a name, and a category. */
export function AdminCertificatesPanel() {
  const { t, lang } = useLanguage();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AdminUserSummary[]>([]);
  const [recipient, setRecipient] = useState<AdminUserSummary | null>(null);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CertificateType>('gold');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Revoked once the preview <img> no longer needs it (a fresh one is made per file pick,
  // and the final cleanup on unmount) -- object URLs otherwise leak for the page's lifetime.
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  function handlePickImage(file: File | null) {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(file);
    setImagePreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleSend() {
    if (!recipient || !title.trim() || !imageFile) return;
    setSending(true);
    setFormError(null);
    try {
      const formData = new FormData();
      formData.append('userId', String(recipient.id));
      formData.append('title', title.trim());
      formData.append('type', type);
      formData.append('image', imageFile);
      await api.postForm('/admin/certificates', formData);
      setRecipient(null);
      setSearch('');
      setTitle('');
      setType('gold');
      handlePickImage(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
          <label>{t('admin.certTypeLabel')}</label>
          <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
            {CERT_TYPES.map((ct) => {
              const palette = CERT_PALETTES[ct];
              const selected = type === ct;
              return (
                <button
                  key={ct}
                  type="button"
                  onClick={() => setType(ct)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 999,
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: 13,
                    border: selected ? `2px solid ${palette.dark}` : '2px solid transparent',
                    background: `linear-gradient(135deg, ${palette.light}, ${palette.dark})`,
                    color: '#fff',
                    opacity: selected ? 1 : 0.55,
                  }}
                >
                  🎖️ {t(CERT_TYPE_LABEL_KEY[ct])}
                </button>
              );
            })}
          </div>
        </div>

        <div className="field">
          <label>{t('admin.certImageLabel')}</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => handlePickImage(e.target.files?.[0] ?? null)}
          />
          {imagePreviewUrl && (
            <img
              src={imagePreviewUrl}
              alt=""
              style={{ marginTop: 10, maxWidth: 220, maxHeight: 220, borderRadius: 'var(--radius-sm)', objectFit: 'contain' }}
            />
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          disabled={!recipient || !title.trim() || !imageFile || sending}
          onClick={handleSend}
        >
          {sending ? t('admin.certSending') : t('admin.certSendButton')}
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
          {certificates?.map((c) => {
            const palette = CERT_PALETTES[c.type];
            return (
              <div key={c.id} className="list-row flex-between" style={{ alignItems: 'center' }}>
                <div className="flex gap-md" style={{ alignItems: 'center' }}>
                  <img
                    src={c.imageUrl}
                    alt=""
                    style={{ width: 44, height: 44, borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }}
                  />
                  <div>
                    <div className="flex gap-sm" style={{ alignItems: 'center' }}>
                      <strong>{c.title}</strong>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 999,
                          color: '#fff',
                          background: `linear-gradient(135deg, ${palette.light}, ${palette.dark})`,
                        }}
                      >
                        {t(CERT_TYPE_LABEL_KEY[c.type])}
                      </span>
                    </div>
                    <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                      {c.recipientDisplayName} (@{c.recipientUsername}) ·{' '}
                      {new Date(c.createdAt.replace(' ', 'T') + 'Z').toLocaleDateString(lang === 'ar' ? 'ar-QA' : 'en-US')}
                    </p>
                  </div>
                </div>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRevoke(c)}>
                  {t('admin.certRevokeButton')}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
