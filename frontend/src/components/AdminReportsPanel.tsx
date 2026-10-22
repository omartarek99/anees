import { useEffect, useState } from 'react';
import { RiEyeLine, RiCheckboxCircleLine } from '@remixicon/react';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { formatWatchTime } from '../lib/format';
import { Pagination } from './Pagination';
import { GradeFilterSelect, type GradeFilter } from './GradeFilterSelect';
import { MonthlyTotalChart, StudentWatchHeatmap, type MonthlyWatchTime } from './WatchTimeCharts';
import { BarChart, DonutChart, HBarList } from './Charts';

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
  quizzesSolved: number;
  xpByActivity: { activity: string; xp: number }[];
  worksheetsByDifficulty: { difficulty: string; submitted: number }[];
};

// A palette slot belongs to its activity, so a quiet month never repaints the survivors.
const ACTIVITIES: Record<string, { labelKey: string; color: string }> = {
  reel_watch: { labelKey: 'admin.analyticsActivityReelWatch', color: 'var(--viz-1)' },
  reel_quiz: { labelKey: 'admin.analyticsActivityReelQuiz', color: 'var(--viz-2)' },
  boss_defeat: { labelKey: 'admin.analyticsActivityBoss', color: 'var(--viz-3)' },
  craft_puzzle: { labelKey: 'admin.analyticsActivityCraft', color: 'var(--viz-4)' },
  worksheet: { labelKey: 'admin.analyticsActivityWorksheet', color: 'var(--viz-5)' },
  other: { labelKey: 'admin.analyticsActivityOther', color: 'var(--viz-other)' },
};
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

/** The last `count` UTC calendar days ending today, oldest first ('YYYY-MM-DD') -- the days the
 * backend's page_views window covers, so quiet days show as empty columns instead of vanishing. */
function lastDays(count: number) {
  return Array.from({ length: count }, (_, i) => new Date(Date.now() - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

function dayLabel(day: string, lang: 'en' | 'ar') {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-QA' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

function WatchTimeTable({ gradeFilter }: { gradeFilter: GradeFilter }) {
  const { t } = useLanguage();
  const [students, setStudents] = useState<WatchTimeStudent[] | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  // A grade change invalidates the current page number, same as AdminUsersPanel.
  useEffect(() => setPage(1), [gradeFilter]);

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
                    {s.displayName} <span className="muted"><bdi dir="ltr">@{s.username}</bdi></span>
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
  const { t, lang } = useLanguage();
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    api.get<AnalyticsSummary>('/admin/analytics/summary').then(setSummary).catch(() => setSummary(null));
  }, []);

  if (!summary) return null;

  const days = lastDays(30);
  const viewsByDay = new Map(summary.daily.map((d) => [d.day, d.views]));
  const xpSlices = summary.xpByActivity.map(({ activity, xp }) => {
    const def = ACTIVITIES[activity] ?? ACTIVITIES.other;
    return { key: activity, label: t(def.labelKey), value: xp, color: def.color };
  });
  const submitted = new Map(summary.worksheetsByDifficulty.map((w) => [w.difficulty, w.submitted]));
  const difficultySlices = DIFFICULTIES.map((d, i) => ({ key: d, label: t(`worksheets.${d}`), value: submitted.get(d) ?? 0, color: `var(--viz-ord-${i + 1})` })).filter((s) => s.value > 0);

  return (
    <>
      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('admin.analyticsTitle')}</h3>
        <div className="grid-cards" style={{ marginBottom: 16 }}>
          <div className="stat-card stat-card-blue">
            <span className="stat-card-icon"><RiEyeLine size={16} /></span>
            <div className="stat-card-label">{t('admin.analyticsTotalViewsLabel')}</div>
            <div className="stat-card-value">{summary.totalViews}</div>
          </div>
          <div className="stat-card stat-card-green">
            <span className="stat-card-icon"><RiCheckboxCircleLine size={16} /></span>
            <div className="stat-card-label">{t('admin.analyticsQuizzesSolvedLabel')}</div>
            <div className="stat-card-value">{summary.quizzesSolved}</div>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{t('admin.analyticsDailyTitle')}</p>
        <BarChart
          labels={days.map((d) => dayLabel(d, lang))}
          values={days.map((d) => viewsByDay.get(d) ?? 0)}
          format={(n) => String(Math.round(n))}
          ariaLabel={t('admin.analyticsDailyTitle')}
          integer
        />
      </div>

      {summary.topPaths.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('admin.analyticsTopPages')}</h3>
          <HBarList rows={summary.topPaths.slice(0, 10).map((p) => ({ key: p.path, label: <bdi dir="ltr">{p.path}</bdi>, value: p.views }))} />
        </div>
      )}

      <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 28 }}>
        <div>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>{t('admin.analyticsActivityTitle')}</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>{t('admin.analyticsActivitySubtitle')}</p>
          {xpSlices.length > 0 ? <DonutChart slices={xpSlices} unit={t('common.xpUnit')} ariaLabel={t('admin.analyticsActivityTitle')} /> : <p className="muted">{t('admin.analyticsChartEmpty')}</p>}
        </div>
        <div>
          <h3 style={{ fontSize: 16, marginBottom: 4 }}>{t('admin.analyticsWorksheetsTitle')}</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>{t('admin.analyticsWorksheetsSubtitle')}</p>
          {difficultySlices.length > 0 ? <DonutChart slices={difficultySlices} unit={t('admin.analyticsWorksheetsUnit')} ariaLabel={t('admin.analyticsWorksheetsTitle')} /> : <p className="muted">{t('admin.analyticsChartEmpty')}</p>}
        </div>
      </div>
    </>
  );
}

function MonthlyWatchSection({ gradeFilter }: { gradeFilter: GradeFilter }) {
  const { t } = useLanguage();
  const [data, setData] = useState<MonthlyWatchTime | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (gradeFilter !== 'all') params.set('grade', gradeFilter);
    api
      .get<MonthlyWatchTime>(`/admin/reports/watch-time/monthly?${params.toString()}`)
      .then(setData)
      .catch(() => setData(null));
  }, [gradeFilter]);

  if (!data) {
    return (
      <div className="card">
        <div className="empty-state">
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const hasTotals = data.totalsBySecond.some((s) => s > 0);

  return (
    <>
      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>{t('admin.watchTimeMonthlyTitle')}</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>{t('admin.watchTimeMonthlySubtitle')}</p>
        {hasTotals ? <MonthlyTotalChart months={data.months} totalsBySecond={data.totalsBySecond} /> : <p className="muted">{t('admin.watchTimeMonthlyEmpty')}</p>}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>{t('admin.watchTimeStudentsTitle')}</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          {data.studentCount > data.students.length
            ? t('admin.watchTimeStudentsCap', { n: String(data.students.length), total: String(data.studentCount) })
            : t('admin.watchTimeStudentsSubtitle')}
        </p>
        {data.students.length > 0 ? <StudentWatchHeatmap months={data.months} students={data.students} /> : <p className="muted">{t('admin.watchTimeMonthlyEmpty')}</p>}
      </div>
    </>
  );
}

export function AdminReportsPanel() {
  // Shared by every watch-time section below -- one filter row scopes the whole group
  // rather than each chart/table carrying its own duplicate grade select.
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>('all');

  return (
    <div className="stack">
      <AnalyticsSummaryCard />
      <div className="card">
        <div className="field" style={{ maxWidth: 220, marginBottom: 0 }}>
          <GradeFilterSelect value={gradeFilter} onChange={setGradeFilter} />
        </div>
      </div>
      <MonthlyWatchSection gradeFilter={gradeFilter} />
      <WatchTimeTable gradeFilter={gradeFilter} />
    </div>
  );
}
