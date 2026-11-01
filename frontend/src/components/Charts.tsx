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
 * whole; the caller supplies the colours (fixed per entity, never re-dealt when a slice disappears).
 * `stacked` puts a larger ring over a two-column legend, for a narrow card. */
export function DonutChart({ slices, unit, ariaLabel, stacked = false }: { slices: DonutSlice[]; unit: string; ariaLabel: string; stacked?: boolean }) {
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
    <div className="flex" style={{ flexWrap: 'wrap', flexDirection: stacked ? 'column' : 'row', alignItems: 'center', gap: stacked ? 24 : 20 }}>
      <svg
        viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
        style={{ width: stacked ? 216 : 168, height: stacked ? 216 : 168, flex: 'none' }}
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

      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          flex: stacked ? 'none' : '1 1 170px',
          alignSelf: stacked ? 'stretch' : undefined,
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: stacked ? 'repeat(2, minmax(0, 1fr))' : undefined,
          gap: stacked ? '8px 20px' : 6,
        }}
      >
        {arcs.map(({ s }) => (
          <li
            key={s.key}
            {...hoverProps(s.key)}
            style={{ display: 'flex', flexWrap: stacked ? 'wrap' : undefined, alignItems: 'center', gap: stacked ? '2px 8px' : 8, fontSize: 13.5, opacity: active && active !== s.key ? 0.5 : 1, transition: 'opacity 0.15s var(--ease-out)' }}
          >
            <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 3, background: s.color, flex: 'none' }} />
            <span>{s.label}</span>
            <span className="muted" style={{ marginInlineStart: stacked ? 18 : 'auto', flexBasis: stacked ? 'calc(100% - 18px)' : undefined, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontSize: stacked ? 12.5 : undefined }}>
              {s.value} · {pct(s.value)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Area chart -------------------------------------------------------------------------------

const AREA_W = 640;
const AREA_H = 380;
const AREA_M = { top: 16, right: 22, bottom: 32, left: 46 };
const AREA_PW = AREA_W - AREA_M.left - AREA_M.right;
const AREA_PH = AREA_H - AREA_M.top - AREA_M.bottom;
const AREA_BASE = AREA_M.top + AREA_PH;
const TIP_W = 96;
const TIP_H = 52;

/** A gridline step (1, 2, 2.5, 4, 5 or 10 times a power of ten, at least 1) that fits `raw` -- so four steps always land on round numbers. */
function niceStep(raw: number) {
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return Math.max(1, ([1, 2, 2.5, 4, 5, 10].find((m) => n <= m) ?? 10) * p);
}

/** A smooth curve through the points that never overshoots between them (monotone cubic, Fritsch-Carlson), so a quiet day
 * between two busy ones cannot dip below the baseline. */
function smoothPath(pts: [number, number][]) {
  const n = pts.length;
  const dx = pts.slice(1).map((p, i) => p[0] - pts[i][0]);
  const m = pts.slice(1).map((p, i) => (p[1] - pts[i][1]) / dx[i]);
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    d += ` C${x0 + dx[i] / 3},${y0 + (t[i] * dx[i]) / 3} ${x1 - dx[i] / 3},${y1 - (t[i + 1] * dx[i]) / 3} ${x1},${y1}`;
  }
  return d;
}

/** One series as a smooth line over a faded area, a day at a time: the busiest day is marked from the start (so the chart
 * always states a number), and hovering, touching or the arrow keys move the marker and its tip to any other day. Needs at
 * least two points. */
export function AreaChart({ labels, values, format, ariaLabel }: { labels: string[]; values: number[]; format: (value: number) => string; ariaLabel: string }) {
  const uid = useId();
  const [picked, setPicked] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Like BarChart: on a narrow screen the chart scrolls sideways, opening on the newest day.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [labels.length]);

  const n = values.length;
  const peak = Math.max(...values, 0);
  // 30% headroom over the busiest day, so its tip always has room above it
  const step = niceStep(Math.max(peak * 1.3, 1) / 4);
  const max = step * 4;
  const x = (i: number) => AREA_M.left + (i / (n - 1)) * AREA_PW;
  const y = (v: number) => AREA_BASE - (v / max) * AREA_PH;
  const line = smoothPath(values.map((v, i) => [x(i), y(v)]));
  const active = picked ?? (peak > 0 ? values.indexOf(peak) : n - 1);
  const labelEvery = Math.ceil(n / 7);

  const px = x(active);
  const py = y(values[active]);
  const tipX = Math.min(Math.max(px - TIP_W / 2, AREA_M.left), AREA_W - TIP_W - 2); // never over the axis numbers
  const tail = Math.min(Math.max(px, tipX + 16), tipX + TIP_W - 16);
  const tipAbove = py - TIP_H - 16 >= 0;
  const tipY = tipAbove ? py - TIP_H - 14 : py + 14;

  const pick = (e: React.PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const at = ((e.clientX - box.left) / box.width) * AREA_W;
    setPicked(Math.min(n - 1, Math.max(0, Math.round(((at - AREA_M.left) / AREA_PW) * (n - 1)))));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const to = e.key === 'ArrowLeft' ? active - 1 : e.key === 'ArrowRight' ? active + 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (to === null) return;
    e.preventDefault();
    setPicked(Math.min(n - 1, Math.max(0, to)));
  };

  return (
    <div ref={scrollRef} dir="ltr" style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${AREA_W} ${AREA_H}`}
        style={{ width: '100%', minWidth: 480, height: 'auto', display: 'block' }}
        role="img"
        aria-label={`${ariaLabel}: ${labels.map((l, i) => `${l} ${format(values[i])}`).join(', ')}`}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setPicked(null)}
      >
        <defs>
          <linearGradient id={`${uid}h`} gradientUnits="userSpaceOnUse" x1={AREA_M.left} x2={AREA_M.left + AREA_PW} y1="0" y2="0">
            <stop offset="0%" stopColor="var(--viz-5)" />
            <stop offset="100%" stopColor="var(--viz-1)" />
          </linearGradient>
          <linearGradient id={`${uid}v`} x1="0" x2="0" y1={AREA_M.top} y2={AREA_BASE} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.03" />
          </linearGradient>
          <mask id={`${uid}m`}>
            <rect x="0" y="0" width={AREA_W} height={AREA_H} fill={`url(#${uid}v)`} />
          </mask>
        </defs>

        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <line x1={AREA_M.left} y1={y(i * step)} x2={AREA_M.left + AREA_PW} y2={y(i * step)} stroke="var(--sand-dark)" strokeWidth={1} />
            <text x={AREA_M.left - 8} y={y(i * step)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-soft)">
              {format(i * step)}
            </text>
          </g>
        ))}

        <path d={`${line} L${x(n - 1)},${AREA_BASE} L${x(0)},${AREA_BASE} Z`} fill={`url(#${uid}h)`} mask={`url(#${uid}m)`} />
        <path d={line} fill="none" stroke={`url(#${uid}h)`} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {labels.map((label, i) =>
          (n - 1 - i) % labelEvery === 0 ? (
            <text key={i} x={x(i)} y={AREA_BASE + 20} textAnchor="middle" fontSize={11} fill="var(--ink-soft)" fontWeight={i === active ? 800 : 400}>
              {label}
            </text>
          ) : null
        )}

        <line x1={px} y1={py} x2={px} y2={AREA_BASE} stroke="var(--maroon)" strokeWidth={1.5} strokeDasharray="3 4" opacity={0.7} />
        <circle cx={px} cy={py} r={6.5} fill="#fff" stroke="var(--maroon)" strokeWidth={3} />
        <g pointerEvents="none">
          <rect x={tipX} y={tipY} width={TIP_W} height={TIP_H} rx={9} fill="var(--maroon)" />
          <path
            d={tipAbove ? `M${tail - 7},${tipY + TIP_H - 0.5} L${tail},${tipY + TIP_H + 7} L${tail + 7},${tipY + TIP_H - 0.5} Z` : `M${tail - 7},${tipY + 0.5} L${tail},${tipY - 7} L${tail + 7},${tipY + 0.5} Z`}
            fill="var(--maroon)"
          />
          <text x={tipX + TIP_W / 2} y={tipY + 20} textAnchor="middle" fontSize={11} fill="#fff" opacity={0.85}>
            {labels[active]}
          </text>
          <text x={tipX + TIP_W / 2} y={tipY + 40} textAnchor="middle" fontSize={16} fontWeight={800} fill="#fff">
            {format(values[active])}
          </text>
        </g>

        {/* One transparent target over the plot: a pointer anywhere on it picks the nearest day. */}
        <rect x={AREA_M.left} y={AREA_M.top} width={AREA_PW} height={AREA_PH + 24} fill="transparent" onPointerMove={pick} onPointerDown={pick} onPointerLeave={() => setPicked(null)} />
      </svg>
    </div>
  );
}
