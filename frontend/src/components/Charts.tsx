import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

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

/** One series as columns -- a single series, so no legend (the card title already says what is
 * plotted, per the dataviz skill's mark rules). `integer` rounds the top gridline up to a multiple
 * of four so a small count never lands the four gridlines on fractions. Long series thin their axis
 * labels (the newest always stays); the hovered or focused bar always shows its own. */
export function BarChart({ labels, values, format, ariaLabel, integer = false }: { labels: string[]; values: number[]; format: (value: number) => string; ariaLabel: string; integer?: boolean }) {
  const gradId = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  // On a narrow screen the chart scrolls sideways: open on the newest column (the one that matters),
  // and keep the scroller left-to-right even in Arabic -- in RTL it would start at the far end and
  // clip the axis labels. The axis and columns are drawn left-to-right in both languages anyway.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [labels.length]);

  const peak = Math.max(...values, 1);
  const max = integer ? Math.ceil(peak / 4) * 4 : peak;
  const bandWidth = PLOT_W / labels.length;
  const barWidth = Math.min(24, bandWidth * 0.6);
  const labelEvery = Math.ceil(labels.length / 12);
  const gridFracs = [0, 0.25, 0.5, 0.75, 1];

  // minWidth keeps the axis labels at their real size on a phone; the card scrolls sideways instead of shrinking them to ~4px.
  return (
    <div ref={scrollRef} dir="ltr" style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ width: '100%', minWidth: CHART_W, height: 'auto' }}
        role="img"
        aria-label={`${ariaLabel}: ${labels.map((l, i) => `${l} ${format(values[i] ?? 0)}`).join(', ')}`}
      >
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
                {format(max * f)}
              </text>
            </g>
          );
        })}

        {labels.map((label, i) => {
          const value = values[i] ?? 0;
          const barHeight = (value / max) * PLOT_H;
          const x = MARGIN.left + i * bandWidth + (bandWidth - barWidth) / 2;
          const y = BASELINE_Y - barHeight;
          const isHovered = hovered === i;
          return (
            <g
              key={i}
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
                <title>{`${label} — ${format(value)}`}</title>
              </path>
              {(isHovered || (labels.length - 1 - i) % labelEvery === 0) && (
                <text x={MARGIN.left + i * bandWidth + bandWidth / 2} y={BASELINE_Y + 16} textAnchor="middle" fontSize={11} fill="var(--ink-soft)" fontWeight={isHovered ? 800 : 400}>
                  {label}
                </text>
              )}
              {isHovered && (
                <text x={MARGIN.left + i * bandWidth + bandWidth / 2} y={Math.max(10, y - 6)} textAnchor="middle" fontSize={11} fontWeight={800} fill="var(--ink)">
                  {format(value)}
                </text>
              )}
            </g>
          );
        })}

        <line x1={MARGIN.left} y1={BASELINE_Y} x2={MARGIN.left + PLOT_W} y2={BASELINE_Y} stroke="var(--ink-soft)" strokeWidth={1} />
      </svg>
    </div>
  );
}

/** Ranked rows -- a label, a thin bar scaled to the largest row, the count. Horizontal because the
 * labels (page paths) are long; HTML rather than SVG so they wrap and truncate like any text. */
export function HBarList({ rows }: { rows: { key: string; label: ReactNode; value: number }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, 160px) minmax(0, 1fr) 48px', alignItems: 'center', gap: 12, fontSize: 13.5 }}>
          <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</code>
          <div style={{ height: 10, borderRadius: 5, background: 'var(--surface-chip)' }}>
            <div style={{ width: `${(r.value / max) * 100}%`, minWidth: 4, height: '100%', borderRadius: 5, background: 'linear-gradient(90deg, var(--maroon-light), var(--maroon))' }} />
          </div>
          <span className="muted" style={{ textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export type DonutSlice = { key: string; label: string; value: number; color: string };

const DONUT_SIZE = 120;
const DONUT_R = 44;
const DONUT_STROKE = 14;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;
const DONUT_GAP = 2; // the surface-colour gap between touching slices

/** Part-to-whole as a ring, with the total (or the hovered/focused slice) in the middle and a legend
 * that carries every label, value and share -- hover never gates a number. Meant for 3-6 slices of a
 * whole; the caller supplies the colours (fixed per entity, never re-dealt when a slice disappears). */
export function DonutChart({ slices, unit, ariaLabel }: { slices: DonutSlice[]; unit: string; ariaLabel: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const gap = slices.length > 1 ? DONUT_GAP : 0;
  const share = (v: number) => (v / total) * 100;
  const pct = (v: number) => (share(v) < 1 ? '<1%' : `${Math.round(share(v))}%`);
  const shown = slices.find((s) => s.key === active);

  let offset = 0;
  const arcs = slices.map((s) => {
    const len = (s.value / total) * DONUT_CIRC;
    const arc = { s, len, offset };
    offset += len;
    return arc;
  });

  const hoverProps = (key: string) => ({
    onMouseEnter: () => setActive(key),
    onMouseLeave: () => setActive(null),
    onFocus: () => setActive(key),
    onBlur: () => setActive(null),
  });

  return (
    <div className="flex" style={{ flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
      <svg
        viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
        style={{ width: 168, height: 168, flex: 'none' }}
        role="img"
        aria-label={`${ariaLabel}: ${slices.map((s) => `${s.label} ${s.value} (${pct(s.value)})`).join(', ')}`}
      >
        {arcs.map(({ s, len, offset: start }) => (
          <circle
            key={s.key}
            cx={DONUT_SIZE / 2}
            cy={DONUT_SIZE / 2}
            r={DONUT_R}
            fill="none"
            stroke={s.color}
            strokeWidth={DONUT_STROKE}
            strokeDasharray={`${Math.max(len - gap, 0.5)} ${DONUT_CIRC}`}
            strokeDashoffset={-(start + gap / 2)}
            transform={`rotate(-90 ${DONUT_SIZE / 2} ${DONUT_SIZE / 2})`}
            opacity={active && active !== s.key ? 0.4 : 1}
            tabIndex={0}
            style={{ cursor: 'pointer', outline: 'none', transition: 'opacity 0.15s var(--ease-out)' }}
            {...hoverProps(s.key)}
          >
            <title>{`${s.label} — ${s.value} (${pct(s.value)})`}</title>
          </circle>
        ))}
        <text x={DONUT_SIZE / 2} y={55} textAnchor="middle" fontSize={17} fontWeight={800} fill="var(--ink)">
          {shown ? shown.value : total}
        </text>
        <text x={DONUT_SIZE / 2} y={70} textAnchor="middle" fontSize={8.5} fill="var(--ink-soft)">
          {shown ? shown.label : unit}
        </text>
      </svg>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, flex: '1 1 170px', minWidth: 0, display: 'grid', gap: 6 }}>
        {arcs.map(({ s }) => (
          <li
            key={s.key}
            {...hoverProps(s.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, opacity: active && active !== s.key ? 0.5 : 1, transition: 'opacity 0.15s var(--ease-out)' }}
          >
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: 'none' }} />
            <span>{s.label}</span>
            <span className="muted" style={{ marginInlineStart: 'auto', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {s.value} · {pct(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
