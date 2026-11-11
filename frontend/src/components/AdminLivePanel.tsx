import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';

type LiveData = {
  online: { students: number; teachers: number; people: { id: number; username: string; displayName: string; role: 'student' | 'teacher'; lastSeenAt: string }[] };
  events: { type: 'signup' | 'lesson' | 'certificate' | 'warning' | 'violation'; at: string; name: string; role?: string; title?: string; days?: number }[];
};

const DOT: Record<string, string> = { signup: '#4caf7d', lesson: '#6aa8ff', certificate: '#f7be72', warning: '#ff9f43', violation: '#e5484d' };

/** Minutes / hours / days since a server timestamp (UTC, written without a "Z"). */
function useAgo() {
  const { t } = useLanguage();
  return (stamp: string) => {
    const mins = Math.max(0, Math.floor((Date.now() - new Date(stamp.replace(' ', 'T') + 'Z').getTime()) / 60_000));
    if (mins < 1) return t('admin.liveNow');
    if (mins < 60) return t('admin.liveAgoMin', { n: String(mins) });
    if (mins < 60 * 24) return t('admin.liveAgoHour', { n: String(Math.floor(mins / 60)) });
    return t('admin.accAgoDays', { n: String(Math.floor(mins / 1440)) });
  };
}

/** The top of the dashboard: who is online right now and the newest things that happened. Refreshes itself every 30 seconds. */
export function AdminLivePanel() {
  const { t } = useLanguage();
  const ago = useAgo();
  const [data, setData] = useState<LiveData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let stopped = false;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      api
        .get<LiveData>('/admin/live')
        .then((d) => {
          if (!stopped) {
            setData(d);
            setFailed(false);
          }
        })
        .catch(() => !stopped && setFailed(true));
    };
    load();
    const id = setInterval(load, 30_000);
    document.addEventListener('visibilitychange', load);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', load);
    };
  }, []);

  const text = (e: LiveData['events'][number]) => {
    switch (e.type) {
      case 'signup':
        return t(e.role === 'teacher' ? 'admin.evSignupTeacher' : 'admin.evSignupStudent', { name: e.name });
      case 'lesson':
        return t('admin.evLesson', { name: e.name });
      case 'certificate':
        return t('admin.evCertificate', { name: e.name, title: e.title ?? '' });
      case 'warning':
        return t('admin.evWarning', { name: e.name });
      default:
        return e.days ? t('admin.evSuspended', { name: e.name, n: String(e.days) }) : t('admin.evViolation', { name: e.name });
    }
  };

  const total = data ? data.online.students + data.online.teachers : 0;
  return (
    <div className="card">
      <div className="flex gap-sm" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={{ fontSize: 16, margin: 0 }}>{t('admin.liveTitle')}</h3>
        {data && (
          <span className="badge" title={data.online.people.map((p) => p.displayName).join('، ')}>
            <span aria-hidden style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: total > 0 ? '#4caf7d' : '#8a8a99', marginInlineEnd: 6 }} />
            {t('admin.liveOnline', { n: String(total) })} · {t('admin.liveStudents', { n: String(data.online.students) })} · {t('admin.liveTeachers', { n: String(data.online.teachers) })}
          </span>
        )}
      </div>
      {failed && !data && <p className="muted">{t('admin.liveFailed')}</p>}
      {!data && !failed && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}
      {data && data.events.length === 0 && <p className="muted">{t('admin.liveNoEvents')}</p>}
      {data && data.events.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, maxHeight: 280, overflow: 'auto' }}>
          {data.events.map((e, i) => (
            <li key={`${e.type}-${e.at}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span aria-hidden style={{ flex: '0 0 auto', width: 10, height: 10, borderRadius: '50%', background: DOT[e.type] }} />
              <span style={{ flex: 1, minWidth: 0 }}>{text(e)}</span>
              <span className="muted" style={{ flex: '0 0 auto', fontSize: 12 }}>
                {ago(e.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
