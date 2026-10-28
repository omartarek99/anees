// Amphibians and a lava-walker: axolotl, frog, tadpole, turtle, strider.
// Box models + painted skins + behaviour knobs, in the style of exemplars.ts.
import type { Face, Paint, PartSpec, SkinFn, SpeciesSpec, Vec3 } from '../types';
import { legs2, mix, shade, tones } from './kit';

type UV = [number, number];

/** Shelf-packs box unwraps ((2d+2w) x (d+h) each, tallest first) into a W-wide atlas, so uv rectangles can never overlap. */
function pack<K extends string>(sizes: Record<K, Vec3>, W: number): Record<K, UV> {
  const items = (Object.keys(sizes) as K[]).map((k) => {
    const [w, h, d] = sizes[k];
    return { k, uw: 2 * (d + w), uh: d + h };
  });
  items.sort((a, b) => b.uh - a.uh);
  const out = {} as Record<K, UV>;
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const it of items) {
    if (x + it.uw > W) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    out[it.k] = [x, y];
    x += it.uw;
    rowH = Math.max(rowH, it.uh);
  }
  return out;
}

const SIDES = ['nx', 'front', 'px', 'back'] as const;

/** A box of kind `k` from a size table + its packed uv table. */
function box<K extends string>(Z: Record<K, Vec3>, U: Record<K, UV>, k: K, at: Vec3, skin: SkinFn, extra: Partial<PartSpec> = {}): PartSpec {
  return { at, size: Z[k], uv: U[k], skin, ...extra };
}

/** Paint a thin 1-px plane (fin, frill, leaf) so its big faces keep a ragged outline: `keep(x, y)` decides which pixels exist on
 *  the front face; the back face is the mirror image so the holes line up. Edge faces are filled with `edge`. */
function plane(g: Paint, pal: readonly string[], keep: (x: number, y: number) => boolean, edge?: string): void {
  const { w, h } = g.size('front');
  if (edge) g.fill(['nx', 'px', 'top', 'bottom'], edge);
  else g.speckle(['nx', 'px', 'top', 'bottom'], pal);
  for (const face of ['front', 'back'] as const) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const fx = face === 'front' ? x : w - 1 - x;
        if (keep(fx, y)) g.px(face, x, y, pal[(g.rand() * pal.length) | 0]);
      }
    }
  }
}

// =============================================================================================
// Axolotl: flat smiling head, feathery gill frills, short legs, finned tail
// =============================================================================================
const AXO = [
  { body: '#f4b6c8', belly: '#fbdbe5', gill: '#e4577f', fleck: '#e898b0' }, // lucy (pink)
  { body: '#7a5240', belly: '#a98467', gill: '#b96d79', fleck: '#4e3326' }, // wild brown
  { body: '#f1cd6c', belly: '#fbe8a6', gill: '#e8933c', fleck: '#d6a940' }, // gold
  { body: '#9cc4d3', belly: '#d3e6ec', gill: '#e592ac', fleck: '#6a9caf' }, // cyan
  { body: '#3b64c2', belly: '#6c92dc', gill: '#8ca6ff', fleck: '#27468f' }, // blue
] as const;
const AXZ = {
  body: [8, 4, 10],
  head: [8, 5, 5],
  tailA: [2, 5, 6],
  tailB: [1, 4, 6],
  leg: [3, 3, 3],
  gillS: [5, 2, 1],
  gillM: [6, 2, 1],
} as const satisfies Record<string, Vec3>;
const AXU = pack(AXZ, 64);

function axolotl(): SpeciesSpec {
  const sk = (g: Paint) => AXO[g.variant];
  const frills = ([1, -1] as const).flatMap((s) =>
    (
      [
        // upper, middle (longest), lower frill; tilted up / level / down; different sway phases
        { k: 'gillS', y: 6.1, rz: 0.55, ph: 0, holes: [[4, 0], [2, 1]] },
        { k: 'gillM', y: 4.3, rz: 0.1, ph: 2.1, holes: [[5, 0], [3, 1], [2, 0]] },
        { k: 'gillS', y: 2.5, rz: -0.5, ph: 4.2, holes: [[4, 1], [3, 0]] },
      ] as const
    ).map((f, i): PartSpec => {
      const w = AXZ[f.k][0];
      return box(
        AXZ,
        AXU,
        f.k,
        [s * (3.5 + w / 2), f.y, 5.4],
        (g) => {
          const c = sk(g);
          const pal = [...tones(c.gill, 0.07), shade(c.gill, 0.22)];
          plane(g, pal, (x, y) => !f.holes.some(([hx, hy]) => hx === x && hy === y));
        },
        { rot: [0, s * 0.45, s * f.rz], joint: { chan: 'idle', axis: 'z', amp: s * (0.2 + i * 0.03), phase: f.ph + (s < 0 ? 0.7 : 0), pivot: [s * 3.5, f.y, 5.4] } }
      );
    })
  );

  const finEdge = (g: Paint) => {
    const c = sk(g);
    g.speckle('all', tones(c.body, 0.05));
    g.speckle('bottom', tones(c.belly, 0.04));
    g.grain('all', c.fleck, g.variant === 1 ? 0.14 : 0.05);
    g.rect('nx', 0, 0, g.d, 1, c.gill);
    g.rect('px', 0, 0, g.d, 1, c.gill);
    g.rect('top', 0, 0, g.w, g.d, c.gill);
  };

  return {
    kind: 'axolotl',
    name: { en: 'Axolotl', ar: 'أكسولوتل' },
    emoji: '🦎',
    tex: [64, 32],
    variants: 5,
    move: 'swim',
    speed: 1.0,
    hp: 8,
    minWater: 1,
    depth: [0.3, 2],
    habitat: { weight: 0.4, herd: [1, 2] },
    parts: [
      box(AXZ, AXU, 'body', [0, 4, -1], (g) => {
        const c = sk(g);
        g.speckle('all', tones(c.body, 0.05));
        g.speckle('bottom', tones(c.belly, 0.04));
        g.band('sides', 3, 4, c.belly);
        g.grain(['top', 'nx', 'px', 'back'], c.fleck, g.variant === 1 ? 0.16 : 0.06);
        g.rect('top', 3, 0, 2, 10, shade(c.body, -0.07));
      }),
      box(
        AXZ,
        AXU,
        'head',
        [0, 4.2, 6.5],
        (g) => {
          const c = sk(g);
          const dark = '#2a1a1e';
          g.speckle('all', tones(c.body, 0.05));
          g.speckle('bottom', tones(c.belly, 0.04));
          g.band(['nx', 'px'], 4, 5, c.belly);
          g.band('front', 4, 5, c.belly);
          g.grain(['top', 'nx', 'px'], c.fleck, g.variant === 1 ? 0.14 : 0.05);
          // two little eyes, blush cheeks, the wide axolotl smile
          g.rect('front', 1, 0, 1, 2, '#17101a');
          g.rect('front', 6, 0, 1, 2, '#17101a');
          g.px('front', 0, 2, shade(c.gill, 0.25));
          g.px('front', 7, 2, shade(c.gill, 0.25));
          g.px('front', 1, 3, shade(dark, 0.1));
          g.px('front', 6, 3, shade(dark, 0.1));
          g.rect('front', 2, 4, 4, 1, shade(dark, 0.1));
        },
        {}
      ),
      ...frills,
      ...([
        [1, 2.2],
        [-1, 2.2],
        [1, -3.6],
        [-1, -3.6],
      ] as const).map(([s, z]) =>
        box(
          AXZ,
          AXU,
          'leg',
          [s * 4.8, 1.5, z],
          (g) => {
            const c = sk(g);
            g.speckle('all', tones(c.body, 0.05));
            g.rect('front', 0, 2, 3, 1, c.belly);
            g.rect('bottom', 0, 0, 3, 3, c.belly);
          },
          { joint: { chan: 'walk', axis: 'x', amp: 0.7, phase: (s > 0) === (z > 0) ? 0 : Math.PI } }
        )
      ),
      box(AXZ, AXU, 'tailA', [0, 4.2, -9], finEdge, { joint: { chan: 'tail', axis: 'y', amp: 0.18, pivot: [0, 4, -6] } }),
      box(
        AXZ,
        AXU,
        'tailB',
        [0, 3.8, -15],
        (g) => {
          const c = sk(g);
          g.speckle('all', tones(c.body, 0.05));
          g.speckle('bottom', tones(c.belly, 0.04));
          g.grain('all', c.fleck, g.variant === 1 ? 0.14 : 0.05);
          g.rect('nx', 0, 0, g.d, 1, c.gill);
          g.rect('px', 0, 0, g.d, 1, c.gill);
          g.rect('top', 0, 0, g.w, g.d, c.gill);
          g.rect('back', 0, 0, g.w, g.h, c.gill);
        },
        { joint: { chan: 'tail', axis: 'y', amp: 0.38, phase: 0.8, pivot: [0, 4, -12] } }
      ),
    ],
  };
}

// =============================================================================================
// Frog: squat, bulging eyes on top, white throat, long folded hind legs, wide mouth
// =============================================================================================
const FRG = [
  { skin: '#b8652b', spot: '#74391a', hi: '#d98d4a', toe: '#e0a860' }, // temperate: orange-brown
  { skin: '#d5d2c3', spot: '#a29e8e', hi: '#ecebdf', toe: '#bdb9a8' }, // warm: pale gray-white
  { skin: '#5a9a3e', spot: '#2e5c26', hi: '#88c35b', toe: '#7db050' }, // cold: green
] as const;
const THROAT = '#f0ebd6';
const FZ = {
  body: [7, 4, 8],
  head: [7, 3, 4],
  eye: [3, 2, 3],
  throat: [5, 2, 3],
  arm: [2, 3, 2],
  hand: [3, 1, 3],
  thigh: [3, 5, 5],
  foot: [3, 1, 6],
} as const satisfies Record<string, Vec3>;
const FU = pack(FZ, 64);

function frog(): SpeciesSpec {
  const sk = (g: Paint) => FRG[g.variant];
  const arm = (g: Paint) => {
    const c = sk(g);
    g.speckle('all', tones(c.skin, 0.06));
    g.rect('front', 0, 2, 2, 1, c.hi);
  };
  const thigh = (g: Paint) => {
    const c = sk(g);
    g.speckle('all', tones(c.skin, 0.06));
    g.band(['nx', 'px'], 1, 2, c.spot);
    g.band(['nx', 'px'], 3, 4, mix(c.skin, c.spot, 0.55));
    g.speckle('top', tones(shade(c.skin, 0.1), 0.05));
    g.rect('back', 0, 3, 3, 2, c.hi);
  };
  const handSkin = (g: Paint) => {
    const c = sk(g);
    g.speckle('all', tones(c.toe, 0.05));
    g.rect('top', 0, g.d - 1, g.w, 1, shade(c.toe, -0.2));
    g.rect('front', 0, 0, g.w, 1, shade(c.toe, -0.2));
  };
  const hind = (s: 1 | -1, k: 'thigh' | 'foot', at: Vec3, skin: SkinFn) =>
    box(FZ, FU, k, [s * at[0], at[1], at[2]], skin, { joint: { chan: 'walk', axis: 'x', amp: 0.8, phase: 0, pivot: [s * 4.2, 6, -3.5] } });
  const fore = (s: 1 | -1, k: 'arm' | 'hand', at: Vec3, skin: SkinFn) =>
    box(FZ, FU, k, [s * at[0], at[1], at[2]], skin, { joint: { chan: 'walk', axis: 'x', amp: -0.5, phase: 0, pivot: [s * 2.5, 4, 2] } });

  return {
    kind: 'frog',
    name: { en: 'Frog', ar: 'ضفدع' },
    emoji: '🐸',
    tex: [64, 32],
    variants: 3,
    move: 'hop',
    hop: 6.5,
    speed: 1.6,
    hp: 6,
    habitat: { weight: 0.6, biomes: ['plains', 'forest'], herd: [1, 2] },
    parts: [
      box(FZ, FU, 'body', [0, 4, -1], (g) => {
        const c = sk(g);
        g.speckle('all', tones(c.skin, 0.06));
        g.speckle('bottom', tones(THROAT, 0.03));
        g.band('sides', 3, 4, c.hi);
        for (const [x, y, r] of [[2, 1, 1.5], [5, 3, 1.8], [2, 5, 1.4], [5, 7, 1.2]] as const) g.blob('top', x, y, r, c.spot);
        for (const [x, y, r] of [[2, 0, 1.2], [6, 1, 1.0]] as const) {
          g.blob('nx', x, y, r, c.spot);
          g.blob('px', 7 - x, y, r, c.spot);
        }
        g.blob('back', 2, 1, 1.2, c.spot);
        g.blob('back', 5, 2, 1.0, c.spot);
      }),
      box(FZ, FU, 'head', [0, 5, 5], (g) => {
        const c = sk(g);
        const line = shade(c.spot, -0.35);
        g.speckle('all', tones(c.skin, 0.06));
        g.speckle('bottom', tones(THROAT, 0.03));
        g.rect('front', 0, 1, 7, 1, line); // the wide mouth
        g.rect('front', 0, 2, 7, 1, THROAT);
        g.px('front', 2, 0, line); // nostrils
        g.px('front', 4, 0, line);
        g.band(['nx', 'px'], 1, 2, line);
        g.band(['nx', 'px'], 2, 3, shade(c.hi, 0.1));
        g.blob('top', 3, 2, 1.0, c.spot);
      }),
      box(FZ, FU, 'throat', [0, 3.5, 6], (g) => {
        g.speckle('all', tones(THROAT, 0.03));
        g.rect('front', 0, 0, g.w, 1, shade(THROAT, -0.1));
      }),
      ...([1, -1] as const).map((s) =>
        box(FZ, FU, 'eye', [s * 2.2, 7.5, 4], (g) => {
          const c = sk(g);
          g.speckle('all', tones(c.skin, 0.05));
          // golden iris with a dark pupil, on the front and the outer side
          g.rect('front', 0, 0, 3, 2, '#e8c449');
          g.rect('front', 1, 0, 1, 2, '#15110c');
          g.rect('nx', 0, 0, 3, 2, shade(c.skin, 0.05));
          g.rect('nx', 2, 0, 1, 2, '#e8c449');
          g.rect('px', 0, 0, 1, 2, '#e8c449');
          g.px('top', 1, 2, shade(c.hi, 0.2));
        })
      ),
      ...([1, -1] as const).map((s) => fore(s, 'arm', [2.5, 2.5, 2], arm)),
      ...([1, -1] as const).map((s) => fore(s, 'hand', [2.5, 0.5, 2.5], handSkin)),
      ...([1, -1] as const).map((s) => hind(s, 'thigh', [4.2, 3.5, -3.5], thigh)),
      ...([1, -1] as const).map((s) => hind(s, 'foot', [4.2, 0.5, -1.5], handSkin)),
    ],
  };
}

// =============================================================================================
// Tadpole: a dark round blob with a leaf-shaped tail that ripples (six tail segments, growing swing)
// =============================================================================================
const TADC = { body: '#53402f', lo: '#3a2d23', hi: '#7a634d', belly: '#98805f', tail: '#4a3a2c' };
const TZ = {
  body: [5, 3, 6],
  dome: [3, 1, 5],
  belly: [3, 1, 5],
  snout: [3, 2, 1],
  eye: [1, 1, 1],
  seg0: [2, 3, 2],
  segA: [1, 4, 2],
  segB: [1, 5, 2],
  segC: [1, 3, 2],
} as const satisfies Record<string, Vec3>;
const TU = pack(TZ, 64);

function tadpole(): SpeciesSpec {
  const blob = (base: string, extra?: (g: Paint) => void): SkinFn => (g) => {
    g.speckle('all', tones(base, 0.07));
    g.grain('all', TADC.hi, 0.08);
    extra?.(g);
  };
  const tailSkin = (g: Paint) => {
    g.speckle('all', tones(TADC.tail, 0.08));
    g.grain('all', TADC.hi, 0.1);
    g.band(['nx', 'px'], 0, 1, TADC.hi);
    g.band('bottom', 0, g.d, TADC.lo);
  };
  const segs = ([['seg0', 0], ['segA', 1], ['segB', 2], ['segB', 3], ['segA', 4], ['segC', 5]] as const).map(([k, i]) =>
    box(TZ, TU, k, [0, 2.5, -2 - 2 * i], tailSkin, {
      joint: { chan: 'tail', axis: 'y', amp: 0.12 + 0.09 * i, phase: i * 0.6, pivot: [0, 2.5, -1 - 2 * i] },
    })
  );
  return {
    kind: 'tadpole',
    name: { en: 'Tadpole', ar: 'شرغوف' },
    emoji: '🐸',
    tex: [64, 32],
    move: 'swim',
    speed: 0.8,
    hp: 2,
    minWater: 1,
    depth: [0.3, 1.5],
    habitat: { weight: 0.5, herd: [2, 4] },
    parts: [
      box(TZ, TU, 'body', [0, 2.5, 2], blob(TADC.body)),
      box(TZ, TU, 'dome', [0, 4.5, 2], blob(TADC.lo)),
      box(TZ, TU, 'belly', [0, 0.5, 2], blob(TADC.belly)),
      box(TZ, TU, 'snout', [0, 2.5, 5.5], blob(TADC.body, (g) => g.rect('front', 0, 1, 3, 1, TADC.lo))),
      ...([1, -1] as const).map((s) =>
        box(TZ, TU, 'eye', [s * 2.5, 4.5, 4], (g) => {
          g.fill('all', '#0b0806');
          g.fill('top', '#efe3c4');
        })
      ),
      ...segs,
    ],
  };
}

// =============================================================================================
// Turtle: domed green shell with a lighter scute pattern, pale belly, long front / short back flippers
// =============================================================================================
const SHELL = { base: '#4a8a3c', dark: '#386d2e', line: '#b6c76a', rim: '#a3b062' };
const PLATES = [SHELL.base, shade(SHELL.base, -0.16), shade(SHELL.base, 0.14), shade(SHELL.base, -0.05)];
const SEAM = mix(SHELL.line, SHELL.base, 0.3);
const SKIN = { base: '#8d9e5e', dark: '#6f7f45', hi: '#a9b878' };
const PLAS = '#dcd3a0';
const UZ = {
  plastron: [10, 1, 14],
  rim: [14, 2, 17],
  shell1: [11, 2, 14],
  shell2: [9, 1, 12],
  shell3: [5, 1, 8],
  neck: [4, 3, 3],
  head: [5, 4, 5],
  flipF: [7, 1, 4],
  flipB: [4, 1, 4],
  tail: [2, 1, 3],
} as const satisfies Record<string, Vec3>;
const UU = pack(UZ, 128);

/** Staggered plates ("scutes") of ch rows x cw columns: each plate gets one of `plates`, edges are drawn in `line`. */
function scutes(g: Paint, face: Face, line: string, plates: readonly string[], cw = 4, ch = 4): void {
  const { w, h } = g.size(face);
  for (let y = 0; y < h; y++) {
    const band = Math.floor(y / ch);
    const off = (band % 2) * (cw >> 1);
    for (let x = 0; x < w; x++) {
      const u = x + cw * 8 - off;
      const edge = y % ch === 0 || u % cw === 0;
      g.px(face, x, y, edge ? line : plates[(band * 3 + Math.floor(u / cw) * 5) % plates.length]);
    }
  }
}

function turtle(): SpeciesSpec {
  const shell1: SkinFn = (g) => {
    g.speckle('all', [SHELL.base, SHELL.base, SHELL.dark, shade(SHELL.base, 0.08)]);
    g.speckle('top', PLATES);
    for (const f of SIDES) scutes(g, f, shade(SHELL.line, -0.15), PLATES, 4, 2);
  };
  const flipper = (g: Paint) => {
    g.speckle('all', tones(SKIN.base, 0.07));
    g.speckle('bottom', tones(shade(SKIN.base, 0.2), 0.04));
    g.grain('top', SKIN.dark, 0.14);
    g.rect('front', 0, 0, g.w, 1, SKIN.hi);
  };
  const front = ([1, -1] as const).map((s) =>
    box(UZ, UU, 'flipF', [s * 8.5, 0.5, 5.5], flipper, {
      rot: [0, s * 0.45, 0],
      joint: { chan: 'walk', axis: 'y', amp: s * 0.5, phase: s > 0 ? 0 : Math.PI, pivot: [s * 5, 0.5, 5.5] },
    })
  );
  const back = ([1, -1] as const).map((s) =>
    box(UZ, UU, 'flipB', [s * 6.8, 0.5, -6.5], flipper, {
      rot: [0, s * 0.4, 0],
      joint: { chan: 'walk', axis: 'y', amp: s * 0.5, phase: s > 0 ? Math.PI : 0, pivot: [s * 5, 0.5, -6.5] },
    })
  );
  return {
    kind: 'turtle',
    name: { en: 'Turtle', ar: 'سلحفاة' },
    emoji: '🐢',
    tex: [128, 64],
    move: 'walk',
    speed: 0.5,
    hp: 8,
    habitat: { weight: 0.4, biomes: ['desert', 'plains'], herd: [1, 2] },
    parts: [
      box(UZ, UU, 'plastron', [0, 1.5, 0], (g) => {
        g.speckle('all', tones(PLAS, 0.05));
        scutes(g, 'bottom', shade(PLAS, -0.18), tones(PLAS, 0.04, 3), 4, 4);
      }),
      box(UZ, UU, 'rim', [0, 3, -0.5], (g) => {
        g.speckle('all', tones(SHELL.rim, 0.06));
        g.speckle('bottom', tones(PLAS, 0.04));
        for (const f of SIDES) for (let x = 1; x < 17; x += 3) g.rect(f, x, 0, 1, 2, shade(SHELL.rim, -0.3));
        g.band(SIDES, 0, 1, shade(SHELL.base, 0.05));
        g.speckle('top', [SHELL.base, SHELL.dark]);
      }),
      box(UZ, UU, 'shell1', [0, 5, -0.5], shell1),
      box(UZ, UU, 'shell2', [0, 6.5, -0.5], (g) => {
        g.speckle('all', PLATES);
        scutes(g, 'top', SEAM, PLATES, 4, 4);
        g.band(SIDES, 0, 1, SHELL.dark);
      }),
      box(UZ, UU, 'shell3', [0, 7.5, -0.5], (g) => {
        g.speckle('all', PLATES);
        scutes(g, 'top', SEAM, PLATES, 3, 3);
        g.band(SIDES, 0, 1, SHELL.dark);
      }),
      box(UZ, UU, 'neck', [0, 2.5, 8], (g) => {
        g.speckle('all', tones(SKIN.base, 0.06));
        g.speckle('bottom', tones(shade(SKIN.base, 0.2), 0.04));
      }),
      box(UZ, UU, 'head', [0, 3, 11], (g) => {
        g.speckle('all', tones(SKIN.base, 0.06));
        g.speckle('bottom', tones(shade(SKIN.base, 0.2), 0.04));
        g.grain('top', SKIN.dark, 0.16);
        g.rect('front', 1, 1, 1, 1, '#14110d'); // eyes
        g.rect('front', 3, 1, 1, 1, '#14110d');
        g.rect('front', 1, 3, 3, 1, SKIN.dark); // mouth
        g.px('front', 2, 2, SKIN.dark); // nostril
        g.band(['nx', 'px'], 3, 4, SKIN.dark);
        g.px('nx', 3, 1, '#14110d');
        g.px('px', 1, 1, '#14110d');
      }),
      ...front,
      ...back,
      box(UZ, UU, 'tail', [0, 1.5, -10.5], flipper, { joint: { chan: 'tail', axis: 'y', amp: 0.4, pivot: [0, 1.5, -9] } }),
    ],
  };
}

// =============================================================================================
// Strider: a boxy lava-walker on two tall thin legs, wide-mouthed face, long bristle hair, tiny arms
// =============================================================================================
const STR = [
  // 0 = cold (purple-blue), 1 = warm (red-orange)
  { body: '#5b5185', hi: '#7a6fb0', lo: '#433a69', leg: '#6d62a0', mouth: '#1d1830', lip: '#9488c6', hair: '#8f7bd0', hairHi: '#bba9f0', hairLo: '#6a58a8' },
  { body: '#b8382b', hi: '#dc5b3a', lo: '#8a2820', leg: '#e0722a', mouth: '#3b1310', lip: '#f08a52', hair: '#f08f2c', hairHi: '#ffc247', hairLo: '#d4511a' },
] as const;
const STZ = {
  body: [14, 13, 14],
  leg: [3, 16, 3],
  arm: [2, 5, 2],
  bristleL: [6, 1, 12],
  bristleR: [6, 1, 12],
  comb: [10, 5, 1],
} as const satisfies Record<string, Vec3>;
const STU = pack(STZ, 128);

function strider(): SpeciesSpec {
  const sk = (g: Paint) => STR[g.variant];
  /** a flat fringe of hair: strands run outwards from the body, with ragged tips (cut-out pixels) */
  const bristle = (mirror: boolean): SkinFn => (g) => {
    const c = sk(g);
    const { w, d } = g;
    const len = Array.from({ length: d }, () => w - 2 + ((g.rand() * 3) | 0));
    g.fill(['nx', 'px', 'front', 'back'], c.hair);
    for (const face of ['top', 'bottom'] as const) {
      for (let r = 0; r < d; r++) {
        const L = len[face === 'top' ? r : d - 1 - r];
        for (let x = 0; x < Math.min(L, w); x++) {
          const t = Math.min(1, x / (w - 1) + (g.rand() - 0.5) * 0.4);
          g.px(face, mirror ? w - 1 - x : x, r, mix(c.hairLo, c.hairHi, Math.max(0, t)));
        }
      }
    }
  };
  /** an upright comb of hair on the back: ragged top edge */
  const comb: SkinFn = (g) => {
    const c = sk(g);
    const { w, h } = g;
    const hs = Array.from({ length: w }, () => h - 2 + ((g.rand() * 3) | 0));
    g.fill(['nx', 'px', 'top', 'bottom'], c.hair);
    for (const face of ['front', 'back'] as const) {
      for (let x = 0; x < w; x++) {
        const H = Math.min(h, hs[face === 'front' ? x : w - 1 - x]);
        for (let y = h - H; y < h; y++) g.px(face, x, y, mix(c.hairHi, c.hairLo, (y - (h - H)) / Math.max(1, H - 1) + (g.rand() - 0.5) * 0.3));
      }
    }
  };
  const legSkin: SkinFn = (g) => {
    const c = sk(g);
    g.speckle('all', tones(c.leg, 0.09));
    for (const f of SIDES) g.rect(f, 0, 13, 3, 3, shade(c.leg, -0.22));
    g.speckle('bottom', tones(shade(c.leg, -0.3), 0.05));
  };
  const sideBristles = ([1, -1] as const).flatMap((s) =>
    (
      [
        { y: 25.5, rz: 0.55, ph: 0 },
        { y: 21.5, rz: 0.12, ph: 1.7 },
        { y: 17.5, rz: -0.4, ph: 3.4 },
      ] as const
    ).map((b): PartSpec =>
      box(STZ, STU, s > 0 ? 'bristleL' : 'bristleR', [s * 9.5, b.y, 0], s > 0 ? bristle(false) : bristle(true), {
        rot: [0, 0, s * b.rz],
        joint: { chan: 'idle', axis: 'z', amp: s * 0.1, phase: b.ph + (s < 0 ? 0.9 : 0), pivot: [s * 6.5, b.y, 0] },
      })
    )
  );
  return {
    kind: 'strider',
    name: { en: 'Strider', ar: 'ستريدر' },
    emoji: '🔥',
    tex: [128, 64],
    variants: 2,
    move: 'walk',
    speed: 1.0,
    hp: 15,
    shiver: true,
    habitat: { weight: 0.1, herd: [1, 1] },
    parts: [
      box(STZ, STU, 'body', [0, 20.5, 0], (g) => {
        const c = sk(g);
        g.speckle('all', [c.body, c.body, c.body, c.lo, c.hi]);
        g.speckle('top', [c.lo, c.body, c.lo]);
        g.speckle('bottom', tones(c.lo, 0.08));
        for (let x = 1; x < 14; x += 3) g.rect('back', x, 0, 1, 13, shade(c.body, -0.12)); // muscle ridges
        // the face: heavy brow, small dark eyes, nostrils, a wide mouth with a pale lip
        g.rect('front', 2, 3, 4, 1, c.lo);
        g.rect('front', 8, 3, 4, 1, c.lo);
        g.rect('front', 3, 4, 2, 2, '#100d18');
        g.rect('front', 9, 4, 2, 2, '#100d18');
        g.px('front', 3, 4, c.hairHi);
        g.px('front', 9, 4, c.hairHi);
        g.px('front', 6, 6, c.lo);
        g.px('front', 7, 6, c.lo);
        g.rect('front', 2, 8, 10, 2, c.mouth);
        g.px('front', 1, 9, c.mouth);
        g.px('front', 12, 9, c.mouth);
        g.rect('front', 3, 10, 8, 1, c.lip);
        g.px('front', 4, 9, c.lip);
        g.px('front', 7, 9, c.lip);
        g.px('front', 10, 9, c.lip);
      }),
      ...legs2({ size: STZ.leg, x: 3.5, z: 0, uv: STU.leg, skin: legSkin, amp: 0.6 }),
      ...([1, -1] as const).map((s) =>
        box(
          STZ,
          STU,
          'arm',
          [s * 5.5, 13.5, 8],
          (g) => {
            const c = sk(g);
            g.speckle('all', tones(c.body, 0.08));
            g.rect('front', 0, 3, 2, 2, c.hi);
            g.speckle('bottom', tones(c.lo, 0.06));
          },
          { joint: { chan: 'idle', axis: 'x', amp: 0.3, phase: s > 0 ? 0 : 1.6, pivot: [s * 5.5, 16, 8] } }
        )
      ),
      ...sideBristles,
      ...([-4, 0, 4] as const).map((z, i) =>
        box(STZ, STU, 'comb', [0, 29, z], comb, {
          rot: [-0.3, 0, 0],
          joint: { chan: 'idle', axis: 'x', amp: 0.09, phase: i * 1.3, pivot: [0, 26.5, z] },
        })
      ),
    ],
  };
}

export const SPECIES: SpeciesSpec[] = [axolotl(), frog(), tadpole(), turtle(), strider()];
