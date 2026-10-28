// The sky module: chicken, parrot, bat, bee and the happy ghast.
// Fliers use `flap` wings painted with cut-out pixels (feather tips, bat membranes, bee gauze); the
// ghast is a 18 px cube drawn at `scale: 2` so its atlas stays tiny while it fills 2.25 blocks.
import type { Face, JointSpec, Paint, PartSpec, SpeciesSpec, Vec3 } from '../types';
import { headDip, shade, tones } from './kit';

const SIDES: readonly Face[] = ['nx', 'front', 'px', 'back'];
const ALL: readonly Face[] = ['nx', 'front', 'px', 'back', 'top', 'bottom'];
const SIGNS = [1, -1] as const;

// ---- painting helpers ---------------------------------------------------------------------------

/** random pixels of `pal` inside a rectangle of one face */
function sp(g: Paint, face: Face, x: number, y: number, w: number, h: number, pal: readonly string[]): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.px(face, x + i, y + j, pal[(g.rand() * pal.length) | 0]);
}

/** speckled base plus a faint feather-scale rhythm (one darker pixel every 4, offset on alternate rows) */
function plumage(g: Paint, faces: readonly Face[], base: string, spread: number, mark = shade(base, -0.07)): void {
  g.speckle(faces, tones(base, spread));
  for (const f of faces) {
    const { w, h } = g.size(f);
    for (let y = 0; y < h; y++) for (let x = (y % 2) * 2; x < w; x += 4) g.px(f, x, y, mark);
  }
}

type Mask = (x: number, r: number) => boolean;
type Ink = (x: number, r: number) => string;

/** Flat plate [w,1,d] (wing membrane, gauze): `mask(x, r)` says which top-image pixels exist (r = 0 is the back row,
 *  d-1 the front row); everything else stays transparent. The rim faces are painted only where the plate reaches them. */
function hplate(g: Paint, mask: Mask, ink: Ink): void {
  const { w, d } = g;
  for (let r = 0; r < d; r++)
    for (let x = 0; x < w; x++) {
      if (!mask(x, r)) continue;
      const c = ink(x, r);
      g.px('top', x, r, c);
      g.px('bottom', x, d - 1 - r, c);
    }
  for (let x = 0; x < w; x++) {
    if (mask(x, d - 1)) g.px('front', x, 0, ink(x, d - 1));
    if (mask(x, 0)) g.px('back', w - 1 - x, 0, ink(x, 0));
  }
  for (let r = 0; r < d; r++) {
    if (mask(0, r)) g.px('nx', r, 0, ink(0, r));
    if (mask(w - 1, r)) g.px('px', d - 1 - r, 0, ink(w - 1, r));
  }
}

/** Upright plate [w,h,1] (bat ears): `mask(x, y)` over the front image (y = 0 is the top row). */
function vplate(g: Paint, mask: Mask, ink: Ink): void {
  const { w, h } = g;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!mask(x, y)) continue;
      const c = ink(x, y);
      g.px('front', x, y, c);
      g.px('back', w - 1 - x, y, c);
    }
  for (let x = 0; x < w; x++) {
    if (mask(x, 0)) g.px('top', x, 0, ink(x, 0));
    if (mask(x, h - 1)) g.px('bottom', x, 0, ink(x, h - 1));
  }
  for (let y = 0; y < h; y++) {
    if (mask(0, y)) g.px('nx', 0, y, ink(0, y));
    if (mask(w - 1, y)) g.px('px', 0, y, ink(w - 1, y));
  }
}

function line(set: Set<string>, x0: number, y0: number, x1: number, y1: number): void {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) set.add(`${Math.round(x0 + ((x1 - x0) * i) / n)},${Math.round(y0 + ((y1 - y0) * i) / n)}`);
}

/** A left/right wing pair that hangs out sideways from `sh` and beats about z. Each side gets its own atlas
 *  region so the paint can be mirrored (the tip of the right wing is at the LEFT of its top image).
 *  `rest` is the signed angle when not beating (positive = tips up, negative = folded down). */
function wingPair(o: { size: Vec3; sh: Vec3; uv: [number, number]; uvR: [number, number]; skin: (g: Paint, mirror: boolean) => void; amp: number; rest: number }): PartSpec[] {
  const side = (s: 1 | -1): PartSpec => ({
    at: [s * (o.sh[0] + o.size[0] / 2), o.sh[1], o.sh[2]],
    size: o.size,
    uv: s > 0 ? o.uv : o.uvR,
    skin: (g) => o.skin(g, s < 0),
    joint: { chan: 'flap', axis: 'z', amp: s * o.amp, rest: s * o.rest, pivot: [s * o.sh[0], o.sh[1], o.sh[2]] },
  });
  return [side(1), side(-1)];
}

// =================================================================================================
// CHICKEN
// =================================================================================================
const CHICK = [
  { body: '#fbfaf6', under: '#e2dfd6', wing: '#ecebe4', tip: '#c9c6bb' }, // white
  { body: '#a9622f', under: '#864a24', wing: '#8e5026', tip: '#5a3317' }, // brown
] as const;
const CHICK_RED = '#d8342b';
const CHICK_ORANGE = '#e59a2a';
const chickHead = headDip([0, 10, 3], 0.6);

const chicken: SpeciesSpec = {
  kind: 'chicken',
  name: { en: 'Chicken', ar: 'دجاجة' },
  emoji: '🐔',
  tex: [64, 32],
  variants: 2,
  move: 'walk',
  speed: 1.3,
  hp: 4,
  graze: true,
  habitat: { biomes: ['plains', 'forest'], weight: 1.0, herd: [2, 3] },
  parts: [
    // body
    {
      at: [0, 8, 0],
      size: [6, 6, 8],
      uv: [0, 0],
      skin: (g) => {
        const c = CHICK[g.variant];
        plumage(g, ALL, c.body, 0.03);
        for (const f of SIDES) sp(g, f, 0, 4, f === 'front' || f === 'back' ? 6 : 8, 2, tones(c.under, 0.04));
        g.speckle('bottom', tones(c.under, 0.04));
        if (g.variant === 1) g.grain('top', [c.tip, shade(c.body, 0.15)], 0.18);
      },
    },
    // head + everything glued to it dips together
    {
      at: [0, 12, 4.5],
      size: [4, 6, 3],
      uv: [28, 0],
      joint: chickHead,
      skin: (g) => {
        const c = CHICK[g.variant];
        g.speckle('all', tones(c.body, 0.03));
        g.px('front', 0, 1, '#15151a');
        g.px('front', 3, 1, '#15151a');
        g.px('nx', 2, 1, '#15151a');
        g.px('px', 0, 1, '#15151a');
        g.rect('front', 0, 5, 4, 1, c.under);
      },
    },
    {
      at: [0, 12, 7],
      size: [4, 2, 2],
      uv: [0, 14],
      joint: chickHead,
      skin: (g) => {
        g.speckle('all', tones('#f1b72e', 0.05));
        g.rect('front', 0, 1, 4, 1, '#cf8f1f');
        g.px('top', 1, 1, '#a8691a');
        g.px('top', 2, 1, '#a8691a');
      },
    },
    {
      at: [0, 10, 6],
      size: [2, 2, 2],
      uv: [12, 14],
      joint: chickHead,
      skin: (g) => {
        g.speckle('all', tones(CHICK_RED, 0.06));
        g.rect('front', 0, 1, 2, 1, shade(CHICK_RED, -0.2));
      },
    },
    {
      at: [0, 15.5, 4.5],
      size: [2, 1, 3],
      uv: [20, 14],
      joint: chickHead,
      skin: (g) => {
        g.speckle('all', tones(CHICK_RED, 0.07));
        g.grain('top', shade(CHICK_RED, 0.2), 0.2);
      },
    },
    // tail tuft
    {
      at: [0, 10.8, -4.6],
      size: [4, 3, 2],
      uv: [0, 18],
      rot: [0.45, 0, 0],
      joint: { chan: 'tail', axis: 'y', amp: 0.25, pivot: [0, 10, -4] },
      skin: (g) => {
        const c = CHICK[g.variant];
        plumage(g, ALL, g.variant === 1 ? c.tip : c.wing, 0.04);
      },
    },
    // legs: shin + three-toed foot swing together about the hip
    ...SIGNS.flatMap((s): PartSpec[] => {
      const joint: JointSpec = { chan: 'walk', axis: 'x', amp: 0.9, phase: s > 0 ? 0 : Math.PI, pivot: [s * 2, 5, 0] };
      return [
        {
          at: [s * 2, 3, 0],
          size: [1, 4, 1],
          uv: [30, 14],
          joint,
          skin: (g) => g.speckle('all', tones(CHICK_ORANGE, 0.07)),
        },
        {
          at: [s * 2, 0.5, 1],
          size: [3, 1, 3],
          uv: [34, 14],
          joint,
          skin: (g) => {
            g.speckle('all', tones(CHICK_ORANGE, 0.06));
            g.rect('top', 1, 0, 1, 3, shade(CHICK_ORANGE, -0.18));
            g.px('front', 1, 0, shade(CHICK_ORANGE, -0.18));
          },
        },
      ];
    }),
    // wings held against the body
    ...SIGNS.map(
      (s): PartSpec => ({
        at: [s * 3.5, 8.8, 0],
        size: [1, 4, 6],
        uv: [42, 0],
        skin: (g) => {
          const c = CHICK[g.variant];
          plumage(g, ALL, c.wing, 0.04);
          for (const f of ['nx', 'px'] as const) {
            sp(g, f, 0, 3, 6, 1, tones(c.tip, 0.05));
            sp(g, f, 0, 2, 6, 1, tones(shade(c.wing, -0.12), 0.04));
          }
        },
      })
    ),
  ],
};

// =================================================================================================
// PARROT
// =================================================================================================
interface ParrotCoat {
  body: string;
  belly: string;
  head: string;
  cover: string; // wing coverts
  flight: string; // flight feathers
  band: string; // stripe across the flight feathers
  tail: string;
  tailTip: string;
  beak: string;
}
const PARROT: readonly ParrotCoat[] = [
  { body: '#cf2a22', belly: '#e24b37', head: '#d42b23', cover: '#cf2a22', flight: '#2a6bd6', band: '#f1c53a', tail: '#cf2a22', tailTip: '#2a6bd6', beak: '#7b7467' }, // red
  { body: '#2c64d8', belly: '#58a4ee', head: '#2f6bdc', cover: '#2459c4', flight: '#1b3f98', band: '#6cc0f5', tail: '#2c64d8', tailTip: '#1b3f98', beak: '#7b7467' }, // blue
  { body: '#3aab45', belly: '#8bd35a', head: '#3aab45', cover: '#2f9a3c', flight: '#1f7a34', band: '#e0d646', tail: '#2f9a3c', tailTip: '#e0d646', beak: '#7b7467' }, // green
  { body: '#2f84e0', belly: '#f4cc2c', head: '#f4cc2c', cover: '#2a74d0', flight: '#1d58b0', band: '#f4cc2c', tail: '#2f84e0', tailTip: '#f4cc2c', beak: '#6a6459' }, // yellow-blue
  { body: '#8d9299', belly: '#aab0b8', head: '#9aa0a8', cover: '#80858d', flight: '#656a72', band: '#9aa0a8', tail: '#d83a2b', tailTip: '#a8281c', beak: '#3a3836' }, // grey
];
const PAR_LEG = '#8c8478';

// wing mask: x 0 = root .. 5 = tip, row r 0 = back (trailing edge); depth = rows kept counted from the front (leading edge)
const PAR_W = 8;
const PAR_DEPTH = [5, 5, 5, 4, 5, 4, 3, 2];
const parWing = (g: Paint, mirror: boolean): void => {
  const c = PARROT[g.variant];
  const nat = (x: number) => (mirror ? PAR_W - 1 - x : x);
  hplate(
    g,
    (x, r) => 4 - r < PAR_DEPTH[nat(x)],
    (x, r) => {
      const nx = nat(x);
      const rf = 4 - r; // rows from the leading edge
      const pal = nx <= 2 ? tones(c.cover, 0.06) : nx === 4 && rf >= 1 ? tones(c.band, 0.05) : tones(c.flight, 0.07);
      return pal[(g.rand() * pal.length) | 0];
    }
  );
};

const parrot: SpeciesSpec = {
  kind: 'parrot',
  name: { en: 'Parrot', ar: 'ببغاء' },
  emoji: '🦜',
  tex: [64, 32],
  variants: 5,
  move: 'fly',
  speed: 3.0,
  hp: 6,
  altitude: [2, 7],
  habitat: { biomes: ['forest'], weight: 0.6, herd: [1, 2] },
  parts: [
    // legs dangle and sway a little
    ...SIGNS.map(
      (s): PartSpec => ({
        at: [s * 1.5, 1.5, 0.5],
        size: [1, 3, 1],
        uv: [52, 12],
        joint: { chan: 'idle', axis: 'x', amp: 0.18, phase: s > 0 ? 0 : 1.7, pivot: [s * 1.5, 3, 0.5] },
        skin: (g) => g.speckle('all', tones(PAR_LEG, 0.08)),
      })
    ),
    // body, leaning forward
    {
      at: [0, 6.5, 0],
      size: [4, 7, 4],
      uv: [0, 0],
      rot: [0.3, 0, 0],
      skin: (g) => {
        const c = PARROT[g.variant];
        g.speckle('all', tones(c.body, 0.06));
        g.speckle(['front', 'bottom'], tones(c.belly, 0.05));
        sp(g, 'nx', 0, 4, 4, 3, tones(c.belly, 0.05));
        sp(g, 'px', 0, 4, 4, 3, tones(c.belly, 0.05));
        g.grain('back', shade(c.body, -0.2), 0.12);
        // scalloped chest feathers
        for (let y = 1; y < 7; y += 2) for (let x = (y % 4) / 2; x < 4; x += 2) g.px('front', x, y, shade(c.belly, -0.12));
      },
    },
    // head
    {
      at: [0, 11.4, 1.4],
      size: [4, 4, 4],
      uv: [16, 0],
      skin: (g) => {
        const c = PARROT[g.variant];
        g.speckle('all', tones(c.head, 0.06));
        const dark = '#141218';
        if (g.variant === 4) {
          g.rect('front', 0, 1, 4, 2, '#eeeeee');
          g.rect('nx', 2, 1, 2, 2, '#eeeeee');
          g.rect('px', 0, 1, 2, 2, '#eeeeee');
        }
        if (g.variant === 3) {
          g.rect('top', 0, 0, 4, 4, '#3aa855');
          g.rect('front', 0, 0, 4, 1, '#3aa855');
        }
        g.px('front', 0, 1, dark);
        g.px('front', 3, 1, dark);
        g.px('nx', 3, 1, dark);
        g.px('px', 0, 1, dark);
        g.px('nx', 3, 2, shade(c.belly, 0.1));
        g.px('px', 0, 2, shade(c.belly, 0.1));
      },
    },
    // big hooked beak
    {
      at: [0, 11.6, 4.9],
      size: [2, 2, 3],
      uv: [0, 12],
      skin: (g) => {
        const c = PARROT[g.variant];
        g.speckle('all', tones(c.beak, 0.07));
        g.speckle('top', tones(shade(c.beak, 0.28), 0.05));
        g.px('front', 0, 1, shade(c.beak, -0.4));
        g.px('front', 1, 1, shade(c.beak, -0.4));
        g.px('nx', 0, 0, shade(c.beak, -0.45));
        g.px('px', 2, 0, shade(c.beak, -0.45));
      },
    },
    {
      at: [0, 9.6, 5.9],
      size: [2, 2, 1],
      uv: [10, 12],
      skin: (g) => g.speckle('all', tones(shade(PARROT[g.variant].beak, -0.3), 0.06)),
    },
    {
      at: [0, 10.1, 4.4],
      size: [2, 1, 2],
      uv: [16, 12],
      skin: (g) => g.speckle('all', tones(shade(PARROT[g.variant].beak, -0.15), 0.06)),
    },
    // crest feathers: one tall plume swept back and two shorter ones fanning out
    {
      at: [0, 14.8, 0.4],
      size: [1, 3, 3],
      uv: [24, 12],
      rot: [-0.5, 0, 0],
      skin: (g) => {
        const c = PARROT[g.variant];
        const col = g.variant === 3 ? '#3aa855' : g.variant === 4 ? '#b4bac2' : c.head;
        g.speckle('all', tones(col, 0.07));
        g.rect('nx', 0, 0, 3, 1, shade(col, -0.2));
        g.rect('px', 0, 0, 3, 1, shade(col, -0.2));
      },
    },
    ...SIGNS.map(
      (s): PartSpec => ({
        at: [s * 1.3, 14.2, 0.6],
        size: [1, 2, 3],
        uv: [32, 12],
        rot: [-0.4, 0, -s * 0.4],
        skin: (g) => {
          const c = PARROT[g.variant];
          const col = g.variant === 3 ? '#3aa855' : g.variant === 4 ? '#b4bac2' : shade(c.head, -0.08);
          g.speckle('all', tones(col, 0.07));
          g.rect('nx', 0, 0, 3, 1, shade(col, -0.2));
          g.rect('px', 0, 0, 3, 1, shade(col, -0.2));
        },
      })
    ),
    // long tail
    {
      at: [0, 4.3, -4],
      size: [3, 8, 2],
      uv: [40, 12],
      rot: [0.55, 0, 0],
      joint: { chan: 'tail', axis: 'y', amp: 0.2, pivot: [0, 7.5, -2] },
      skin: (g) => {
        const c = PARROT[g.variant];
        g.speckle('all', tones(c.tail, 0.06));
        for (const f of ['front', 'back'] as const) {
          g.rect(f, 1, 0, 1, 8, shade(c.tail, -0.18));
          sp(g, f, 0, 5, 3, 3, tones(c.tailTip, 0.06));
        }
        for (const f of ['nx', 'px'] as const) sp(g, f, 0, 5, 2, 3, tones(c.tailTip, 0.06));
        g.speckle('bottom', tones(c.tailTip, 0.06));
      },
    },
    // wings
    ...wingPair({ size: [PAR_W, 1, 5], sh: [2, 8.8, 0.6], uv: [32, 0], uvR: [32, 6], skin: parWing, amp: 0.9, rest: -1.45 }),
  ],
};

// =================================================================================================
// BAT
// =================================================================================================
const BAT = '#7a5644';
const BAT_CHEST = '#a47d64';
const BAT_MEMB = '#855a4c';
const BAT_BONE = '#5a3a2e';
const BAT_W = 12;
const BAT_D = 8;
// membrane rows kept from the leading edge, root -> tip: three pointed fingers with scalloped skin between them
const BAT_DEPTH = [8, 7, 6, 6, 8, 6, 5, 5, 7, 5, 4, 3];
const batBones = new Set<string>();
for (let x = 0; x < BAT_W; x++) batBones.add(`${x},0`);
line(batBones, 4, 1, 4, 7);
line(batBones, 4, 1, 8, 6);
line(batBones, 5, 1, 11, 2);
const BAT_SH: Vec3 = [2, 6.2, 0.3];
const BAT_REST = -0.25;
const BAT_AMP = 0.85;

const batWing = (g: Paint, mirror: boolean): void => {
  const nat = (x: number) => (mirror ? BAT_W - 1 - x : x);
  const memb = tones(BAT_MEMB, 0.1);
  hplate(
    g,
    (x, r) => BAT_D - 1 - r < BAT_DEPTH[nat(x)],
    (x, r) => {
      const rf = BAT_D - 1 - r;
      if (batBones.has(`${nat(x)},${rf}`)) return BAT_BONE;
      return memb[(g.rand() * memb.length) | 0];
    }
  );
};

const bat: SpeciesSpec = {
  kind: 'bat',
  name: { en: 'Bat', ar: 'خفاش' },
  emoji: '🦇',
  tex: [64, 64],
  move: 'fly',
  speed: 3.4,
  hp: 6,
  altitude: [3, 9],
  habitat: { weight: 0.5, herd: [1, 2] },
  parts: [
    // tiny feet
    ...SIGNS.map(
      (s): PartSpec => ({
        at: [s * 1, 1, 0.3],
        size: [1, 2, 1],
        uv: [52, 18],
        joint: { chan: 'idle', axis: 'x', amp: 0.2, phase: s > 0 ? 0 : 2.1, pivot: [s * 1, 2, 0.3] },
        skin: (g) => g.speckle('all', tones('#4e3427', 0.1)),
      })
    ),
    // body
    {
      at: [0, 4.5, 0],
      size: [4, 5, 3],
      uv: [0, 18],
      skin: (g) => {
        g.speckle('all', tones(BAT, 0.09));
        g.speckle('front', tones(BAT_CHEST, 0.08));
        g.grain('back', shade(BAT, -0.25), 0.18);
      },
    },
    // fur ruff around the neck
    {
      at: [0, 6.6, 0.4],
      size: [5, 2, 4],
      uv: [0, 26],
      skin: (g) => {
        g.speckle('all', tones(BAT_CHEST, 0.09));
        g.grain('all', shade(BAT_CHEST, 0.2), 0.1);
      },
    },
    // head
    {
      at: [0, 9, 0.5],
      size: [5, 4, 4],
      uv: [14, 18],
      skin: (g) => {
        g.speckle('all', tones(BAT, 0.08));
        const dark = '#120c0a';
        g.px('front', 1, 1, dark);
        g.px('front', 3, 1, dark);
        g.px('nx', 3, 1, dark);
        g.px('px', 0, 1, dark);
      },
    },
    {
      at: [0, 7.8, 3],
      size: [3, 2, 1],
      uv: [44, 18],
      skin: (g) => {
        g.speckle('all', tones('#9a6a58', 0.07));
        g.px('front', 1, 0, '#e8959c');
        g.px('front', 0, 1, '#f6f2ea');
        g.px('front', 2, 1, '#f6f2ea');
      },
    },
    // big pointed ears (cut out to a triangle), flaring outwards
    ...SIGNS.map(
      (s): PartSpec => ({
        at: [s * 1.6, 12, 0.5],
        size: [3, 4, 1],
        uv: [32, 18],
        rot: [0, 0, -s * 0.22],
        skin: (g) =>
          vplate(
            g,
            (x, y) => (y === 0 ? x === 1 : true),
            (x, y) => (x === 1 && y >= 1 ? (y === 3 ? '#c57f88' : '#e8a0aa') : tones(BAT, 0.1)[(g.rand() * 5) | 0])
          ),
      })
    ),
    // tail membrane between the legs
    {
      at: [0, 2.6, -2.6],
      size: [5, 1, 3],
      uv: [40, 26],
      skin: (g) => {
        const memb = tones(BAT_MEMB, 0.1);
        hplate(
          g,
          (x, r) => (r === 0 ? x === 1 || x === 3 : true),
          () => memb[(g.rand() * memb.length) | 0]
        );
      },
    },
    // wing arms (thick bone + muscle along the leading edge) and membranes share the same joint
    ...SIGNS.map(
      (s): PartSpec => ({
        at: [s * (BAT_SH[0] + 3.5), BAT_SH[1], BAT_SH[2] + 3],
        size: [7, 2, 2],
        uv: [18, 26],
        joint: { chan: 'flap', axis: 'z', amp: s * BAT_AMP, rest: s * BAT_REST, pivot: [s * BAT_SH[0], BAT_SH[1], BAT_SH[2]] },
        skin: (g) => g.speckle('all', tones(BAT, 0.1)),
      })
    ),
    ...wingPair({ size: [BAT_W, 1, BAT_D], sh: BAT_SH, uv: [0, 0], uvR: [0, 9], skin: batWing, amp: BAT_AMP, rest: BAT_REST }),
  ],
};

// =================================================================================================
// BEE
// =================================================================================================
const BEE_Y = '#f4b81c';
const BEE_B = '#2a2118';
// stripe colour by distance from the front (0 = nose): yellow face, black, yellow, black rear
const beeCol = (zf: number): string => ([0, 0, 0, 1, 1, 0, 0, 1, 1][zf] ? BEE_B : BEE_Y);
const beeStripes = (g: Paint, faces: readonly ('top' | 'bottom' | 'nx' | 'px')[], d: number): void => {
  for (let zf = 0; zf < d; zf++) {
    const pal = tones(beeCol(Math.min(zf, 8)), 0.06);
    for (const f of faces) {
      if (f === 'top') sp(g, 'top', 0, d - 1 - zf, g.w, 1, pal);
      else if (f === 'bottom') sp(g, 'bottom', 0, zf, g.w, 1, pal);
      else if (f === 'px') sp(g, 'px', zf, 0, 1, g.h, pal);
      else sp(g, 'nx', d - 1 - zf, 0, 1, g.h, pal);
    }
  }
};

const beeWing = (g: Paint, mirror: boolean): void => {
  const nat = (x: number) => (mirror ? 5 - x : x);
  const shape = ['..##..', '.####.', '######', '.#####', '..###.']; // rows back -> front, x root -> tip... mirrored below
  hplate(
    g,
    (x, r) => shape[r][nat(x)] === '#',
    (x, r) => {
      const nx = nat(x);
      const edge = r === 4 || nx === 0 || shape[r][nx + 1] !== '#' || (r > 0 && shape[r - 1][nx] !== '#');
      return edge ? '#eaf6ff' : (nx + r) % 2 === 0 ? '#d3e9f8' : '#bcd9ee';
    }
  );
};

const bee: SpeciesSpec = {
  kind: 'bee',
  name: { en: 'Bee', ar: 'نحلة' },
  emoji: '🐝',
  tex: [64, 32],
  move: 'fly',
  speed: 2.2,
  hp: 3,
  altitude: [1, 4],
  habitat: { biomes: ['plains', 'forest'], weight: 0.8, herd: [1, 3] },
  parts: [
    // six tiny legs
    ...[-2.5, 0, 2.5].flatMap((z, i) =>
      SIGNS.map(
        (s): PartSpec => ({
          at: [s * 2, 1, z],
          size: [1, 2, 1],
          uv: [50, 16],
          joint: { chan: 'idle', axis: 'x', amp: 0.25, phase: i * 1.3 + (s > 0 ? 0 : 0.8), pivot: [s * 2, 2, z] },
          skin: (g) => g.speckle('all', tones(BEE_B, 0.12)),
        })
      )
    ),
    // striped body
    {
      at: [0, 5, 0],
      size: [7, 6, 9],
      uv: [0, 0],
      skin: (g) => {
        sp(g, 'front', 0, 0, 7, 6, tones(BEE_Y, 0.05));
        sp(g, 'back', 0, 0, 7, 6, tones(BEE_B, 0.1));
        beeStripes(g, ['top', 'bottom', 'nx', 'px'], 9);
        // big dark eyes with a glint, a pale snout line and cheeks
        g.rect('front', 1, 2, 2, 3, '#1a1613');
        g.rect('front', 4, 2, 2, 3, '#1a1613');
        g.px('front', 1, 2, '#6a6a76');
        g.px('front', 4, 2, '#6a6a76');
        g.rect('front', 3, 4, 1, 1, '#8a5a1a');
        g.px('front', 0, 4, '#f9d35a');
        g.px('front', 6, 4, '#f9d35a');
        g.rect('nx', 8, 2, 1, 3, '#1a1613');
        g.rect('px', 0, 2, 1, 3, '#1a1613');
      },
    },
    // fuzzy caps round the corners of the body
    {
      at: [0, 5, -5],
      size: [5, 4, 1],
      uv: [32, 0],
      skin: (g) => g.speckle('all', tones(BEE_B, 0.1)),
    },
    {
      at: [0, 8.5, 0],
      size: [5, 1, 7],
      uv: [0, 16],
      skin: (g) => {
        // continue the stripes over the top (cap spans z -3.5 .. 3.5 => front distance 1 .. 8)
        for (let r = 0; r < 7; r++) {
          const zf = 7 - r + 0.5 | 0;
          sp(g, 'top', 0, r, 5, 1, tones(beeCol(Math.min(zf, 8)), 0.06));
          sp(g, 'bottom', 0, 6 - r, 5, 1, tones(beeCol(Math.min(zf, 8)), 0.06));
        }
        const col = (zf: number) => tones(beeCol(Math.min(zf, 8)), 0.06);
        for (let i = 0; i < 7; i++) {
          sp(g, 'nx', i, 0, 1, 1, col(8 - i));
          sp(g, 'px', i, 0, 1, 1, col(1 + i));
        }
        sp(g, 'front', 0, 0, 5, 1, tones(BEE_Y, 0.05));
        sp(g, 'back', 0, 0, 5, 1, tones(BEE_B, 0.08));
      },
    },
    // stinger
    {
      at: [0, 4.4, -6.5],
      size: [1, 1, 2],
      uv: [44, 0],
      skin: (g) => {
        g.speckle('all', tones('#5a4630', 0.08));
        g.px('back', 0, 0, '#2a1d12');
      },
    },
    // antennae
    ...SIGNS.map(
      (s): PartSpec => ({
        at: [s * 1.5, 9.4, 4.5],
        size: [1, 3, 1],
        uv: [50, 0],
        rot: [0.85, 0, -s * 0.2],
        joint: { chan: 'idle', axis: 'x', amp: 0.15, phase: s > 0 ? 0 : 1.5, pivot: [s * 1.5, 8, 3.8] },
        skin: (g) => {
          g.speckle('all', tones(BEE_B, 0.1));
          g.px('top', 0, 0, '#6a5a44');
        },
      })
    ),
    // gauzy wings
    ...wingPair({ size: [6, 1, 5], sh: [1, 9.2, 0.5], uv: [0, 24], uvR: [24, 24], skin: beeWing, amp: 0.75, rest: 0.35 }),
  ],
};

// =================================================================================================
// HAPPY GHAST (drawn at scale 2: an 18 px cube = 2.25 blocks)
// =================================================================================================
const GH = '#fdfbf4';
const GH_BLUE = '#bfe3fa';
const GH_BLUE_D = '#7dbbea';
const GH_INK = '#3a3a52';
const GH_LEN: readonly (readonly number[])[] = [
  [7, 5, 9],
  [9, 7, 5],
  [5, 9, 7],
]; // [row z][col x]: tentacle lengths
const GH_UV: Record<number, [number, number]> = { 5: [72, 0], 7: [80, 0], 9: [88, 0] };
const ghastTentacles: PartSpec[] = [];
GH_LEN.forEach((row, iz) =>
  row.forEach((len, ix) => {
    const x = (ix - 1) * 5;
    const z = (iz - 1) * 5;
    const n = iz * 3 + ix;
    ghastTentacles.push({
      at: [x, 9.5 - len / 2, z],
      size: [2, len, 2],
      uv: GH_UV[len],
      joint: { chan: 'idle', axis: n % 2 ? 'x' : 'z', amp: 0.2 + (n % 3) * 0.05, phase: n * 0.9, pivot: [x, 9.5, z] },
      skin: (g) => {
        g.speckle('all', tones(GH, 0.035));
        // soft shade fading toward the tip
        g.band('sides', Math.max(0, g.h - 3), g.h - 1, shade(GH, -0.05));
        g.band('sides', g.h - 1, g.h, shade(GH, -0.12));
        g.speckle('bottom', tones(shade(GH, -0.14), 0.03));
      },
    });
  })
);

const happyGhast: SpeciesSpec = {
  kind: 'happy_ghast',
  name: { en: 'Happy Ghast', ar: 'غاست سعيد' },
  emoji: '👻',
  tex: [128, 64],
  scale: 2,
  move: 'float',
  speed: 0.7,
  hp: 20,
  altitude: [7, 14],
  habitat: { weight: 0.12, herd: [1, 1] },
  parts: [
    {
      at: [0, 18, 0],
      size: [18, 18, 18],
      uv: [0, 0],
      skin: (g) => {
        g.speckle('all', tones(GH, 0.025));
        g.speckle('top', tones(shade(GH, 0.5), 0.02));
        g.speckle('bottom', tones(shade(GH, -0.12), 0.03));
        // soft shading: the lower part of every side is a touch darker
        for (const f of SIDES) {
          sp(g, f, 0, 12, 18, 3, tones(shade(GH, -0.03), 0.02));
          sp(g, f, 0, 15, 18, 3, tones(shade(GH, -0.06), 0.025));
        }
        // happy face: two closed upturned eyes, a gentle smile, pink cheeks
        const eye = (x0: number): void => {
          g.rect('front', x0 + 1, 6, 3, 1, GH_INK);
          g.px('front', x0, 7, GH_INK);
          g.px('front', x0 + 4, 7, GH_INK);
        };
        eye(2);
        eye(11);
        g.px('front', 5, 10, GH_INK);
        g.px('front', 12, 10, GH_INK);
        g.px('front', 6, 11, GH_INK);
        g.px('front', 11, 11, GH_INK);
        g.rect('front', 7, 12, 4, 1, GH_INK);
        g.rect('front', 1, 9, 3, 2, '#f9c9c4');
        g.rect('front', 14, 9, 3, 2, '#f9c9c4');
        // pale blue harness: belt round the body and a strap over the top and down both flanks
        for (const f of SIDES) {
          g.rect(f, 0, 14, 18, 1, GH_BLUE_D);
          g.rect(f, 0, 15, 18, 1, GH_BLUE);
          g.rect(f, 0, 16, 18, 1, GH_BLUE_D);
        }
        for (const f of ['nx', 'px'] as const) {
          g.rect(f, 7, 0, 1, 14, GH_BLUE_D);
          g.rect(f, 8, 0, 2, 14, GH_BLUE);
          g.rect(f, 10, 0, 1, 14, GH_BLUE_D);
        }
        g.rect('top', 0, 7, 18, 1, GH_BLUE_D);
        g.rect('top', 0, 8, 18, 2, GH_BLUE);
        g.rect('top', 0, 10, 18, 1, GH_BLUE_D);
      },
    },
    // harness: saddle bar on top and a ring on each flank
    {
      at: [0, 27.5, 0],
      size: [10, 1, 4],
      uv: [0, 36],
      skin: (g) => {
        g.speckle('all', tones(GH_BLUE, 0.04));
        g.rect('top', 0, 1, 10, 2, GH_BLUE_D);
      },
    },
    ...SIGNS.map(
      (s): PartSpec => ({
        at: [s * 9.5, 13, 0],
        size: [1, 2, 2],
        uv: [60, 36],
        skin: (g) => g.speckle('all', tones('#7a93b0', 0.06)),
      })
    ),
    ...ghastTentacles,
  ],
};

export const SPECIES: SpeciesSpec[] = [chicken, parrot, bat, bee, happyGhast];
