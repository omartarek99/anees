import { RiEyeLine, RiErrorWarningLine } from '@remixicon/react';
import { Skeleton } from '../components/Skeleton';
import { useDialog } from '../lib/dialog';
import { useAuth } from '../lib/auth-context';
import { TeacherCertificateCard } from '../components/TeacherCertificateCard';
import { TeacherCertificatePopup } from '../components/TeacherCertificatePopup';
import { Ico } from '../components/Ico';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';
import { formatWatchTime } from '../lib/format';
import { Topbar } from '../components/Topbar';
import { ReelComposer } from '../components/ReelComposer';

type WatchStats = {
  id: number;
  title: string;
  titleAr: string | null;
  grade: number;
  watchers: number;
  totalWatchedSeconds: number;
  avgWatchedSeconds: number;
};

function TeacherWatchReport() {
  const { t, lang } = useLanguage();
  const [stats, setStats] = useState<WatchStats[] | null>(null);

  useEffect(() => {
    api
      .get<{ reels: WatchStats[] }>('/teacher-reels/reports/watch-time')
      .then((data) => setStats(data.reels))
      .catch(() => setStats([]));
  }, []);

  if (!stats) return null;

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('teacherReels.watchReportTitle')}</h3>
      {stats.length === 0 && <p className="muted">{t('teacherReels.watchReportEmpty')}</p>}
      <div className="stack" style={{ gap: 10 }}>
        {stats.map((r) => (
          <div key={r.id} className="card">
            <strong>{pickText(lang, r.title, r.titleAr)}</strong>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
              {t('teacherReels.watchReportWatchers', { n: String(r.watchers) })}
              {' · '}
              {t('teacherReels.watchReportTotal', { time: formatWatchTime(r.totalWatchedSeconds) })}
              {' · '}
              {t('teacherReels.watchReportAvg', { time: formatWatchTime(r.avgWatchedSeconds) })}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}


type ReelSummary = {
  id: number;
  title: string;
  titleAr?: string | null;
  videoUrl: string | null;
  /** How the last video upload is going: still being processed in the background, stored, or failed (null: none uploaded). */
  videoStatus: 'processing' | 'ready' | 'failed' | null;
  /** Why the last upload failed: timeout (too slow), storage, unreadable (a broken file), restart (the server restarted), other. */
  videoError?: string | null;
  grade: number;
  subjectName: string;
  subjectNameAr?: string | null;
  questionCount: number;
  // every like on the lesson, the teacher's own included (only likes from others earn points, backend lib/xp.ts)
  likeCount: number;
  /** How many students watched this lesson. */
  viewCount: number;
};

export function TeacherReelsPage() {
  const { t, lang } = useLanguage();
  const { confirm } = useDialog();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reels, setReels] = useState<ReelSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // the lesson open in the form (null: a new one). ?edit=ID opens one straight away (the link in an admin's message about a lesson).
  const [editingId, setEditingId] = useState<number | null>(() => {
    const n = Number(searchParams.get('edit'));
    return Number.isInteger(n) && n > 0 ? n : null;
  });

  // A lesson whose video was still processing and now is stored (or failed) gets a notice at the top of the page, so the teacher knows it is
  // live without watching the list.
  const [notice, setNotice] = useState<{ ok: boolean; title: string } | null>(null);
  const processingIds = useRef(new Set<number>());

  function loadReels() {
    api
      .get<{ reels: ReelSummary[] }>('/teacher-reels')
      .then((data) => {
        for (const r of data.reels) {
          if (processingIds.current.has(r.id) && r.videoStatus !== 'processing' && r.videoStatus)
            setNotice({ ok: r.videoStatus === 'ready', title: pickText(lang, r.title, r.titleAr) });
        }
        processingIds.current = new Set(data.reels.filter((r) => r.videoStatus === 'processing').map((r) => r.id));
        setReels(data.reels);
      })
      .catch(() => setLoadError(t('teacherReels.loadError')));
  }

  useEffect(() => {
    loadReels();
    if (searchParams.has('edit')) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A video is compressed in the background after the upload is accepted: keep checking the list until none is still processing.
  const anyProcessing = !!reels?.some((r) => r.videoStatus === 'processing');
  useEffect(() => {
    if (!anyProcessing) return;
    const timer = window.setTimeout(loadReels, 4000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyProcessing, reels]);

  function handleEdit(id: number) {
    setEditingId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete(id: number) {
    if (!(await confirm({ message: t('teacherReels.deleteLessonConfirm'), danger: true }))) return;
    try {
      await api.delete(`/teacher-reels/${id}`);
      setReels((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
      if (editingId === id) setEditingId(null);
    } catch {
      loadReels();
    }
  }

  return (
    <div className="stack">
      <Topbar title={t('teacherReels.pageTitle')} subtitle={t('teacherReels.pageSubtitle')} />
      {notice && (
        <div className={`upload-notice ${notice.ok ? 'is-ok' : 'is-failed'}`} role="status">
          <span>{t(notice.ok ? 'teacherReels.liveNotice' : 'teacherReels.failedNotice', { title: notice.title })}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNotice(null)}>
            {t('common.close')}
          </button>
        </div>
      )}

      {/* posting needs an approved teaching certificate (an admin checks it); until then the certificate card takes the form's place */}
      {user?.teacherCertStatus === 'approved' ? (
        <ReelComposer
          editId={editingId}
          onSaved={() => {
            setEditingId(null);
            loadReels();
          }}
          onCancel={editingId ? () => setEditingId(null) : undefined}
        />
      ) : (
        <>
          <TeacherCertificateCard />
          <TeacherCertificatePopup />
        </>
      )}

      {/* "Your lessons" and the watch time appear once an admin has approved the certificate */}
      {user?.teacherCertStatus === 'approved' && (
        <>
          <div className="card">
            <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('teacherReels.myReelsTitle')}</h3>
            {loadError && <div className="form-error-banner">{loadError}</div>}
            {!reels && !loadError && (
              <Skeleton rows={3} />
            )}
            {reels && reels.length === 0 && !loadError && <p className="muted">{t('teacherReels.noReels')}</p>}
            {reels && reels.length > 0 && (
              <p style={{ margin: '0 0 12px', fontWeight: 700 }}>
                <RiEyeLine size={16} aria-hidden="true" style={{ verticalAlign: '-3px' }} /> {t('teacherReels.totalViews', { n: String(reels.reduce((sum, r) => sum + (r.viewCount ?? 0), 0)) })}
              </p>
            )}
            <div className="stack" style={{ gap: 10 }}>
              {reels?.map((reel) => (
                <div key={reel.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                  <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                    <div className="flex gap-sm" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong>{pickText(lang, reel.title, reel.titleAr)}</strong>
                      <span className="badge" title={t('teacherReels.viewsHint')}>
                        <RiEyeLine size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {t('teacherReels.reelViews', { n: String(reel.viewCount ?? 0) })}
                      </span>
                    </div>
                    <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                      {t('teacherReels.reelMeta', {
                        grade: String(reel.grade),
                        subject: pickText(lang, reel.subjectName, reel.subjectNameAr),
                        questions: String(reel.questionCount),
                      })}
                      {' · '}
                      {t('teacherReels.likeCount', { n: reel.likeCount })}
                    </p>
                    {reel.videoStatus === 'processing' && (
                      <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, color: 'var(--gold-dark, #b07a10)' }}>⏳ {t('teacherReels.videoProcessing')}</p>
                    )}
                    {reel.videoStatus === 'failed' && (
                      <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}><RiErrorWarningLine size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {t(`teacherReels.videoFailed_${reel.videoError && ['timeout', 'storage', 'unreadable', 'restart'].includes(reel.videoError) ? reel.videoError : 'other'}`)}</p>
                    )}
                  </div>
                  <div className="flex gap-sm">
                    <button type="button" className="btn btn-secondary" onClick={() => handleEdit(reel.id)}>
                      {t('teacherReels.editButton')}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => handleDelete(reel.id)}>
                      {t('teacherReels.deleteButton')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <TeacherWatchReport />
        </>
      )}
    </div>
  );
}
