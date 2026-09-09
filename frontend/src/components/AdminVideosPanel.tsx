import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { translateApiError, pickText } from '../lib/i18n';

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
  createdAt: string;
};

export function AdminVideosPanel() {
  const { t, lang } = useLanguage();
  const [reels, setReels] = useState<AdminReel[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});

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
      <div className="field">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('admin.videosSearchPlaceholder')}
          aria-label={t('admin.videosSearchPlaceholder')}
        />
      </div>

      {loadError && <div className="form-error-banner">{loadError}</div>}
      {!reels && !loadError && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}
      {reels && reels.length === 0 && !loadError && <p className="muted">{t('admin.noVideos')}</p>}

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
              </p>
              <button type="button" className="btn btn-secondary" onClick={() => handleDelete(reel)}>
                {t('admin.deleteButton')}
              </button>
              {rowErrors[reel.id] && (
                <p className="form-error-banner" style={{ marginTop: 8, marginBottom: 0 }}>
                  {rowErrors[reel.id]}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
