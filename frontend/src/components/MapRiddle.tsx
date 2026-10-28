import { lazy, Suspense, useId, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { m } from 'framer-motion';
import { useLanguage } from '../lib/language-context';
import { parchmentDataUrl } from './story3d/textures';
import { AvatarBoundary } from './avatar3d/AvatarBoundary';
import { canUseWebGL, isLowPower } from './avatar3d/avatarConfig';

// The riddle that comes right after the second half of the treasure map is won (level 30): it is not a level. It is a Grade 5
// math problem shaped like a map: a number is written on each of the four roads, and the road with the answer leads to the
// treasure. A wrong try only shakes the road (after two the window gives a hint); the right one draws the road to the X.

// The 3D map (a parchment unrolled on a desk, with the four places as little models) when the device can draw WebGL; the flat map below
// is the fallback for any other device and for a 3D chunk that fails to load.
const RiddleScene3D = lazy(() => import('./story3d/RiddleScene3D'));

type Tr = (key: string, vars?: Record<string, string | number>) => string;
type Way = 'n' | 'e' | 's' | 'w';

/** Where each place sits on the 340 x 280 map. */
const SPOTS: Record<Way, { x: number; y: number }> = { n: { x: 170, y: 52 }, e: { x: 290, y: 122 }, s: { x: 170, y: 206 }, w: { x: 50, y: 122 } };

/** Grade 5 problems (decimals, fractions, area, division, order of operations). Each road carries a number; `right` is the answer. */
const RIDDLES: readonly { id: number; roads: Record<Way, string>; right: Way }[] = [
  { id: 1, roads: { n: '8.5', e: '15', s: '12', w: '150' }, right: 'e' },
  { id: 2, roads: { n: '6', e: '5', s: '24', w: '3' }, right: 'n' },
  { id: 3, roads: { n: '40', e: '20', s: '96', w: '108' }, right: 's' },
  { id: 4, roads: { n: '5.9', e: '49', s: '4.5', w: '4.9' }, right: 'w' },
  { id: 5, roads: { n: '20', e: '27', s: '14', w: '8' }, right: 'n' },
];
const START = { x: 170, y: 122 };
const INK = '#6b4118';

/** A small picture for each place, drawn around (0, 0). */
const ICONS: Record<Way, ReactNode> = {
  n: (
    <>
      <path d="M-16 10 L-4 -12 L6 4 L12 -4 L20 10 Z" fill="#8c8f98" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M-4 -12 L-9 -3 L-4 -5 L0 -2 Z" fill="#fff" />
      <path d="M-2 -6 q4 -3 8 0" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  e: (
    <>
      <path d="M-18 4 q4.5 -5 9 0 t9 0 t9 0 t9 0" fill="none" stroke="#3f7fb8" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M-18 11 q4.5 -5 9 0 t9 0 t9 0 t9 0" fill="none" stroke="#6aa6d6" strokeWidth="2" strokeLinecap="round" />
      <circle cx="0" cy="-5" r="6" fill="#fffaf0" stroke="#b9a37a" strokeWidth="1.2" />
      <circle cx="-2" cy="-7" r="1.8" fill="#fff" />
    </>
  ),
  s: (
    <>
      <path d="M-16 10 L0 -12 L16 10 Z" fill="#b5332c" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M-8 10 L0 -12 L8 10 Z" fill="#f0d9a8" />
      <path d="M-4 10 V2 H4 V10" fill={INK} opacity="0.7" />
    </>
  ),
  w: (
    <>
      <ellipse cx="2" cy="10" rx="14" ry="4.5" fill="#6aa6d6" stroke="#3f7fb8" strokeWidth="1.2" />
      <path d="M-4 8 Q-6 -4 -2 -12" fill="none" stroke="#7a5230" strokeWidth="3" strokeLinecap="round" />
      <path d="M-2 -12 q-8 -2 -12 4 M-2 -12 q8 -3 14 3 M-2 -12 q-2 -8 6 -9 M-2 -12 q-8 -6 -14 -2" fill="none" stroke="#3f8f4a" strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
};

export function MapRiddle({ onSolved, onLater }: { onSolved: () => void; onLater: () => void }) {
  const { t } = useLanguage();
  const s: Tr = (key, vars) => (t as unknown as Tr)(`story.${key}`, vars);
  const u = useId().replace(/[^a-zA-Z0-9]/g, '');
  const riddle = useMemo(() => RIDDLES[Math.floor(Math.random() * RIDDLES.length)], []);
  const answer = riddle.right;
  const use3d = useMemo(() => canUseWebGL() && !isLowPower(), []);
  const still = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  // real old paper, painted once on a canvas
  const paper = useMemo(() => parchmentDataUrl(680, 560, 21), []);
  const tilt = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 12}deg`);
    e.currentTarget.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 9}deg`);
  };
  const untilt = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty('--ry', '0deg');
    e.currentTarget.style.setProperty('--rx', '0deg');
  };
  const [wrongs, setWrongs] = useState(0);
  const [lastWrong, setLastWrong] = useState<Way | null>(null);
  const [solved, setSolved] = useState(false);

  function pick(way: Way) {
    if (solved) return;
    if (way === answer) {
      setSolved(true);
    } else {
      setWrongs((n) => n + 1);
      setLastWrong(way);
    }
  }

  const status = solved ? s('riddleRight') : lastWrong ? s('riddleWrong', { value: riddle.roads[lastWrong] }) : s('riddleAsk');
  // the road to the right place stops at the edge of its circle
  const target = SPOTS[answer];
  const len = Math.hypot(target.x - START.x, target.y - START.y);
  const endX = target.x - ((target.x - START.x) / len) * 30;
  const endY = target.y - ((target.y - START.y) / len) * 30;
  const road = `M${START.x} ${START.y} Q${(START.x + endX) / 2 + (target.y - START.y) * 0.12} ${(START.y + endY) / 2 - (target.x - START.x) * 0.12} ${endX} ${endY}`;

  const flatMap = (
        <div className="riddle-tilt" onPointerMove={tilt} onPointerLeave={untilt}>
        <svg className="riddle-map" viewBox="0 0 340 280" role="group" aria-label={s('riddleMap')}>
          <defs>
            <radialGradient id={`${u}paper`} cx="0.45" cy="0.4" r="0.85">
              <stop offset="0" stopColor="#fdf3d2" />
              <stop offset="0.75" stopColor="#ebd196" />
              <stop offset="1" stopColor="#cfa965" />
            </radialGradient>
            <filter id={`${u}grain`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
              <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.08  0 0 0 0.55 0" result="t" />
              <feComposite in="t" in2="SourceGraphic" operator="in" />
            </filter>
            <filter id={`${u}shadow`} x="-10%" y="-10%" width="120%" height="125%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.4" />
            </filter>
            <clipPath id={`${u}clip`}>
              <rect x="6" y="6" width="328" height="268" rx="10" />
            </clipPath>
            <radialGradient id={`${u}vig`} cx="0.5" cy="0.5" r="0.7">
              <stop offset="0.6" stopColor="#5a3410" stopOpacity="0" />
              <stop offset="1" stopColor="#5a3410" stopOpacity="0.55" />
            </radialGradient>
            <linearGradient id={`${u}wood`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#9a6330" />
              <stop offset="1" stopColor="#5e3517" />
            </linearGradient>
          </defs>

          <g filter={`url(#${u}shadow)`}>
            <image href={paper} x="6" y="6" width="328" height="268" preserveAspectRatio="none" clipPath={`url(#${u}clip)`} />
            <rect x="6" y="6" width="328" height="268" rx="10" fill={`url(#${u}vig)`} />
            <rect x="6" y="6" width="328" height="268" rx="10" fill="none" stroke="#7a4f20" strokeWidth="2.5" opacity="0.85" />
          </g>
          {/* the seam where the two halves were joined */}
          <path d="M170 8 L164 40 L176 70 L165 100 L175 130 L166 160 L174 190 L170 272" fill="none" stroke="#a97c3a" strokeWidth="1.2" strokeDasharray="3 4" opacity="0.5" />

          {/* the crossroads: a dotted road to every place */}
          {(Object.keys(SPOTS) as Way[]).map((w) => (
            <path key={w} d={`M${START.x} ${START.y} L${SPOTS[w].x} ${SPOTS[w].y}`} stroke={INK} strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" opacity="0.55" />
          ))}

          {/* the compass */}
          <g transform="translate(40 40)" opacity="0.9">
            <circle r="17" fill="none" stroke={INK} strokeWidth="1.3" />
            <m.g animate={{ rotate: [-14, 12, -8, 6, -14] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
              <path d="M0 -15 L3 0 L0 15 L-3 0 Z" fill={INK} opacity="0.75" />
              <path d="M-15 0 L0 -3 L15 0 L0 3 Z" fill={INK} opacity="0.45" />
              <path d="M0 -15 L3 0 L-3 0 Z" fill="#c0392b" />
            </m.g>
            <text y="-20" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={INK}>
              {s('dirN')}
            </text>
            <text x="35" y="3" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={INK}>
              {s('dirE')}
            </text>
          </g>

          {/* a falcon crosses the map now and then */}
          <m.path d="M0 0 q5 -7 10 0 q5 -7 10 0 q-10 4 -20 0 z" fill="#4a3a28" opacity="0.45" initial={{ x: -30, y: 70 }} animate={{ x: 370, y: [70, 58, 76] }} transition={{ duration: 11, repeat: Infinity, ease: 'linear', repeatDelay: 3 }} />

          {/* where you stand */}
          <g transform={`translate(${START.x} ${START.y})`}>
            <circle r="9" fill="#8a1538" stroke="#fff3c9" strokeWidth="2" />
            <path d="M0 -4 L1.4 -1.2 L4.3 -0.8 L2.1 1.2 L2.7 4 L0 2.5 L-2.7 4 L-2.1 1.2 L-4.3 -0.8 L-1.4 -1.2 Z" fill="#fff3c9" />
          </g>

          {/* the road to the X, drawn once the riddle is solved */}
          {solved && (
            <>
              <m.path d={road} fill="none" stroke="#c0392b" strokeWidth="3.4" strokeDasharray="7 6" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: 'easeInOut' }} />
              <g transform={`translate(${target.x + 25} ${target.y - 25})`}>
                <m.path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke="#c0392b" strokeWidth="5" strokeLinecap="round" initial={{ opacity: 0, scale: 0.2 }} animate={{ opacity: 1, scale: [0.2, 1.4, 1] }} transition={{ delay: 1.3, duration: 0.5 }} />
              </g>
            </>
          )}

          {/* the four places: real buttons for the keyboard too */}
          {(Object.keys(SPOTS) as Way[]).map((w) => {
            const { x, y } = SPOTS[w];
            return (
              <g key={`${w}${lastWrong === w ? wrongs : 0}`} transform={`translate(${x} ${y})`}>
                <m.g
                  className="riddle-spot"
                  role="button"
                  tabIndex={0}
                  aria-label={s(`place_${w}`)}
                  onClick={() => pick(w)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      pick(w);
                    }
                  }}
                  animate={lastWrong === w && !solved ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.94 }}
                  transition={{ duration: 0.4 }}
                  style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                >
                  <circle className="riddle-halo" r="27" fill={solved && w === answer ? '#ffe08a' : '#fff6d8'} opacity={solved && w === answer ? 0.8 : 0.55} stroke={lastWrong === w && !solved ? '#c0392b' : '#9a6a2c'} strokeWidth="1.6" />
                  {ICONS[w]}
                  <text y="41" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={INK} opacity="0.8">
                    {s(`place_${w}`)}
                  </text>
                  <rect x="-25" y="46" width="50" height="20" rx="6" fill={`url(#${u}wood)`} stroke="#3b2210" strokeWidth="1.4" />
                  <path d="M-22 50 H22" stroke="#fff" strokeWidth="0.8" opacity="0.25" />
                  <text y="60.5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fdf3d2" direction="ltr">
                    {riddle.roads[w]}
                  </text>
                </m.g>
              </g>
            );
          })}
        </svg>
        </div>
  );

  return createPortal(
    <m.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <m.div
        className="modal-panel story-window riddle-window"
        role="dialog"
        aria-modal="true"
        aria-label={s('riddleTitle')}
        initial={{ scale: 0.88, y: 24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      >
        <h2>{s('riddleTitle')}</h2>
        <p className="riddle-sub">{s('riddleSub')}</p>
        <p className="riddle-q">{s(`riddle${riddle.id}Q`)}</p>

        {use3d ? (
          <AvatarBoundary fallback={flatMap}>
            <Suspense fallback={flatMap}>
              <RiddleScene3D
                roads={riddle.roads}
                names={{ n: s('place_n'), e: s('place_e'), s: s('place_s'), w: s('place_w') }}
                answer={answer}
                solved={solved}
                wrongWay={lastWrong}
                wrongTick={wrongs}
                onPick={pick}
                still={still}
              />
            </Suspense>
          </AvatarBoundary>
        ) : (
          flatMap
        )}

        <p className={`riddle-status${solved ? ' is-right' : lastWrong ? ' is-wrong' : ''}`} role="status">
          {status}
        </p>
        {wrongs >= 2 && !solved && <p className="riddle-hint">💡 {s(`riddle${riddle.id}H`)}</p>}

        {solved ? (
          <button type="button" className="btn btn-primary" onClick={onSolved} autoFocus>
            {s('gotIt')}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={onLater}>
            {s('later')}
          </button>
        )}
      </m.div>
    </m.div>,
    document.body
  );
}
