import { useId, useState } from 'react';
import { useLanguage } from '../lib/language-context';
import { formatWatchTime } from '../lib/format';

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

/** A `<rect>` can only round every corner together -- a bar needs the top rounded and the
 * baseline square, so it's built as a path instead. */
function roundedTopBarPath(x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height));
  if (height <= 0) return '';
  return `M${x},${y + height} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + width - r},${y} Q${x + width},${y} ${x + width},${y + r} L${x + width},${y + height} Z`;
}

const CHART_W = 640;
const CHART_H = 220;
const MARGIN = { top: 16, right: 8, bottom: 28, left: 52 };
const PLOT_W = CHART_W - MARGIN.left - MARGIN.right;
const PLOT_H = CHART_H - MARGIN.top - MARGIN.bottom;
const BASELINE_Y = MARGIN.top + PLOT_H;

/** Total watch time per month, all matching students -- a single series, so no legend
 * (the card title already says what's plotted, per the dataviz skill's mark rules). */
export function MonthlyTotalChart({ months, totalsBySecond }: { months: string[]; totalsBySecond: number[] }) {
  const { lang } = useLanguage();
  const gradId = useId();
  const [hovered, setHovered] = useState<number | null>(null);

  const max = Math.max(...totalsBySecond, 1);
  const bandWidth = PLOT_W / months.length;
  const barWidth = Math.min(24, bandWidth * 0.6);
  const gridFracs = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Monthly total watch time">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--maroon-light)" />
          <stop offset="100%" stopColor="var(--maroon)" />
        </linearGradient>
      </defs>

      {gridFracs.map((f) => {
        const y = BASELINE_Y - f * PLOT_H;
        return (
          <g key={f}>
            <line x1={MARGIN.left} y1={y} x2={MARGIN.left + PLOT_W} y2={y} stroke="var(--sand-dark)" strokeWidth={1} />
            <text x={MARGIN.left - 6} y={y} dy="0.32em" textAnchor="end" fontSize={10} fill="var(--ink-soft)">
              {formatWatchTime(max * f)}
            </text>
          </g>
        );
      })}

      {months.map((m, i) => {
        const value = totalsBySecond[i] ?? 0;
        const barHeight = (value / max) * PLOT_H;
        const x = MARGIN.left + i * bandWidth + (bandWidth - barWidth) / 2;
        const y = BASELINE_Y - barHeight;
        const isHovered = hovered === i;
        return (
          <g
            key={m}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
            tabIndex={0}
            style={{ cursor: 'pointer', outline: 'none' }}
          >
            {/* Invisible full-band hit target -- the bar itself is often much thinner than
                its band (see marks-and-anatomy: hit target bigger than the mark). */}
            <rect x={MARGIN.left + i * bandWidth} y={MARGIN.top} width={bandWidth} height={PLOT_H} fill="transparent" />
            <path d={roundedTopBarPath(x, y, barWidth, barHeight, 4)} fill={`url(#${gradId})`} opacity={isHovered ? 1 : 0.88}>
              <title>{`${monthLabel(m, lang)} — ${formatWatchTime(value)}`}</title>
            </path>
            <text x={MARGIN.left + i * bandWidth + bandWidth / 2} y={BASELINE_Y + 16} textAnchor="middle" fontSize={11} fill="var(--ink-soft)" fontWeight={isHovered ? 800 : 400}>
              {monthLabel(m, lang)}
            </text>
            {isHovered && (
              <text x={MARGIN.left + i * bandWidth + bandWidth / 2} y={Math.max(10, y - 6)} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--ink)">
                {formatWatchTime(value)}
              </text>
            )}
          </g>
        );
      })}

      <line x1={MARGIN.left} y1={BASELINE_Y} x2={MARGIN.left + PLOT_W} y2={BASELINE_Y} stroke="var(--ink-soft)" strokeWidth={1} />
    </svg>
  );
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
                  {s.displayName} <span className="muted">@{s.username}</span>
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
