import { useLanguage } from '../lib/language-context';
import { formatWatchTime } from '../lib/format';
import { BarChart } from './Charts';

export type MonthlyWatchTime = {
  months: string[];
  totalsBySecond: number[];
  students: { userId: number; username: string; displayName: string; grade: number | null; monthly: number[] }[];
  studentCount: number;
};

/** 'YYYY-MM' -> a short localized month label ("Apr" / "أبريل"). */
function monthLabel(monthKey: string, lang: 'en' | 'ar') {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-QA' : 'en-US', { month: 'short' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** Total watch time per month, all matching students. */
export function MonthlyTotalChart({ months, totalsBySecond }: { months: string[]; totalsBySecond: number[] }) {
  const { t, lang } = useLanguage();
  return <BarChart labels={months.map((m) => monthLabel(m, lang))} values={totalsBySecond} format={formatWatchTime} ariaLabel={t('admin.watchTimeMonthlyTitle')} />;
}

const CELL = 34;

/** Students (rows) x months (columns), color intensity = watch time -- the standard
 * grid form for "compare magnitude across many series over time" (a line per student
 * would be unreadable past a handful). One sequential hue, no legend box needed since
 * the low/high strip below the grid already carries the scale. */
export function StudentWatchHeatmap({ months, students }: { months: string[]; students: MonthlyWatchTime['students'] }) {
  const { t, lang } = useLanguage();
  const max = Math.max(...students.flatMap((s) => s.monthly), 1);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', insetInlineStart: 0, background: 'var(--glass-bg-strong)', padding: '4px 10px', textAlign: 'start' }}>
                {t('admin.watchTimeColStudent')}
              </th>
              {months.map((m) => (
                <th key={m} style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--ink-soft)', minWidth: CELL }}>
                  {monthLabel(m, lang)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.userId}>
                <td style={{ position: 'sticky', insetInlineStart: 0, background: 'var(--glass-bg-strong)', padding: '4px 10px', whiteSpace: 'nowrap' }}>
                  {s.displayName} <span className="muted"><bdi dir="ltr">@{s.username}</bdi></span>
                </td>
                {s.monthly.map((seconds, i) => {
                  const pct = seconds > 0 ? Math.max(10, Math.round((seconds / max) * 100)) : 0;
                  return (
                    <td key={months[i]} style={{ padding: 0 }}>
                      <div
                        title={`${s.displayName} · ${monthLabel(months[i], lang)} — ${formatWatchTime(seconds)}`}
                        style={{
                          width: CELL,
                          height: CELL,
                          borderRadius: 6,
                          background: pct > 0 ? `color-mix(in srgb, var(--maroon) ${pct}%, var(--surface-chip))` : 'var(--surface-chip)',
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-sm" style={{ alignItems: 'center', fontSize: 11, color: 'var(--ink-soft)' }}>
        <span>{t('admin.watchTimeScaleLess')}</span>
        <div style={{ display: 'flex', width: 90, height: 10, borderRadius: 5, overflow: 'hidden' }}>
          {[10, 30, 55, 80, 100].map((pct) => (
            <div key={pct} style={{ flex: 1, background: `color-mix(in srgb, var(--maroon) ${pct}%, var(--surface-chip))` }} />
          ))}
        </div>
        <span>{t('admin.watchTimeScaleMore')}</span>
      </div>
    </div>
  );
}
