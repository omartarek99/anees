import { useId } from 'react';
import { m } from 'framer-motion';
import { SHIELD_PATH, STAR_PATH } from './VictoryShield';

// The pictures in the story windows (see StoryPanel.tsx): a treasure chest that opens and lets out half of a treasure map
// (twice, one half each), the ring of power, and the final scene where the two halves join, the ring glows and the chest
// gives up the shield. Plain SVG with gradients, soft shadows, wood grain and paper grain for a solid, lit look; the motion
// is a one-time reveal followed by gentle idle life (turning light rays, twinkling sparkles, a floating map, a sheen on the metal).

/** Ids inside one <svg> must not clash with another copy on the page. */
function useUid() {
  return useId().replace(/[^a-zA-Z0-9]/g, '');
}

const INK = '#6b4118';
const RED = '#c0392b';
const loop = { repeat: Infinity, ease: 'easeInOut' } as const;

/** Every gradient and filter the pictures use. */
function Defs({ u }: { u: string }) {
  return (
    <defs>
      <linearGradient id={`${u}wood`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#b07440" />
        <stop offset="1" stopColor="#6a3f1d" />
      </linearGradient>
      <linearGradient id={`${u}woodDark`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5e3517" />
        <stop offset="1" stopColor="#35200d" />
      </linearGradient>
      <linearGradient id={`${u}lining`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7a1f2a" />
        <stop offset="1" stopColor="#3d0f16" />
      </linearGradient>
      <linearGradient id={`${u}gold`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff1b8" />
        <stop offset="0.35" stopColor="#f7c948" />
        <stop offset="0.7" stopColor="#c98a1c" />
        <stop offset="1" stopColor="#f0be45" />
      </linearGradient>
      <radialGradient id={`${u}paper`} cx="0.45" cy="0.4" r="0.8">
        <stop offset="0" stopColor="#fdf3d2" />
        <stop offset="0.7" stopColor="#ebd196" />
        <stop offset="1" stopColor="#cfa965" />
      </radialGradient>
      <radialGradient id={`${u}glow`}>
        <stop offset="0" stopColor="#ffe08a" stopOpacity="0.95" />
        <stop offset="0.5" stopColor="#f6b73c" stopOpacity="0.35" />
        <stop offset="1" stopColor="#f6b73c" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${u}gem`} cx="0.35" cy="0.3" r="0.9">
        <stop offset="0" stopColor="#ffb3a6" />
        <stop offset="0.45" stopColor="#d8352a" />
        <stop offset="1" stopColor="#7d1810" />
      </radialGradient>
      <linearGradient id={`${u}sheen`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0.75" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
      <filter id={`${u}shadow`} x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.45" />
      </filter>
      {/* a faint paper / wood grain, only inside the shape it is drawn on */}
      <filter id={`${u}grain`} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.08  0 0 0 0.55 0" result="t" />
        <feComposite in="t" in2="SourceGraphic" operator="in" />
      </filter>
      <clipPath id={`${u}shieldClip`}>
        <path d={SHIELD_PATH} />
      </clipPath>
    </defs>
  );
}

/** A four-point star that twinkles. */
const SPARK = 'M0 -9 Q1.4 -1.4 9 0 Q1.4 1.4 0 9 Q-1.4 1.4 -9 0 Q-1.4 -1.4 0 -9 Z';
function Sparkles({ spots, delay = 0 }: { spots: readonly (readonly [x: number, y: number, size: number])[]; delay?: number }) {
  return (
    <>
      {spots.map(([x, y, size], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <m.path
            d={SPARK}
            fill="#fff6cf"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0], scale: [0.2, size, 0.2], rotate: [0, 45, 90] }}
            transition={{ duration: 1.8, delay: delay + i * 0.37, ...loop }}
          />
        </g>
      ))}
    </>
  );
}

/** Light rays turning slowly behind the treasure. */
function Rays({ u, cx, cy, r, delay }: { u: string; cx: number; cy: number; r: number; delay: number }) {
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const w = 0.1;
    const p = (ang: number) => `${(cx + Math.cos(ang) * r).toFixed(1)} ${(cy + Math.sin(ang) * r).toFixed(1)}`;
    return `M${cx} ${cy} L${p(a - w)} L${p(a + w)} Z`;
  });
  return (
    <m.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, rotate: 360 }}
      transition={{ opacity: { delay, duration: 0.8 }, rotate: { duration: 28, repeat: Infinity, ease: 'linear' } }}
      style={{ originX: `${cx}px`, originY: `${cy}px` }}
    >
      {rays.map((d, i) => (
        <path key={i} d={d} fill="#ffd96a" opacity="0.2" />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.62} fill={`url(#${u}glow)`} />
    </m.g>
  );
}

/** One half of the treasure map, 70 wide and 56 tall around its own origin. `a` has its torn edge on the right, `b` on the left. */
function MapHalf({ u, side, delay }: { u: string; side: 'a' | 'b'; delay: number }) {
  const a = side === 'a';
  const shape = a
    ? 'M-35 -28 H35 L30 -19 L37 -11 L29 -3 L36 6 L29 14 L35 22 L30 28 H-35 Z'
    : 'M-35 -28 H35 V28 H-35 L-30 22 L-36 14 L-29 6 L-37 -3 L-30 -11 L-36 -19 Z';
  return (
    <g filter={`url(#${u}shadow)`}>
      <path d={shape} fill={`url(#${u}paper)`} />
      <path d={shape} fill="#fff" filter={`url(#${u}grain)`} opacity="0.9" />
      {/* scorched, worn edge */}
      <path d={shape} fill="none" stroke="#9a6a2c" strokeWidth="2.2" strokeLinejoin="round" opacity="0.75" />
      {/* folds */}
      <path d="M0 -28 V28 M-35 0 H35" stroke="#a97c3a" strokeWidth="0.8" opacity="0.35" />
      {a ? (
        <>
          <g transform="translate(-21 -15)" opacity="0.85">
            <circle r="6.5" fill="none" stroke={INK} strokeWidth="1.2" />
            <path d="M0 -9 L2 0 L0 9 L-2 0 Z M-9 0 L0 -2 L9 0 L0 2 Z" fill={INK} />
          </g>
          <m.path d="M-26 20 Q-12 -4 2 8 T27 -10" fill="none" stroke={INK} strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: delay + 0.3, duration: 1.2 }} />
          <path d="M-20 -2 l3 -6 l3 6 z M-8 14 l3 -6 l3 6 z" fill={INK} opacity="0.5" />
        </>
      ) : (
        <>
          <m.path d="M-26 -12 Q-8 -2 6 8 T20 14" fill="none" stroke={INK} strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: delay + 0.3, duration: 1.2 }} />
          <path d="M-22 14 q4 -8 8 0 q4 -9 8 0" fill="none" stroke="#5a86a8" strokeWidth="1.6" opacity="0.6" />
          <g transform="translate(22 10)">
            <m.path d="M-6 -7 L6 7 M6 -7 L-6 7" stroke={RED} strokeWidth="4.2" strokeLinecap="round" animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1.1, delay: delay + 1.5, ...loop }} />
          </g>
        </>
      )}
    </g>
  );
}

/** The chest behind the map: the opened lid, the red lining and the heap of treasure inside. */
function ChestBack({ u, delay }: { u: string; delay: number }) {
  return (
    <g>
      <m.path d="M-57 2 L-47 -54 Q0 -72 47 -54 L57 2 Z" fill={`url(#${u}woodDark)`} stroke="#2a1808" strokeWidth="2" strokeLinejoin="round" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.5, duration: 0.3 }} />
      <m.path d="M-48 -2 L-40 -48 Q0 -63 40 -48 L48 -2 Z" fill={`url(#${u}lining)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.5, duration: 0.3 }} />
      <ellipse cx="0" cy="3" rx="54" ry="9" fill="#1d0f05" />
      {/* the heap: coins and a gem catching the light */}
      {[-34, -22, -10, 3, 16, 29, 40].map((x, i) => (
        <ellipse key={x} cx={x} cy={i % 2 ? 1 : -1} rx="8" ry="3.4" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="0.8" />
      ))}
      <circle cx="-4" cy="-3" r="4" fill={`url(#${u}gem)`} />
    </g>
  );
}

/** The front of the chest: planks, gold bands, a lock; the closed lid lifts away as it opens. */
function ChestFront({ u, delay }: { u: string; delay: number }) {
  return (
    <g filter={`url(#${u}shadow)`}>
      <rect x="-60" y="2" width="120" height="58" rx="6" fill={`url(#${u}wood)`} stroke="#35200d" strokeWidth="3" />
      <rect x="-60" y="2" width="120" height="58" rx="6" fill="#fff" filter={`url(#${u}grain)`} opacity="0.7" />
      <path d="M-60 21 H60 M-60 40 H60" stroke="#35200d" strokeWidth="1.6" opacity="0.5" />
      <rect x="-60" y="2" width="120" height="9" fill="#000" opacity="0.18" />
      {[-37, 26].map((x) => (
        <g key={x}>
          <rect x={x} y="2" width="11" height="58" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="1" />
          <rect x={x + 1.5} y="2" width="2.2" height="58" fill="#fff" opacity="0.35" />
          <circle cx={x + 5.5} cy="52" r="1.8" fill="#8a5a12" />
          <circle cx={x + 5.5} cy="10" r="1.8" fill="#8a5a12" />
        </g>
      ))}
      <rect x="-10" y="12" width="20" height="24" rx="4" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="1.5" />
      <circle cx="0" cy="22" r="3.2" fill="#35200d" />
      <path d="M0 22 L0 30" stroke="#35200d" strokeWidth="2.6" strokeLinecap="round" />
      <m.g initial={{ y: 0, opacity: 1 }} animate={{ y: -16, opacity: 0 }} transition={{ delay: delay + 0.5, duration: 0.35 }}>
        <path d="M-60 2 V-16 Q0 -44 60 -16 V2 Z" fill={`url(#${u}wood)`} stroke="#35200d" strokeWidth="3" strokeLinejoin="round" />
        <path d="M-60 2 V-16 Q0 -44 60 -16 V2 Z" fill="#fff" filter={`url(#${u}grain)`} opacity="0.6" />
        {[-37, 26].map((x) => (
          <rect key={x} x={x} y="-26" width="11" height="28" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="1" />
        ))}
        <path d="M-52 -14 Q0 -36 52 -14" fill="none" stroke="#fff" strokeWidth="2" opacity="0.2" />
      </m.g>
    </g>
  );
}

/** The shield: gold with a bevel, a red star and a sheen that sweeps across now and then. */
function ShieldBody({ u, delay }: { u: string; delay: number }) {
  return (
    <g>
      <path d={SHIELD_PATH} fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="3" strokeLinejoin="round" />
      <path d={SHIELD_PATH} fill="none" stroke="#fff3c9" strokeWidth="1.6" transform="scale(0.82)" opacity="0.85" />
      <path d={SHIELD_PATH} fill="#000" opacity="0.1" transform="translate(2 3) scale(0.82)" />
      <path d={STAR_PATH} fill="#8a1538" stroke="#5c0d25" strokeWidth="1" strokeLinejoin="round" />
      <path d="M0 -16 L4.7 -5 L0 -2 Z" fill="#fff" opacity="0.28" />
      <g clipPath={`url(#${u}shieldClip)`}>
        <m.rect x="-60" y="-50" width="22" height="110" fill={`url(#${u}sheen)`} transform="skewX(-18)" initial={{ x: 0 }} animate={{ x: [0, 130] }} transition={{ delay: delay + 0.4, duration: 1.6, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }} />
      </g>
    </g>
  );
}

/** A golden key drawn around (0, 0), pointing right: a round bow with a hole, a shaft and two teeth. About 52 wide. */
function Key({ u, scale = 1 }: { u: string; scale?: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <rect x="-5" y="-3.2" width="31" height="6.4" rx="2.6" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="1.6" />
      <rect x="15" y="3" width="5" height="9" rx="1.2" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="1.4" />
      <rect x="22.5" y="3" width="4" height="6.5" rx="1.2" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="1.4" />
      <circle cx="-14" cy="0" r="10" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="2" />
      <circle cx="-14" cy="0" r="4.4" fill="#2b1a0a" />
      <path d="M-20 -6 Q-14 -11 -8 -6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
    </g>
  );
}

/** Confetti pieces thrown out of an opened gift. */
const CONFETTI = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  const d = 62 + (i % 4) * 16;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8 - 26, r: i * 57, color: ['#f7c948', '#e8456b', '#4aa3df', '#7ed957', '#fff'][i % 5], w: 5 + (i % 3) * 2 };
});

/** A gift for beating a guardian: the box drops in, shakes, its lid and bow fly off in a burst of confetti and a golden key rises, spinning. */
export function KeyGiftArt() {
  const u = useUid();
  return (
    <svg className="story-art" viewBox="0 0 240 230" aria-hidden="true">
      <Defs u={u} />
      <defs>
        <linearGradient id={`${u}box`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e8456b" />
          <stop offset="1" stopColor="#8a1538" />
        </linearGradient>
      </defs>
      <Rays u={u} cx={120} cy={110} r={112} delay={1.9} />
      <ellipse cx="120" cy="206" rx="52" ry="8" fill="#000" opacity="0.28" />
      {/* the box falls in with a bounce, then shakes */}
      <m.g initial={{ y: -190, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 150, damping: 9, delay: 0.1 }}>
        <m.g animate={{ rotate: [0, -5, 5, -4, 4, -2, 0], y: [0, -3, 0] }} transition={{ delay: 1, duration: 0.7 }} style={{ originX: '120px', originY: '200px' }}>
          <g transform="translate(120 140)" filter={`url(#${u}shadow)`}>
            {/* the key rises out of the box */}
            <m.g initial={{ y: 8, opacity: 0, scale: 0.4 }} animate={{ y: -78, opacity: 1, scale: 1.5 }} transition={{ delay: 1.85, duration: 0.9, type: 'spring', damping: 12 }}>
              <m.g animate={{ y: [0, -6, 0], rotate: [-28, -20, -28] }} transition={{ delay: 2.8, duration: 2.8, ...loop }}>
                <m.g animate={{ scaleX: [1, 0.2, 1, 0.2, 1] }} transition={{ delay: 2.2, duration: 3, ...loop }}>
                  <Key u={u} />
                </m.g>
              </m.g>
            </m.g>
            {/* body: a ribbon down the middle */}
            <rect x="-42" y="-8" width="84" height="64" rx="6" fill={`url(#${u}box)`} stroke="#5c0d25" strokeWidth="2.5" />
            <rect x="-42" y="-8" width="84" height="12" fill="#000" opacity="0.18" />
            <rect x="-8" y="-8" width="16" height="64" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="1.5" />
            <path d="M-34 6 L-34 48 M34 6 L34 48" stroke="#fff" strokeWidth="2" opacity="0.15" />
            {/* the lid with its bow flies away */}
            <m.g initial={{ y: 0, rotate: 0, opacity: 1 }} animate={{ y: -80, x: 46, rotate: 38, opacity: 0 }} transition={{ delay: 1.75, duration: 0.55, ease: 'easeOut' }}>
              <rect x="-48" y="-24" width="96" height="20" rx="5" fill={`url(#${u}box)`} stroke="#5c0d25" strokeWidth="2.5" />
              <rect x="-8" y="-24" width="16" height="20" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="1.5" />
              <path d="M0 -26 C-34 -58 -50 -22 0 -26 Z M0 -26 C34 -58 50 -22 0 -26 Z" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="2" strokeLinejoin="round" />
              <circle cx="0" cy="-26" r="6" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="2" />
            </m.g>
            {/* confetti */}
            {CONFETTI.map((c, i) => (
              <m.rect key={i} x={-c.w / 2} y={-c.w / 2} width={c.w} height={c.w * 0.55} fill={c.color} initial={{ opacity: 0, x: 0, y: -12, rotate: 0 }} animate={{ opacity: [0, 1, 1, 0], x: c.x, y: [-12, c.y, c.y + 60], rotate: c.r }} transition={{ delay: 1.8, duration: 1.6, ease: 'easeOut' }} />
            ))}
          </g>
        </m.g>
      </m.g>
      <Sparkles spots={[[40, 60, 1], [200, 50, 0.9], [46, 150, 1.1], [196, 140, 1], [120, 18, 0.8]]} delay={2.4} />
    </svg>
  );
}

/** What comes out of the treasure chest: half of the map (two halves) or the ring of power. */
export type ChestReward = 'mapA' | 'mapB' | 'ring';

/** A small ring drawn around (0, 0), about 56 wide, with a faceted red stone. */
function MiniRing({ u }: { u: string }) {
  return (
    <g>
      <ellipse cx="0" cy="8" rx="22" ry="20" fill="none" stroke="#8a5a12" strokeWidth="10" />
      <ellipse cx="0" cy="8" rx="22" ry="20" fill="none" stroke={`url(#${u}gold)`} strokeWidth="7" />
      <path d="M-9 -12 L9 -12 L6 -6 L-6 -6 Z" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="1.4" />
      <path d="M0 -34 L13 -22 L0 -8 L-13 -22 Z" fill={`url(#${u}gem)`} stroke="#6b130c" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M0 -34 L13 -22 L0 -22 Z" fill="#ffb3a6" opacity="0.65" />
    </g>
  );
}

/** The three keys won so far fly one by one into the lock of the treasure chest; it clicks, bursts open and the gift rises out. */
export function KeyChestReveal({ reward }: { reward: ChestReward }) {
  const u = useUid();
  const LOCK = { x: 120, y: 200 };
  const START = 0.5; // when the first key sets off
  const GAP = 0.85; // between keys
  const FLY = 1.1;
  const OPEN = START + GAP * 2 + FLY + 0.35; // when the lid lifts
  const keyX = [58, 120, 182];
  return (
    <svg className="story-art story-art-chest" viewBox="0 0 240 250" aria-hidden="true">
      <Defs u={u} />
      <Rays u={u} cx={120} cy={140} r={116} delay={OPEN} />
      {/* the burst of light when the lid lifts */}
      <m.circle cx="120" cy="160" r="20" fill={`url(#${u}glow)`} initial={{ opacity: 0, scale: 0.2 }} animate={{ opacity: [0, 1, 0], scale: [0.2, 5, 6] }} transition={{ delay: OPEN, duration: 1.1 }} style={{ originX: '120px', originY: '160px' }} />
      <g transform="translate(120 176)">
        <m.g initial={{ scale: 0.8, opacity: 0, y: 12 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }}>
          {/* a little shake as the last key turns */}
          <m.g animate={{ rotate: [0, -2.5, 2.5, -1.5, 0] }} transition={{ delay: OPEN - 0.45, duration: 0.4 }}>
            <ChestBack u={u} delay={OPEN - 0.5} />
            <m.g initial={{ y: 14, opacity: 0, scale: 0.7 }} animate={{ y: -66, opacity: 1, scale: 1 }} transition={{ delay: OPEN + 0.15, duration: 0.95, type: 'spring', damping: 13 }}>
              <m.g animate={{ y: [0, -5, 0], rotate: [-1.5, 1.5, -1.5] }} transition={{ delay: OPEN + 1.2, duration: 3, ...loop }}>
                {reward === 'ring' ? <MiniRing u={u} /> : <MapHalf u={u} side={reward === 'mapA' ? 'a' : 'b'} delay={OPEN + 0.6} />}
              </m.g>
            </m.g>
            <ChestFront u={u} delay={OPEN - 0.5} />
          </m.g>
        </m.g>
      </g>
      {/* the three keys fly into the lock one after another */}
      {keyX.map((sx, i) => {
        const t0 = START + i * GAP;
        return (
          <g key={i}>
            <m.g
              initial={{ opacity: 0, x: sx, y: 34, scale: 1, rotate: -20 }}
              animate={{ opacity: [0, 1, 1, 0], x: [sx, sx, LOCK.x, LOCK.x], y: [34, 30, LOCK.y - 4, LOCK.y - 4], scale: [1, 1.1, 0.5, 0.45], rotate: [-20, -12, 90, 90] }}
              transition={{ delay: t0, duration: FLY, times: [0, 0.25, 0.88, 1], ease: 'easeInOut' }}
            >
              <Key u={u} scale={0.9} />
            </m.g>
            {/* the lock lights up each time a key goes in */}
            <m.circle cx={LOCK.x} cy={LOCK.y + 2} r="10" fill="#fff3c9" initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: [0, 0.95, 0], scale: [0.4, 1.7, 2.2] }} transition={{ delay: t0 + FLY * 0.85, duration: 0.5 }} style={{ originX: `${LOCK.x}px`, originY: `${LOCK.y + 2}px` }} />
          </g>
        );
      })}
      <Sparkles spots={[[34, 70, 1], [208, 64, 0.9], [30, 190, 1.1], [212, 180, 1], [120, 34, 0.8]]} delay={OPEN + 0.4} />
    </svg>
  );
}

/** The last scene: the two halves of the map join, the ring glows, the chest opens and the shield rises with a burst of coins. */
export function TreasureScene() {
  const u = useUid();
  const coins = [[-34, -90, 2.8], [-14, -118, 3.1], [16, -110, 2.9], [36, -86, 3.2], [0, -132, 3]] as const;
  return (
    <svg className="story-art story-art-tall" viewBox="0 0 260 330" aria-hidden="true">
      <Defs u={u} />
      <Rays u={u} cx={130} cy={232} r={150} delay={2.6} />
      {/* the map: two halves slide together */}
      <g transform="translate(130 50)">
        <m.g initial={{ x: -76, opacity: 0, rotate: -8 }} animate={{ x: -34, opacity: 1, rotate: 0 }} transition={{ delay: 0.2, duration: 0.95, type: 'spring', damping: 16 }}>
          <MapHalf u={u} side="a" delay={0.8} />
        </m.g>
        <m.g initial={{ x: 76, opacity: 0, rotate: 8 }} animate={{ x: 34, opacity: 1, rotate: 0 }} transition={{ delay: 0.2, duration: 0.95, type: 'spring', damping: 16 }}>
          <MapHalf u={u} side="b" delay={0.8} />
        </m.g>
      </g>
      {/* the ring lights the way */}
      <m.g initial={{ opacity: 0, scale: 0.3 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.4, duration: 0.55, type: 'spring' }}>
        <g transform="translate(130 112)">
          <m.circle r="26" fill={`url(#${u}glow)`} animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.2, 0.9] }} transition={{ duration: 1.5, ...loop }} />
          <ellipse cy="2" rx="12" ry="11" fill="none" stroke="#8a5a12" strokeWidth="7" />
          <ellipse cy="2" rx="12" ry="11" fill="none" stroke={`url(#${u}gold)`} strokeWidth="5" />
          <path d="M0 -22 L8 -14 L0 -5 L-8 -14 Z" fill={`url(#${u}gem)`} stroke="#6b130c" strokeWidth="1.2" />
        </g>
      </m.g>
      {/* the chest opens and gives up the shield */}
      <g transform="translate(130 268) scale(0.92)">
        <m.g initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.9, duration: 0.5 }}>
          <ChestBack u={u} delay={2.2} />
          <m.g initial={{ y: 10, opacity: 0, scale: 0.5 }} animate={{ y: -76, opacity: 1, scale: 1.3 }} transition={{ delay: 3, duration: 1, type: 'spring', damping: 11 }}>
            <m.g animate={{ y: [0, -4, 0] }} transition={{ delay: 4.2, duration: 2.6, ...loop }} filter={`url(#${u}shadow)`}>
              <ShieldBody u={u} delay={4.2} />
            </m.g>
          </m.g>
          {coins.map(([x, y, d], i) => (
            <m.ellipse key={i} cx={x} cy="0" rx="6" ry="2.6" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="0.8" initial={{ opacity: 0, y: 0 }} animate={{ opacity: [0, 1, 0], y: [0, y, y + 30] }} transition={{ delay: 3.1 + i * 0.12, duration: d * 0.45, ease: 'easeOut' }} />
          ))}
          <ChestFront u={u} delay={2.2} />
        </m.g>
      </g>
      <Sparkles spots={[[40, 70, 1], [222, 60, 0.9], [34, 210, 1.1], [228, 200, 1], [130, 150, 0.8], [60, 300, 0.9], [204, 302, 1]]} delay={3} />
    </svg>
  );
}
