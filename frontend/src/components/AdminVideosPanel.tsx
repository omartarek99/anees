import { Ico } from './Ico';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError, pickText } from '../lib/i18n';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { ReelComposer } from './ReelComposer';

type AdminReel = {
  id: number;
  title: string;
  titleAr: string | null;
  videoUrl: string | null;
  grade: number | null;
  subjectName: string;
  subjectNameAr: string | null;
  authorUsername: string | null;
  authorDisplayName: string | null;
  authorRole: string | null;
  createdAt: string;
  /** How many students watched this lesson. */
  viewCount: number;
};

type SentMessage = { id: number; message: string; createdAt: string; readAt: string | null; adminName: string | null };

/** A pop-up window over the admin panel (Escape or the ✕ closes it). Drawn at the top level of the page: the panel it is opened from has a frosted-glass effect, which would otherwise make a window that covers the screen position itself inside the panel. */
function AdminWindow({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useLanguage();
  useEscapeToClose(onClose);
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-panel admin-window" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex-between" style={{ alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>{title}</h2>
          <button type="button" className="btn btn-secondary" onClick={onClose} aria-label={t('common.close')} title={t('common.close')} style={{ minHeight: 34, padding: '4px 12px' }}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** Send a message to the teacher who made a lesson (it pops up for them), and see the ones already sent. */
function MessageWindow({ reel, onClose }: { reel: AdminReel; onClose: () => void }) {
  const { t, lang } = useLanguage();
  const [text, setText] = useState('');
  const [history, setHistory] = useState<SentMessage[] | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  function loadHistory() {
    api
      .get<{ messages: SentMessage[] }>(`/admin/reels/${reel.id}/messages`)
      .then((data) => setHistory(data.messages))
      .catch(() => setHistory([]));
  }
  useEffect(loadHistory, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError(null);
    setJustSent(false);
    try {
      await api.post(`/admin/reels/${reel.id}/message`, { message: text.trim() });
      setText('');
      setJustSent(true);
      loadHistory();
    } catch (err) {
      setError(translateApiError(lang, err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'));
    } finally {
      setSending(false);
    }
  }

  const teacher = reel.authorDisplayName ?? reel.authorUsername ?? '—';
  return (
    <AdminWindow title={t('admin.messageTitle')} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
        {t('admin.messageAbout', { title: pickText(lang, reel.title, reel.titleAr), teacher })}
      </p>
      <div className="field">
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} rows={4} placeholder={t('admin.messagePlaceholder')} autoFocus />
        <small className="muted">{text.length}/500</small>
      </div>
      {error && <div className="form-error-banner">{error}</div>}
      {justSent && <p style={{ color: 'var(--success, #2e7d4f)', fontWeight: 700, fontSize: 14 }}>✓ {t('admin.messageSent')}</p>}
      <button type="button" className="btn btn-primary" disabled={sending || !text.trim()} onClick={send}>
        {sending ? t('admin.messageSending') : t('admin.messageSend')}
      </button>

      {history && history.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 14, margin: '0 0 8px' }}>{t('admin.messageHistory')}</h3>
          <div className="stack" style={{ gap: 8 }}>
            {history.map((m) => (
              <div key={m.id} className="card" style={{ padding: '10px 12px', background: 'var(--surface-2, rgba(0,0,0,0.03))' }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap' }} dir="auto">
                  {m.message}
                </p>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
                  {new Date(m.createdAt.replace(' ', 'T') + 'Z').toLocaleString(lang === 'ar' ? 'ar' : 'en-US')}
                  {m.adminName ? ` · ${m.adminName}` : ''} · {m.readAt ? `✓ ${t('admin.messageClosed')}` : t('admin.messageNotSeen')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </AdminWindow>
  );
}

export function AdminVideosPanel() {
  const { t, lang } = useLanguage();
  const [reels, setReels] = useState<AdminReel[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  // the pop-up windows: the lesson form (a lesson to edit, or 'new') and the message to a teacher
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [messaging, setMessaging] = useState<AdminReel | null>(null);

  function loadReels() {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    const qs = params.toString();
    api
      .get<{ reels: AdminReel[] }>(`/admin/reels${qs ? `?${qs}` : ''}`)
      .then((data) => {
        setReels(data.reels);
        setLoadError(null);
      })
      .catch(() => setLoadError(t('admin.loadError')));
  }

  useEffect(() => {
    const id = setTimeout(loadReels, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function handleDelete(reel: AdminReel) {
    if (!window.confirm(t('admin.deleteVideoConfirm', { title: pickText(lang, reel.title, reel.titleAr) }))) return;
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[reel.id];
      return next;
    });
    try {
      await api.delete(`/admin/reels/${reel.id}`);
      setReels((prev) => (prev ? prev.filter((r) => r.id !== reel.id) : prev));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setRowErrors((prev) => ({ ...prev, [reel.id]: translateApiError(lang, message) }));
    }
  }

  return (
    <div className="card">
      <div className="flex gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        <div className="field" style={{ flex: 1, minWidth: 220, margin: 0 }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.videosSearchPlaceholder')}
            aria-label={t('admin.videosSearchPlaceholder')}
          />
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
          ➕ {t('admin.addVideoButton')}
        </button>
      </div>

      {loadError && <div className="form-error-banner">{loadError}</div>}
      {!reels && !loadError && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}
      {reels && reels.length === 0 && !loadError && <p className="muted">{t(search.trim() ? 'admin.noVideos' : 'admin.noVideosAtAll')}</p>}

      <div className="stack" style={{ gap: 10, marginTop: 12 }}>
        {reels?.map((reel) => (
          <div key={reel.id} className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', background: 'var(--surface-2, rgba(0,0,0,0.03))' }}>
            <div style={{ width: 140, flexShrink: 0 }}>
              {reel.videoUrl ? (
                <video src={reel.videoUrl} controls muted style={{ width: '100%', borderRadius: 'var(--radius-sm)', display: 'block' }} />
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>
                  {t('admin.noVideoYet')}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong>{pickText(lang, reel.title, reel.titleAr)}</strong>
              <p className="muted" style={{ margin: '4px 0', fontSize: 13 }}>
                {reel.grade
                  ? t('admin.videoMeta', {
                      grade: String(reel.grade),
                      subject: pickText(lang, reel.subjectName, reel.subjectNameAr),
                      author: reel.authorDisplayName ?? reel.authorUsername ?? '—',
                    })
                  : t('admin.videoMetaNoGrade', {
                      subject: pickText(lang, reel.subjectName, reel.subjectNameAr),
                      author: reel.authorDisplayName ?? reel.authorUsername ?? '—',
                    })}
                {' · '}
                <span title={t('admin.viewsHint')}>👁 {t('admin.viewsCount', { n: String(reel.viewCount ?? 0) })}</span>
              </p>
              <div className="flex gap-sm" style={{ flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(reel.id)}>
                  ✏️ {t('admin.editVideoButton')}
                </button>
                {reel.authorRole === 'teacher' && (
                  <button type="button" className="btn btn-secondary" onClick={() => setMessaging(reel)}>
                    ✉️ {t('admin.messageTeacherButton')}
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={() => handleDelete(reel)}>
                  {t('admin.deleteButton')}
                </button>
              </div>
              {rowErrors[reel.id] && (
                <p className="form-error-banner" style={{ marginTop: 8, marginBottom: 0 }}>
                  {rowErrors[reel.id]}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {editing !== null && (
        <AdminWindow title={editing === 'new' ? t('admin.addVideoTitle') : t('admin.editVideoTitle')} onClose={() => setEditing(null)}>
          <ReelComposer
            bare
            editId={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null);
              loadReels();
            }}
            onCancel={() => setEditing(null)}
          />
        </AdminWindow>
      )}
      {messaging && <MessageWindow reel={messaging} onClose={() => setMessaging(null)} />}
    </div>
  );
}
