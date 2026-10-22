import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useLanguage } from '../lib/language-context';
import '../styles/difficulty-dial.css';

export type DialOption<K extends string> = { key: K; label: string; xp: string; icon: string };

// The dial from the "Daily UI #007 Button Set" Figma: a ring of tick marks around a raised knob with an indicator
// dot. The ring is cut into three 90deg sections (easy | medium | hard) that run from -135deg to +135deg, with the
// gap at the bottom like a volume knob; the knob rests at the centre of a section (-90, 0, +90).
const SWEEP = 135;
const SECTION = 90;
const GAP = 7;
const R = 88;
const TICKS = Array.from({ length: (2 * SWEEP) / 6 + 1 }, (_, i) => -SWEEP + i * 6);

const polar = (deg: number, r: number) => ({ x: 100 + r * Math.sin((deg * Math.PI) / 180), y: 100 - r * Math.cos((deg * Math.PI) / 180) });
function arc(from: number, to: number) {
  const a = polar(from, R);
  const b = polar(to, R);
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)} A${R},${R} 0 0 1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}
const SECTION_PATHS = [0, 1, 2].map((i) => arc(-SWEEP + i * SECTION + GAP / 2, -SWEEP + (i + 1) * SECTION - GAP / 2));

/** A three-position difficulty control: drag (or tap) the dial to turn it, or use the three labelled options below it,
 * which are the real radio group for keyboards and screen readers (the dial itself is a pointer affordance). */
export function DifficultyDial<K extends string>({ value, options, onChange, label }: { value: K; options: DialOption<K>[]; onChange: (key: K) => void; label: string }) {
  const { dir } = useLanguage();
  const sign = dir === 'rtl' ? -1 : 1; // the dial is mirrored in Arabic so "harder" still reads from the reading-start side
  const stageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null); // the live angle while a pointer is down
  const index = Math.max(0, options.findIndex((o) => o.key === value));
  const current = options[index];
  const angle = drag ?? (index - 1) * SECTION; // logical angle: positive is harder

  function aim(e: PointerEvent<HTMLDivElement>) {
    const box = stageRef.current!.getBoundingClientRect();
    const visual = (Math.atan2(e.clientX - (box.left + box.width / 2), box.top + box.height / 2 - e.clientY) * 180) / Math.PI;
    const a = Math.max(-SWEEP, Math.min(SWEEP, visual * sign));
    setDrag(a);
    const next = options[Math.max(0, Math.min(options.length - 1, Math.round(a / SECTION) + 1))];
    if (next.key !== value) onChange(next.key);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const forward = dir === 'rtl' ? ['ArrowLeft', 'ArrowDown'] : ['ArrowRight', 'ArrowDown'];
    const back = dir === 'rtl' ? ['ArrowRight', 'ArrowUp'] : ['ArrowLeft', 'ArrowUp'];
    const step = forward.includes(e.key) ? 1 : back.includes(e.key) ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(options.length - 1, index + step));
    onChange(options[next].key);
    (e.currentTarget.querySelectorAll('[role="radio"]')[next] as HTMLElement | undefined)?.focus();
  }

  return (
    <div className="dial" data-level={index}>
      <div
        ref={stageRef}
        className={`dial-stage${drag !== null ? ' is-dragging' : ''}`}
        style={{ ['--rot' as string]: `${angle * sign}deg` }}
        aria-hidden="true"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          aim(e);
        }}
        onPointerMove={(e) => drag !== null && aim(e)}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        <svg viewBox="0 0 200 200" className={sign < 0 ? 'is-mirrored' : undefined}>
          {TICKS.map((deg) => {
            const a = polar(deg, 77);
            const b = polar(deg, 80);
            return <line key={deg} className="dial-tick" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
          })}
          {SECTION_PATHS.map((d, i) => (
            <path key={i} d={d} className={`dial-sec${i <= index ? ' is-on' : ''}`} />
          ))}
        </svg>
        <div className="dial-knob">
          <span className="dial-dot" />
        </div>
        <div className="dial-well">
          <span className="dial-icon">{current.icon}</span>
          <span className="dial-name">{current.label}</span>
        </div>
      </div>

      <div className="dial-options" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
        {options.map((o, i) => (
          <button key={o.key} type="button" role="radio" aria-checked={i === index} tabIndex={i === index ? 0 : -1} className="dial-option" onClick={() => onChange(o.key)}>
            <span aria-hidden="true">{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>
      <p className="dial-caption" aria-live="polite">
        {current.xp}
      </p>
    </div>
  );
}
