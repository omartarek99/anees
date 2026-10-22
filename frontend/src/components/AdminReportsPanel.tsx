import { useEffect, useState } from 'react';
import { RiEyeLine, RiCheckboxCircleLine, RiFileExcel2Line } from '@remixicon/react';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { formatWatchTime } from '../lib/format';
import { Pagination } from './Pagination';
import { GradeFilterSelect, type GradeFilter } from './GradeFilterSelect';
import { MonthlyTotalChart, StudentWatchHeatmap, type MonthlyWatchTime } from './WatchTimeCharts';

type RoleFilter = 'all' | 'student' | 'teacher';

// Students AND teachers: watch time and worksheets for both, plus uploaded videos / printed
// worksheets for teachers (see backend lib/reportData.ts).
type WatchTimeUser = {
  userId: number;
  username: string;
  displayName: string;
  role: 'student' | 'teacher';
  grade: number | null;
  teacherSubject: string | null;
  watchedSeconds: number;
  reelsWatched: number;
  watchPoints: number;
  worksheetsDone: number;
  worksheetsPrinted: number;
  videosUploaded: number;
  points: number;
  daysSinceJoined: number;
};

type ReportTotals = {
  students: number;
  teachers: number;
  watchedSeconds: number;
  worksheetsDone: number;
  worksheetsPrinted: number;
  videosUploaded: number;
};

type AnalyticsSummary = {
  topPaths: { path: string; views: number }[];
  daily: { day: string; views: number }[];
  totalViews: number;
  quizzesSolved: number;
};

function reportQuery(role: RoleFilter, grade: GradeFilter, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  if (role !== 'all') params.set('role', role);
  if (grade !== 'all') params.set('grade', grade);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return params.toString();
}

function TotalsStrip({ totals, role }: { totals: ReportTotals; role: 'student' | 'teacher' }) {
  const { t } = useLanguage();
  const items: [string, string | number][] =
    role === 'teacher'
      ? [
          [t('admin.reportTotalTeachers'), totals.teachers],
          [t('admin.reportTotalWatch'), formatWatchTime(totals.watchedSeconds)],
          [t('admin.reportTotalWsDone'), totals.worksheetsDone],
          [t('admin.reportTotalWsPrinted'), totals.worksheetsPrinted],
          [t('admin.reportTotalVideos'), totals.videosUploaded],
        ]
      : [
          [t('admin.reportTotalStudents'), totals.students],
          [t('admin.reportTotalWatch'), formatWatchTime(totals.watchedSeconds)],
          [t('admin.reportTotalWsDone'), totals.worksheetsDone],
        ];
  return (
    <div className="grid-cards" style={{ marginBottom: 16 }}>
      {items.map(([label, value]) => (
        <div key={label} className="stat-card stat-card-blue">
          <div className="stat-card-label">{label}</div>
          <div className="stat-card-value" style={{ fontSize: 22 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function WatchTimeTable({ roleFilter, gradeFilter }: { roleFilter: 'student' | 'teacher'; gradeFilter: GradeFilter }) {
  const { t } = useLanguage();
  const [users, setUsers] = useState<WatchTimeUser[] | null>(null);
  const [totals, setTotals] = useState<ReportTotals | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  // A filter change invalidates the current page number, same as AdminUsersPanel.
  useEffect(() => setPage(1), [roleFilter, gradeFilter]);

  useEffect(() => {
    api
      .get<{ users: WatchTimeUser[]; totals: ReportTotals; totalPages: number }>(
        `/admin/reports/watch-time?${reportQuery(roleFilter, gradeFilter, { page: String(page) })}`
      )
      .then((data) => {
        setUsers(data.users);
        setTotals(data.totals);
        setTotalPages(data.totalPages);
      })
      .catch(() => setUsers([]));
  }, [roleFilter, gradeFilter, page]);

  const isTeacher = roleFilter === 'teacher';
  const th = { padding: '6px 8px' } as const;
  const td = { padding: '6px 8px' } as const;

  return (
    <div className="card">
      <h3 style={{ fontSize: 16, marginBottom: 4 }}>{isTeacher ? t('admin.watchTimeTeachersSection') : t('admin.watchTimeStudentsSection')}</h3>
      <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>
        {isTeacher ? t('admin.watchTimeTeachersSectionSub') : t('admin.watchTimeStudentsSectionSub')}
      </p>

      {totals && users && users.length > 0 && <TotalsStrip totals={totals} role={roleFilter} />}

      {!users && (
        <div className="empty-state">
          <div className="spinner" />
        </div>
      )}
      {users && users.length === 0 && <p className="muted">{t('admin.watchTimeEmpty')}</p>}

      {users && users.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'start' }}>
                <th style={th}>{t('admin.watchTimeColStudent')}</th>
                <th style={th}>{isTeacher ? t('admin.watchTimeColSubject') : t('admin.watchTimeColGrade')}</th>
                <th style={th}>{t('admin.watchTimeColTime')}</th>
                <th style={th}>{t('admin.watchTimeColAvgDay')}</th>
                <th style={th}>{t('admin.watchTimeColAvgMonth')}</th>
                <th style={th}>{t('admin.watchTimeColReels')}</th>
                <th style={th}>{t('admin.watchTimeColWsDone')}</th>
                {isTeacher && <th style={th}>{t('admin.watchTimeColWsPrinted')}</th>}
                {isTeacher && <th style={th}>{t('admin.watchTimeColVideos')}</th>}
                <th style={th}>{t('admin.watchTimeColPoints')}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId} style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                  <td style={td}>
                    {u.displayName} <span className="muted"><bdi dir="ltr">@{u.username}</bdi></span>
                  </td>
                  <td style={td}>
                    {u.role === 'teacher'
                      ? u.teacherSubject
                        ? t(`auth.subject_${u.teacherSubject}` as 'auth.subject_math')
                        : '—'
                      : u.grade ?? '—'}
                  </td>
                  <td style={td}>{formatWatchTime(u.watchedSeconds)}</td>
                  <td style={td}>{formatWatchTime(u.watchedSeconds / u.daysSinceJoined)}</td>
                  <td style={td}>{formatWatchTime(u.watchedSeconds / Math.max(1, u.daysSinceJoined / 30.4375))}</td>
                  <td style={td}>{u.reelsWatched}</td>
                  <td style={td}>{u.worksheetsDone}</td>
                  {isTeacher && <td style={td}>{u.worksheetsPrinted}</td>}
                  {isTeacher && <td style={td}>{u.videosUploaded}</td>}
                  <td style={td}>{u.points}</td>
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
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>{t('admin.analyticsTitle')}</h3>
      <div className="grid-cards" style={{ marginBottom: summary.topPaths.length > 0 ? 16 : 0 }}>
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
      {summary.topPaths.length > 0 && (
        <>
          <p className="muted" style={{ fontSize: 13, marginBottom: 6 }}>{t('admin.analyticsTopPages')}</p>
          <div className="stack" style={{ gap: 4 }}>
            {summary.topPaths.map((p) => (
              <div key={p.path} className="flex" style={{ justifyContent: 'space-between', fontSize: 13.5 }}>
                <code>
                  <bdi dir="ltr">{p.path}</bdi>
                </code>
                <span className="muted">{p.views}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MonthlyWatchSection({ roleFilter, gradeFilter }: { roleFilter: 'student' | 'teacher'; gradeFilter: GradeFilter }) {
  const { t } = useLanguage();
  const [data, setData] = useState<MonthlyWatchTime | null>(null);

  useEffect(() => {
    api
      .get<MonthlyWatchTime>(`/admin/reports/watch-time/monthly?${reportQuery(roleFilter, gradeFilter)}`)
      .then(setData)
      .catch(() => setData(null));
  }, [roleFilter, gradeFilter]);

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

/** Downloads the locked, branded Excel report for the current filters. A plain fetch (not the JSON api
 * helper) because the response is a file. */
export function ExportButton({ gradeFilter }: { gradeFilter: GradeFilter }) {
  const { t, lang } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/export.xlsx?${reportQuery('all', gradeFilter, { lang })}`, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'anees' },
      });
      if (!res.ok) throw new Error(String(res.status));
      const filename = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'Anees-Report.xlsx';
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(t('admin.exportError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
      <button type="button" className="btn btn-primary" onClick={download} disabled={busy}>
        <RiFileExcel2Line size={17} style={{ verticalAlign: -3, marginInlineEnd: 6 }} />
        {busy ? t('admin.exporting') : t('admin.exportExcel')}
      </button>
      {error && <small style={{ color: 'var(--danger, #c0392b)' }} role="alert">{error}</small>}
    </div>
  );
}

export function AdminReportsPanel({ gradeFilter, onGradeChange }: { gradeFilter: GradeFilter; onGradeChange: (g: GradeFilter) => void }) {
  // The grade filter scopes the student sections and the Excel export's student data; teachers have no
  // grade, so their sections always show everyone. It lives in AdminPage because the export button sits
  // in the page header.
  const { t } = useLanguage();

  return (
    <div className="stack">
      <AnalyticsSummaryCard />
      <div className="card">
        <div className="stack" style={{ gap: 4 }}>
          <div className="field" style={{ maxWidth: 220, marginBottom: 0 }}>
            <GradeFilterSelect value={gradeFilter} onChange={onGradeChange} />
          </div>
          <small className="muted">{t('admin.reportGradeNote')}</small>
        </div>
      </div>

      <h2 style={{ fontSize: 20, margin: '8px 0 0' }}>{t('admin.reportTotalStudents')}</h2>
      <MonthlyWatchSection roleFilter="student" gradeFilter={gradeFilter} />
      <WatchTimeTable roleFilter="student" gradeFilter={gradeFilter} />

      <h2 style={{ fontSize: 20, margin: '16px 0 0' }}>{t('admin.reportTotalTeachers')}</h2>
      <MonthlyWatchSection roleFilter="teacher" gradeFilter="all" />
      <WatchTimeTable roleFilter="teacher" gradeFilter="all" />
    </div>
  );
}
