import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { formatWatchTime } from '../lib/format';
import { Pagination } from './Pagination';
import { GradeFilterSelect, type GradeFilter } from './GradeFilterSelect';

type WatchTimeStudent = {
  userId: number;
  username: string;
  displayName: string;
  grade: number | null;
  totalWatchedSeconds: number;
  totalWatchXp: number;
  reelsWatched: number;
};

type AnalyticsSummary = {
  topPaths: { path: string; views: number }[];
  daily: { day: string; views: number }[];
  totalViews: number;
};

function WatchTimeReport() {
  const { t } = useLanguage();
  const [students, setStudents] = useState<WatchTimeStudent[] | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const params = new URLSearchParams();
    if (gradeFilter !== 'all') params.set('grade', gradeFilter);
    params.set('page', String(page));
    api
      .get<{ students: WatchTimeStudent[]; totalPages: number }>(`/admin/reports/watch-time?${params.toString()}`)
      .then((data) => {
        setStudents(data.students);
        setTotalPages(data.totalPages);
      })
      .catch(() => setStudents([]));
  }, [gradeFilter, page]);

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, marginBottom: 4 }}>{t('admin.watchTimeTitle')}</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>{t('admin.watchTimeSubtitle')}</p>

      <div className="field" style={{ maxWidth: 220 }}>
        <GradeFilterSelect
          value={gradeFilter}
          onChange={(value) => {
            setGradeFilter(value);
            setPage(1);
          }}
        />
      </div>

      {!students && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}
      {students && students.length === 0 && <p className="muted">{t('admin.watchTimeEmpty')}</p>}

      {students && students.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'start' }}>
                <th style={{ padding: '6px 8px' }}>{t('admin.watchTimeColStudent')}</th>
                <th style={{ padding: '6px 8px' }}>{t('admin.watchTimeColGrade')}</th>
                <th style={{ padding: '6px 8px' }}>{t('admin.watchTimeColTime')}</th>
                <th style={{ padding: '6px 8px' }}>{t('admin.watchTimeColReels')}</th>
                <th style={{ padding: '6px 8px' }}>{t('admin.watchTimeColXp')}</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.userId} style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    {s.displayName} <span className="muted">@{s.username}</span>
                  </td>
                  <td style={{ padding: '6px 8px' }}>{s.grade ?? '—'}</td>
                  <td style={{ padding: '6px 8px' }}>{formatWatchTime(s.totalWatchedSeconds)}</td>
                  <td style={{ padding: '6px 8px' }}>{s.reelsWatched}</td>
                  <td style={{ padding: '6px 8px' }}>{s.totalWatchXp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}

function AnalyticsSummaryCard() {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    api.get<AnalyticsSummary>('/admin/analytics/summary').then(setSummary).catch(() => setSummary(null));
  }, []);

  if (!summary) return null;

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, marginBottom: 4 }}>{t('admin.analyticsTitle')}</h3>
      <p style={{ fontSize: 14, marginTop: 0, marginBottom: 12 }}>{t('admin.analyticsTotalViews', { n: String(summary.totalViews) })}</p>
      {summary.topPaths.length > 0 && (
        <>
          <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{t('admin.analyticsTopPages')}</p>
          <div className="stack" style={{ gap: 4 }}>
            {summary.topPaths.map((p) => (
              <div key={p.path} className="flex" style={{ justifyContent: 'space-between', fontSize: 13.5 }}>
                <code>{p.path}</code>
                <span className="muted">{p.views}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AdminReportsPanel() {
  return (
    <div className="stack">
      <WatchTimeReport />
      <AnalyticsSummaryCard />
    </div>
  );
}
