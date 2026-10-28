// Sea life of the Builder's Quarry: dolphin, squid, glow squid, nautilus.
// All swimmers: boxes + painted skins, fins cut out of thin plates with the alpha test (no extra geometry).
import type { Face, Paint, PartSpec, SkinFn, SpeciesSpec } from '../types';
import { mix, shade, tones } from './kit';

const SIDES = ['nx', 'front', 'px', 'back'] as const;
const pick = <T>(a: readonly T[], g: Paint): T => a[(g.rand() * a.length) | 0];
const fr = (v: number) => v - Math.floor(v);

/** Painted row by row: `top` colours above the line, `belly` colours below it, a dithered seam between (side faces only). */
function cape(g: Paint, topPal: readonly string[], bellyPal: readonly string[], split: number): void {
  for (const f of SIDES) {
    const { w, h } = g.size(f);
    const line = h * split;
    for (let y = 0; y < h; y++) {
      const d = y + 0.5 - line;
      for (let x = 0; x < w; x++) {
        const isTop = d < -0.6 ? true : d > 0.6 ? false : g.rand() < 0.5;
        g.px(f, x, y, pick(isTop ? topPal : bellyPal, g));
      }
    }
  }
  g.speckle('top', topPal);
  g.speckle('bottom', bellyPal);
}

/** Vertical colour gradient with a little pixel noise on the given faces. */
function vgrad(g: Paint, faces: readonly Face[], top: string, bot: string, jitter = 0.04): void {
  for (const f of faces) {
    const { w, h } = g.size(f);
    for (let y = 0; y < h; y++) {
      const base = mix(top, bot, h > 1 ? y / (h - 1) : 0);
      for (let x = 0; x < w; x++) g.px(f, x, y, shade(base, (((g.rand() * 5) | 0) - 2) * jitter));
    }
  }
}

const on = (rows: readonly string[], r: number, c: number) => rows[r]?.[c] === '#';

/** A 1px-thick upright plate [1, H, D] (a fin). `rows` = H strings of D chars ('#' = solid), top row first, FRONT column first.
 *  Only the solid pixels are painted, so the box becomes a fin-shaped cut-out. */
function uprightPlate(g: Paint, rows: readonly string[], pal: readonly string[], edge: readonly string[] = pal): void {
  const H = g.h;
  const D = g.d;
  for (let y = 0; y < H; y++) {
    for (let c = 0; c < D; c++) {
      if (!on(rows, y, c)) continue;
      g.px('px', c, y, pick(pal, g));
      g.px('nx', D - 1 - c, y, pick(pal, g));
    }
    if (on(rows, y, 0)) g.px('front', 0, y, pick(edge, g));
    if (on(rows, y, D - 1)) g.px('back', 0, y, pick(edge, g));
  }
  for (let c = 0; c < D; c++) if (on(rows, 0, c)) g.px('top', 0, D - 1 - c, pick(edge, g));
}

/** A flat plate [W, 1, D] (flukes). `rows` = D strings of W chars, REAR row first. Top and underside get their own palettes. */
function flatPlate(g: Paint, rows: readonly string[], topPal: readonly string[], underPal: readonly string[], edge: readonly string[]): void {
  const W = g.w;
  const D = g.d;
  for (let r = 0; r < D; r++) {
    for (let x = 0; x < W; x++) {
      if (on(rows, r, x)) g.px('top', x, r, pick(topPal, g));
      if (on(rows, D - 1 - r, x)) g.px('bottom', x, r, pick(underPal, g));
    }
  }
  for (let k = 0; k < D; k++) {
    if (on(rows, D - 1 - k, W - 1)) g.px('px', k, 0, pick(edge, g));
    if (on(rows, k, 0)) g.px('nx', k, 0, pick(edge, g));
  }
  for (let x = 0; x < W; x++) {
    if (on(rows, D - 1, x)) g.px('front', x, 0, pick(edge, g));
    if (on(rows, 0, W - 1 - x)) g.px('back', x, 0, pick(edge, g));
  }
}

// ---- Dolphin ------------------------------------------------------------------------------------
const DT = tones('#5f7f99', 0.06);
const DT_LIGHT = tones('#7a97ae', 0.05);
const DB = tones('#e4edf2', 0.03);
const D_DARK = tones('#4a6680', 0.06);
const D_EYE = '#0f151c';
// fin silhouettes: rows top to bottom, columns from the front
const FIN_ROWS = ['....##', '...##.', '..##..', '.###..', '#####.', '######'];
const FLIPPER_ROWS = ['#####..', '#######', '######.', '###....'];
// flukes: rear row first. Wide at the tips, notched trailing edge.
const FLUKE_ROWS = ['###....###', '##########', '.########.', '..######..', '...####...'];

/** Beak segments: grey on top, white underneath, a thin darker mouth line between. */
function beakSkin(g: Paint, h: number): void {
  g.speckle(['top', 'front', 'back'], DT_LIGHT);
  g.speckle('bottom', DB);
  for (const f of ['nx', 'px'] as const) {
    const { w } = g.size(f);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) g.px(f, x, y, y === h - 1 ? pick(DB, g) : y === h - 2 && g.rand() < 0.5 ? '#8aa1b3' : pick(DT_LIGHT, g));
    }
  }
  g.rect('front', 0, h - 1, g.w, 1, DB[1]);
  g.rect('back', 0, h - 1, g.w, 1, DB[1]);
}

const dolphin: SpeciesSpec = {
  kind: 'dolphin',
  name: { en: 'Dolphin', ar: 'دلفين' },
  emoji: '🐬',
  tex: [64, 64],
  move: 'swim',
  speed: 3.0,
  hp: 12,
  minWater: 3,
  depth: [0.2, 2.0],
  habitat: { weight: 0.3, herd: [1, 2] },
  parts: [
    // body
    {
      at: [0, 8, 0],
      size: [8, 8, 12],
      uv: [0, 0],
      skin: (g) => {
        cape(g, DT, DB, 0.6);
        g.grain('top', D_DARK, 0.08);
        g.grain(['nx', 'px'], DT_LIGHT, 0.04);
      },
    },
    // head, with the blowhole and the eyes
    {
      at: [0, 7.8, 9],
      size: [7, 7, 6],
      uv: [0, 20],
      skin: (g) => {
        cape(g, DT, DB, 0.58);
        g.rect('top', 2, 1, 3, 1, '#2f4558');
        g.px('px', 1, 2, D_EYE);
        g.px('nx', g.d - 2, 2, D_EYE);
        g.px('px', 1, 1, DT_LIGHT[2]);
        g.px('nx', g.d - 2, 1, DT_LIGHT[2]);
      },
    },
    // beak: a broad base and a narrower tip
    { at: [0, 6.2, 13.5], size: [4, 3, 3], uv: [26, 20], skin: (g) => beakSkin(g, 3) },
    { at: [0, 5.7, 16.5], size: [3, 2, 3], uv: [26, 26], skin: (g) => beakSkin(g, 2) },
    // dorsal fin: a falcate plate
    {
      at: [0, 14, -1],
      size: [1, 6, 6],
      uv: [40, 0],
      skin: (g) => uprightPlate(g, FIN_ROWS, D_DARK, tones('#3c566e', 0.05)),
    },
    // pectoral flippers, beating when it swims fast
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 4.7, 5.6, 3.4],
        size: [1, 4, 7],
        uv: [46, 12],
        rot: [-0.6, 0, s * 0.35],
        joint: { chan: 'flap', axis: 'z', amp: s * 0.35, pivot: [s * 4.4, 7.2, 6] },
        skin: (g) => uprightPlate(g, FLIPPER_ROWS, tones('#52708a', 0.06), D_DARK),
      })
    ),
    // tail stock in three bits, each swinging a little more than the one before (the swimming wave)
    {
      at: [0, 8, -8.5],
      size: [6, 6, 5],
      uv: [0, 33],
      joint: { chan: 'tail', axis: 'x', amp: 0.1, phase: 0, pivot: [0, 8, -6] },
      skin: (g) => cape(g, DT, DB, 0.6),
    },
    {
      at: [0, 8, -13.5],
      size: [3, 5, 5],
      uv: [22, 33],
      joint: { chan: 'tail', axis: 'x', amp: 0.2, phase: -0.8, pivot: [0, 8, -11] },
      skin: (g) => cape(g, DT, DB, 0.55),
    },
    // flukes: horizontal, crescent-shaped
    {
      at: [0, 8, -18.5],
      size: [10, 1, 5],
      uv: [0, 44],
      joint: { chan: 'tail', axis: 'x', amp: 0.34, phase: -1.6, pivot: [0, 8, -16] },
      skin: (g) => flatPlate(g, FLUKE_ROWS, D_DARK, tones('#b9c9d6', 0.04), D_DARK),
    },
  ],
};

// ---- Squid and glow squid ------------------------------------------------------------------------
// One shared build: a tall mantle on a collar with a rounded tip, two big side eyes, eight arms that sway on idle joints.
interface SquidLook {
  mantle: SkinFn;
  cap: SkinFn;
  tip: SkinFn;
  collar: SkinFn;
  eye: SkinFn;
  armLong: SkinFn;
  armShort: SkinFn;
}

function squidParts(look: SquidLook): PartSpec[] {
  const parts: PartSpec[] = [
    { at: [0, 20, 0], size: [10, 10, 10], uv: [0, 0], skin: look.mantle },
    { at: [0, 26, 0], size: [8, 2, 8], uv: [0, 20], skin: look.cap },
    { at: [0, 28, 0], size: [6, 2, 6], uv: [0, 30], skin: look.tip },
    { at: [0, 13.5, 0], size: [8, 3, 8], uv: [0, 38], skin: look.collar },
  ];
  for (const s of [1, -1]) parts.push({ at: [s * 5.5, 18.5, 2.5], size: [1, 4, 4], uv: [32, 20], skin: look.eye });
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const x = Math.round(Math.cos(a) * 3 * 100) / 100;
    const z = Math.round(Math.sin(a) * 3 * 100) / 100;
    const long = k % 2 === 0;
    parts.push({
      at: [x, long ? 7 : 8, z],
      size: [2, long ? 14 : 12, 2],
      rot: [-0.16 * Math.sin(a), 0, 0.16 * Math.cos(a)], // the lower ends splay outwards
      uv: long ? [40, 0] : [48, 0],
      skin: long ? look.armLong : look.armShort,
      joint: { chan: 'idle', axis: k % 2 ? 'x' : 'z', amp: 0.22 + (k % 3) * 0.05, phase: k * 0.95, pivot: [x, 14, z] },
    });
  }
  return parts;
}

// squid: dark blue-grey, paler on top
const SQ = { top: '#54738f', bot: '#2c4359', spot: '#7c9bb6', dark: '#1f3144', skin: '#3d5a75' };
const sqEye = (g: Paint): void => {
  for (const f of ['px', 'nx'] as const) {
    g.rect(f, 0, 0, 4, 4, '#e9f2f7');
    g.rect(f, 1, 1, 2, 2, '#0c1118');
    g.px(f, 1, 1, '#9fb4c4');
    for (const [x, y] of [[0, 0], [3, 0], [0, 3], [3, 3]]) g.px(f, x, y, SQ.skin);
  }
  g.speckle(['top', 'bottom', 'front', 'back'], tones(SQ.skin, 0.05));
};
const squid: SpeciesSpec = {
  kind: 'squid',
  name: { en: 'Squid', ar: 'حبّار' },
  emoji: '🦑',
  tex: [64, 64],
  move: 'swim',
  speed: 1.0,
  hp: 8,
  minWater: 2,
  depth: [1, 4],
  habitat: { weight: 0.6, herd: [1, 2] },
  parts: squidParts({
    mantle: (g) => {
      vgrad(g, SIDES, SQ.top, SQ.bot);
      g.speckle('top', tones(SQ.top, 0.05));
      g.speckle('bottom', tones(SQ.bot, 0.05));
      g.grain([...SIDES, 'top'], SQ.dark, 0.07);
      g.grain([...SIDES, 'top'], SQ.spot, 0.05);
      g.blob('top', 5, 5, 1.5, shade(SQ.top, -0.15));
    },
    cap: (g) => {
      g.speckle('all', tones(shade(SQ.top, 0.04), 0.05));
      g.grain('sides', SQ.spot, 0.08);
      g.grain('sides', SQ.dark, 0.06);
    },
    tip: (g) => {
      g.speckle('all', tones(shade(SQ.top, 0.12), 0.05));
      g.grain('sides', SQ.spot, 0.1);
    },
    collar: (g) => {
      vgrad(g, SIDES, shade(SQ.bot, 0.05), shade(SQ.bot, -0.1));
      g.speckle(['top', 'bottom'], tones(shade(SQ.bot, -0.05), 0.05));
      g.grain('sides', SQ.dark, 0.1);
    },
    eye: sqEye,
    armLong: (g) => {
      vgrad(g, SIDES, SQ.bot, '#6a88a4', 0.04);
      g.speckle(['top', 'bottom'], tones('#6a88a4', 0.05));
      for (const y of [3, 5, 7, 9, 11]) g.px('front', 0, y, '#9fb6c9');
    },
    armShort: (g) => {
      vgrad(g, SIDES, SQ.bot, '#6a88a4', 0.04);
      g.speckle(['top', 'bottom'], tones('#6a88a4', 0.05));
      for (const y of [3, 5, 7, 9]) g.px('front', 1, y, '#9fb6c9');
    },
  }),
};

// glow squid: very dark teal, bright cyan spots, glowing arm tips (the whole texture is self-lit)
const GQ = { top: '#145561', mid: '#0d3b49', bot: '#082a36', dim: '#1b8a90', glow: '#4be3d3', hi: '#b6fff4' };
function glowSpots(g: Paint, faces: readonly Face[], n: number): void {
  for (const f of faces) {
    const { w, h } = g.size(f);
    for (let i = 0; i < n; i++) {
      const cx = (g.rand() * w) | 0;
      const cy = (g.rand() * h) | 0;
      g.blob(f, cx, cy, 1.5, GQ.dim);
      g.blob(f, cx, cy, 1, GQ.glow);
      g.px(f, cx, cy, GQ.hi);
    }
  }
}
const glowArm = (len: number): SkinFn => (g) => {
  vgrad(g, SIDES, GQ.mid, '#10606c', 0.03);
  const tip = ['#2db8b0', '#4be3d3', '#82f5e8', GQ.hi];
  for (const f of SIDES) for (let i = 0; i < 4; i++) g.band(f, len - 4 + i, len - 3 + i, tip[i]);
  g.fill('bottom', GQ.hi);
  g.speckle('top', tones(GQ.mid, 0.05));
};
const gEye = (g: Paint): void => {
  for (const f of ['px', 'nx'] as const) {
    g.rect(f, 0, 0, 4, 4, '#bff7f0');
    g.rect(f, 1, 1, 2, 2, '#04141c');
    g.px(f, 1, 1, '#4be3d3');
    for (const [x, y] of [[0, 0], [3, 0], [0, 3], [3, 3]]) g.px(f, x, y, GQ.mid);
  }
  g.speckle(['top', 'bottom', 'front', 'back'], tones(GQ.mid, 0.05));
};
const glowSquid: SpeciesSpec = {
  kind: 'glow_squid',
  name: { en: 'Glow Squid', ar: 'حبّار متوهّج' },
  emoji: '🦑',
  tex: [64, 64],
  move: 'swim',
  glow: 0.9,
  speed: 1.0,
  hp: 8,
  minWater: 3,
  depth: [2, 5],
  habitat: { weight: 0.3, herd: [1, 2] },
  parts: squidParts({
    mantle: (g) => {
      vgrad(g, SIDES, GQ.top, GQ.bot);
      g.speckle('top', tones(GQ.top, 0.05));
      g.speckle('bottom', tones(GQ.bot, 0.05));
      glowSpots(g, [...SIDES, 'top'], 4);
      g.grain([...SIDES, 'top'], GQ.glow, 0.04);
    },
    cap: (g) => {
      g.speckle('all', tones(shade(GQ.top, 0.1), 0.05));
      glowSpots(g, ['top'], 3);
      g.grain('sides', GQ.glow, 0.1);
    },
    tip: (g) => {
      g.speckle('all', tones(shade(GQ.top, 0.2), 0.05));
      g.blob('top', 2, 2, 1.5, GQ.glow);
      g.px('top', 2, 2, GQ.hi);
      g.grain('sides', GQ.glow, 0.15);
    },
    collar: (g) => {
      vgrad(g, SIDES, GQ.mid, GQ.bot);
      g.speckle(['top', 'bottom'], tones(GQ.bot, 0.05));
      g.grain('sides', GQ.dim, 0.12);
    },
    eye: gEye,
    armLong: glowArm(14),
    armShort: glowArm(12),
  }),
};

// ---- Nautilus -------------------------------------------------------------------------------------
// The shell is a round lens built from three stacked boxes (a tall, a medium and a long one, the outer two a touch thinner so the rim
// steps in). The spiral and its cream / brown flames are painted continuously across all of them from each pixel's world position.
// Soft orange hood in the opening, plus a fan of short swaying tentacles.
const SHELL_CZ = -3;
const SHELL_CY = 9;
const SHELL_CREAM = ['#f2e7c8', '#e9d9b0'];
const SHELL_BROWN = ['#8a5a2e', '#76481f'];
const SHELL_DARK = '#4a2d17';
function shellColor(zw: number, yw: number, g: Paint, rim: boolean): string {
  const dz = zw - SHELL_CZ;
  const dy = yw - SHELL_CY;
  const r = Math.hypot(dz, dy);
  const turn = Math.atan2(dy, dz) / (Math.PI * 2);
  const j = g.rand();
  if (rim) {
    // the outer edge of the coil: plain cream / brown stripes running across it
    const stripe = fr(turn * 8 + r * 0.05) < 0.5;
    return stripe ? (j < 0.15 ? '#9c6a38' : SHELL_BROWN[j < 0.6 ? 0 : 1]) : j < 0.12 ? '#fbf4de' : SHELL_CREAM[j < 0.6 ? 0 : 1];
  }
  if (r < 1.5) return SHELL_DARK;
  const whorl = Math.log(Math.max(r, 0.5) / 1.6) / Math.log(2.2) - turn;
  const f = fr(whorl);
  if (f < 0.18) return SHELL_DARK;
  if (r > 3.6 && fr(turn * 7 + 0.25 * Math.floor(whorl)) < 0.45) return j < 0.12 ? '#9c6a38' : SHELL_BROWN[f < 0.6 ? 0 : 1];
  return j < 0.1 ? '#fbf4de' : SHELL_CREAM[f < 0.6 ? 0 : 1];
}
/** Paints every face of a shell box from the world position of each pixel (the box is centred on the shell's centre). */
const shellSkin: SkinFn = (g) => {
  const cz = SHELL_CZ;
  const cy = SHELL_CY;
  for (const f of ['nx', 'px', 'top', 'bottom', 'front', 'back'] as const) {
    const { w, h } = g.size(f);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let zw = cz;
        let yw = cy;
        if (f === 'px') [zw, yw] = [cz + g.d / 2 - x - 0.5, cy + g.h / 2 - y - 0.5];
        else if (f === 'nx') [zw, yw] = [cz - g.d / 2 + x + 0.5, cy + g.h / 2 - y - 0.5];
        else if (f === 'top') [zw, yw] = [cz - g.d / 2 + y + 0.5, cy + g.h / 2];
        else if (f === 'bottom') [zw, yw] = [cz + g.d / 2 - y - 0.5, cy - g.h / 2];
        else if (f === 'front') [zw, yw] = [cz + g.d / 2, cy + g.h / 2 - y - 0.5];
        else [zw, yw] = [cz - g.d / 2, cy + g.h / 2 - y - 0.5];
        g.px(f, x, y, shellColor(zw, yw, g, f !== 'px' && f !== 'nx'));
      }
    }
  }
};

const HOOD = tones('#e9967a', 0.06);
const TENT = tones('#f0a98c', 0.05);
const TENT_TIP = '#c6694f';
const tentacleSkin: SkinFn = (g) => {
  g.speckle('all', TENT);
  g.fill('bottom', TENT_TIP);
  g.rect('front', 0, 0, g.w, g.h, TENT_TIP);
  g.rect('top', 0, 0, g.w, 1, shade('#f0a98c', -0.1));
};
const TZ = 9.5; // z of the hood's front face, where the tentacles start
const T_ROWS: { y: number; xs: number[] }[] = [
  { y: 3.4, xs: [-2, 0, 2] },
  { y: 5.4, xs: [-2.25, -0.75, 0.75, 2.25] },
  { y: 7.4, xs: [-2, 0, 2] },
];
const nautilusTentacles: PartSpec[] = [];
let ti = 0;
for (const row of T_ROWS) {
  for (const x of row.xs) {
    const long = ti % 2 === 0;
    const len = long ? 5 : 3;
    nautilusTentacles.push({
      at: [x, row.y, TZ + len / 2],
      size: [1, 1, len],
      uv: long ? [54, 28] : [66, 28],
      rot: [0.1, 0, 0],
      skin: tentacleSkin,
      joint: { chan: 'idle', axis: ti % 3 === 0 ? 'x' : 'y', amp: 0.28 + (ti % 4) * 0.05, phase: ti * 1.1, pivot: [x, row.y, TZ] },
    });
    ti++;
  }
}

const nautilus: SpeciesSpec = {
  kind: 'nautilus',
  name: { en: 'Nautilus', ar: 'نوتيلوس' },
  emoji: '🐚',
  tex: [128, 64],
  move: 'swim',
  speed: 0.8,
  hp: 8,
  minWater: 3,
  depth: [1, 4],
  habitat: { weight: 0.25, herd: [1, 1] },
  parts: [
    // shell
    { at: [0, SHELL_CY, SHELL_CZ], size: [7, 16, 8], uv: [0, 0], skin: shellSkin },
    { at: [0, SHELL_CY, SHELL_CZ], size: [8, 12, 14], uv: [30, 0], skin: shellSkin },
    { at: [0, SHELL_CY, SHELL_CZ], size: [7, 8, 16], uv: [74, 0], skin: shellSkin },
    // soft body in the opening: hood, hood flap, funnel
    {
      at: [0, 5.5, TZ - 3],
      size: [6, 6, 6],
      uv: [0, 28],
      skin: (g) => {
        g.speckle('all', HOOD);
        g.grain('sides', '#c4705a', 0.08);
        g.rect('front', 1, 2, 4, 3, '#c9705a');
        g.px('front', 2, 3, '#8c3f31');
        g.px('front', 3, 3, '#8c3f31');
        for (const [f, x] of [['px', 1], ['nx', g.d - 3]] as const) {
          g.rect(f, x, 2, 2, 2, '#24100c');
          g.px(f, f === 'px' ? x : x + 1, 2, '#f6dcd0');
        }
      },
    },
    {
      at: [0, 9.5, TZ - 4],
      size: [6, 2, 4],
      uv: [24, 28],
      skin: (g) => {
        g.speckle('all', tones('#b25a42', 0.07));
        g.grain('all', '#d98a6a', 0.1);
      },
    },
    { at: [0, 2, TZ - 2], size: [2, 2, 3], uv: [44, 28], skin: (g) => g.speckle('all', tones('#f3c3a8', 0.04)) },
    ...nautilusTentacles,
  ],
};

export const SPECIES: SpeciesSpec[] = [dolphin, squid, glowSquid, nautilus];
