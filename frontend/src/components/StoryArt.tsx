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

const MAP_SPARKS = [[34, 44, 1], [200, 36, 0.8], [58, 160, 0.9], [188, 150, 1.1], [120, 22, 0.7]] as const;

/** A chest opens and half of a treasure map rises out of it. */
export function ChestReveal({ half }: { half: 'a' | 'b' }) {
  const u = useUid();
  return (
    <svg className="story-art" viewBox="0 0 240 210" aria-hidden="true">
      <Defs u={u} />
      <Rays u={u} cx={120} cy={104} r={110} delay={0.7} />
      <g transform="translate(120 140)">
        <m.g initial={{ scale: 0.82, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}>
          <ChestBack u={u} delay={0.1} />
          {/* the map rises, then floats */}
          <m.g initial={{ y: 12, opacity: 0 }} animate={{ y: -62, opacity: 1 }} transition={{ delay: 0.9, duration: 0.9, type: 'spring', damping: 14 }}>
            <m.g animate={{ y: [0, -5, 0], rotate: [-1.5, 1.5, -1.5] }} transition={{ delay: 2, duration: 3, ...loop }}>
              <MapHalf u={u} side={half} delay={1.2} />
            </m.g>
          </m.g>
          <ChestFront u={u} delay={0.1} />
        </m.g>
      </g>
      <Sparkles spots={MAP_SPARKS} delay={1.2} />
    </svg>
  );
}

/** The ring of power: a gold band, a faceted red stone, a sweep of light and a floating glow. */
export function RingArt() {
  const u = useUid();
  return (
    <svg className="story-art" viewBox="0 0 240 210" aria-hidden="true">
      <Defs u={u} />
      <Rays u={u} cx={120} cy={108} r={104} delay={0.2} />
      <m.g initial={{ y: 16, opacity: 0, scale: 0.7 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 13, delay: 0.1 }}>
        <m.g animate={{ y: [0, -6, 0] }} transition={{ duration: 3, ...loop }} filter={`url(#${u}shadow)`}>
          <ellipse cx="120" cy="124" rx="46" ry="42" fill="none" stroke="#8a5a12" strokeWidth="17" />
          <ellipse cx="120" cy="124" rx="46" ry="42" fill="none" stroke={`url(#${u}gold)`} strokeWidth="13" />
          <ellipse cx="120" cy="124" rx="40" ry="36" fill="none" stroke="#5c3a0a" strokeWidth="2" opacity="0.45" />
          <m.ellipse cx="120" cy="124" rx="46" ry="42" fill="none" stroke="#fffbe6" strokeWidth="3" strokeLinecap="round" strokeDasharray="26 240" animate={{ strokeDashoffset: [0, -266] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }} />
          {/* the setting and the faceted stone */}
          <path d="M96 82 L144 82 L138 96 L102 96 Z" fill={`url(#${u}gold)`} stroke="#8a5a12" strokeWidth="2" />
          <path d="M120 38 L148 62 L120 90 L92 62 Z" fill={`url(#${u}gem)`} stroke="#6b130c" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M120 38 L148 62 L120 62 Z" fill="#ffb3a6" opacity="0.65" />
          <path d="M92 62 L120 62 L120 90 Z" fill="#7d1810" opacity="0.55" />
          <path d="M100 60 L110 48 L116 56 Z" fill="#fff" opacity="0.55" />
        </m.g>
      </m.g>
      <Sparkles spots={[[64, 56, 1.1], [180, 50, 0.9], [196, 130, 1], [48, 140, 0.8], [120, 24, 1.2]]} delay={0.6} />
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
