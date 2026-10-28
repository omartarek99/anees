// Wild land mammals: ocelot, fox, panda, polar bear, armadillo, sniffer.
import type { Face, Paint, PartSpec, SpeciesSpec } from '../types';
import { headDip, legs4, mix, shade, tailWag, tones } from './kit';

// ---- small painting helpers ---------------------------------------------------------------------
/** Scatter dark marks (1-2 px wide) over faces; `density` = share of the face area. */
function spots(g: Paint, faces: readonly Face[], color: string, density: number, wide = 2): void {
  for (const f of faces) {
    const { w, h } = g.size(f);
    const n = Math.round(w * h * density);
    for (let i = 0; i < n; i++) g.rect(f, (g.rand() * w) | 0, (g.rand() * h) | 0, 1 + ((g.rand() * wide) | 0), 1, color);
  }
}
/** A speckled rectangle (like g.speckle, but only part of a face). */
function patch(g: Paint, face: Face, x: number, y: number, w: number, h: number, palette: readonly string[]): void {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) g.px(face, x + xx, y + yy, palette[(g.rand() * palette.length) | 0]);
}
/** One row of a face where each pixel flips to `color` with probability p (a ragged colour edge). */
function ragged(g: Paint, face: Face, y: number, color: string, p = 0.5): void {
  const { w } = g.size(face);
  for (let x = 0; x < w; x++) if (g.rand() < p) g.px(face, x, y, color);
}
/** Paints one pixel-slice across a box that is long in z (a tail): i = 0 at the root (+z end), growing away from the body. */
function slice(g: Paint, i: number, color: string, p = 1): void {
  const put = (face: Face, x: number, y: number) => {
    if (p >= 1 || g.rand() < p) g.px(face, x, y, color);
  };
  for (let y = 0; y < g.h; y++) {
    put('px', i, y);
    put('nx', g.d - 1 - i, y);
  }
  for (let x = 0; x < g.w; x++) {
    put('top', x, g.d - 1 - i);
    put('bottom', x, i);
  }
}

// ---- Ocelot -------------------------------------------------------------------------------------
const OC = '#d9b360';
const OC_SPOT = '#46301a';
const OC_BELLY = '#f2e6c0';
const ocelot: SpeciesSpec = {
  kind: 'ocelot',
  name: { en: 'Ocelot', ar: 'أوسيلوت' },
  emoji: '🐆',
  tex: [64, 32],
  move: 'walk',
  speed: 2.0,
  hp: 10,
  graze: false,
  habitat: { biomes: ['forest'], weight: 0.4, herd: [1, 1] },
  parts: [
    {
      at: [0, 8.5, -0.5],
      size: [4, 5, 13],
      uv: [0, 0],
      skin: (g) => {
        g.speckle('all', tones(OC, 0.05));
        g.speckle('bottom', tones(OC_BELLY, 0.04));
        for (const f of ['nx', 'px'] as const) {
          g.rect(f, 0, 4, 13, 1, OC_BELLY);
          ragged(g, f, 3, OC_BELLY, 0.4);
        }
        spots(g, ['nx', 'px', 'top'], OC_SPOT, 0.13);
        spots(g, ['front', 'back'], OC_SPOT, 0.1, 1);
      },
    },
    {
      at: [0, 10.5, 7.5],
      size: [5, 4, 4],
      uv: [0, 18],
      skin: (g) => {
        g.speckle('all', tones(OC, 0.05));
        spots(g, ['nx', 'px'], OC_SPOT, 0.12, 1);
        g.rect('top', 1, 0, 1, 3, OC_SPOT);
        g.rect('top', 3, 0, 1, 3, OC_SPOT);
        g.px('front', 1, 0, OC_SPOT);
        g.px('front', 3, 0, OC_SPOT);
        g.px('front', 1, 1, '#d8e24c');
        g.px('front', 3, 1, '#d8e24c');
        g.px('front', 0, 1, OC_SPOT);
        g.px('front', 4, 1, OC_SPOT);
        g.px('front', 0, 2, OC_SPOT);
        g.px('front', 4, 2, OC_SPOT);
        g.px('front', 0, 3, OC_BELLY);
        g.px('front', 4, 3, OC_BELLY);
      },
    },
    {
      at: [0, 9.5, 10],
      size: [3, 2, 1],
      uv: [18, 18],
      skin: (g) => {
        g.speckle('all', tones(OC_BELLY, 0.03));
        g.px('front', 1, 0, '#b8665a');
        g.px('front', 0, 1, shade(OC_SPOT, 0.2));
        g.px('front', 2, 1, shade(OC_SPOT, 0.2));
      },
    },
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 1.7, 13.3, 6.8],
        size: [2, 2, 1],
        uv: [26, 18],
        rot: [0, 0, s * 0.12],
        skin: (g) => {
          g.speckle('all', tones(shade(OC, -0.15), 0.04));
          g.rect('back', 0, 0, 2, 2, OC_SPOT);
          g.px('front', 0, 1, '#e8a9a0');
          g.px('front', 1, 1, '#e8a9a0');
          g.rect('top', 0, 0, 2, 1, OC_SPOT);
        },
      })
    ),
    ...legs4({
      size: [2, 6, 2],
      x: 1.25,
      zFront: 4.5,
      zBack: -5,
      uv: [34, 11],
      amp: 0.9,
      skin: (g) => {
        g.speckle('all', tones(OC, 0.05));
        spots(g, ['nx', 'px', 'front', 'back'], OC_SPOT, 0.12, 1);
        for (const f of ['nx', 'front', 'px', 'back'] as const) g.rect(f, 0, 4, 2, 2, OC_BELLY);
      },
    }),
    {
      at: [0, 8.3, -11.2],
      size: [2, 2, 9],
      uv: [34, 0],
      rot: [-0.35, 0, 0],
      joint: tailWag([0, 9.8, -7], 0.4),
      skin: (g) => {
        g.speckle('all', tones(OC, 0.05));
        for (const i of [2, 4, 6]) slice(g, i, OC_SPOT);
        slice(g, 7, '#2c1d0e');
        slice(g, 8, '#2c1d0e');
        g.fill('back', '#2c1d0e');
      },
    },
  ],
};

// ---- Fox ----------------------------------------------------------------------------------------
const FOX = [
  { base: '#d9702a', belly: '#f6eee2', dark: '#2b211c' },
  { base: '#efeadd', belly: '#fbf9f3', dark: '#5a524b' },
];
const fox: SpeciesSpec = {
  kind: 'fox',
  name: { en: 'Fox', ar: 'ثعلب' },
  emoji: '🦊',
  tex: [64, 32],
  variants: 2,
  move: 'walk',
  speed: 2.0,
  hp: 10,
  graze: false,
  habitat: { biomes: ['forest', 'snowy'], weight: 0.6, herd: [1, 2] },
  parts: [
    {
      at: [0, 8.5, -1],
      size: [6, 6, 11],
      uv: [0, 0],
      skin: (g) => {
        const c = FOX[g.variant];
        g.speckle('all', tones(c.base, 0.06));
        g.speckle('top', tones(shade(c.base, -0.08), 0.05));
        g.speckle('bottom', tones(c.belly, 0.03));
        for (const f of ['nx', 'px'] as const) {
          g.rect(f, 0, 4, 11, 2, c.belly);
          ragged(g, f, 3, c.belly, 0.35);
        }
        g.rect('front', 0, 3, 6, 3, c.belly);
        ragged(g, 'front', 2, c.belly, 0.4);
      },
    },
    {
      at: [0, 11.5, 6.5],
      size: [7, 5, 5],
      uv: [0, 17],
      skin: (g) => {
        const c = FOX[g.variant];
        g.speckle('all', tones(c.base, 0.05));
        g.speckle('top', tones(shade(c.base, -0.06), 0.05));
        g.speckle('bottom', tones(c.belly, 0.03));
        // white cheeks
        g.rect('front', 0, 3, 2, 2, c.belly);
        g.rect('front', 5, 3, 2, 2, c.belly);
        g.px('front', 0, 2, c.belly);
        g.px('front', 6, 2, c.belly);
        for (const f of ['nx', 'px'] as const) {
          g.rect(f, 0, 3, 5, 2, c.belly);
          ragged(g, f, 2, c.belly, 0.4);
        }
        g.px('front', 1, 2, '#18110d');
        g.px('front', 5, 2, '#18110d');
        g.px('front', 1, 1, shade(c.base, -0.25));
        g.px('front', 5, 1, shade(c.base, -0.25));
      },
    },
    {
      at: [0, 10, 10.4],
      size: [3, 2, 3],
      uv: [24, 17],
      skin: (g) => {
        const c = FOX[g.variant];
        g.speckle('all', tones(c.base, 0.04));
        g.speckle('bottom', tones(c.belly, 0.03));
        g.rect('front', 0, 1, 3, 1, c.belly);
        for (const f of ['nx', 'px'] as const) g.rect(f, 0, 1, 3, 1, c.belly);
        g.rect('front', 0, 0, 3, 1, '#16110f');
        g.rect('top', 0, 2, 3, 1, '#16110f');
      },
    },
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 2.3, 15.3, 5.8],
        size: [3, 3, 1],
        uv: [36, 17],
        rot: [0.1, 0, s * 0.1],
        skin: (g) => {
          const c = FOX[g.variant];
          g.speckle('all', tones(c.base, 0.05));
          g.fill('back', c.dark);
          g.rect('front', 0, 0, 3, 1, c.dark);
          g.rect('front', 1, 1, 1, 2, c.belly);
          g.rect('top', 0, 0, 3, 1, c.dark);
          for (const f of ['nx', 'px'] as const) g.rect(f, 0, 0, 1, 1, c.dark);
        },
      })
    ),
    ...legs4({
      size: [2, 6, 2],
      x: 2,
      zFront: 3,
      zBack: -5,
      uv: [44, 17],
      amp: 0.9,
      skin: (g) => {
        const c = FOX[g.variant];
        g.speckle('all', tones(c.base, 0.05));
        for (const f of ['nx', 'front', 'px', 'back'] as const) {
          g.rect(f, 0, 3, 2, 3, c.dark);
          ragged(g, f, 2, c.dark, 0.4);
        }
        g.fill('bottom', c.dark);
      },
    }),
    {
      at: [0, 8.3, -11.3],
      size: [5, 5, 10],
      uv: [34, 0],
      rot: [-0.3, 0, 0],
      joint: tailWag([0, 9.8, -6.5], 0.4),
      skin: (g) => {
        const c = FOX[g.variant];
        g.speckle('all', tones(c.base, 0.06));
        g.speckle('bottom', tones(mix(c.base, c.belly, 0.5), 0.04));
        slice(g, 6, c.belly, 0.5);
        for (const i of [7, 8, 9]) slice(g, i, c.belly);
        g.speckle('back', tones(c.belly, 0.03));
      },
    },
  ],
};

// ---- Panda --------------------------------------------------------------------------------------
const PW = tones('#f3f2ed', 0.035);
const PK = ['#1b1b1f', '#232328', '#2b2b30'];
const pandaHead = headDip([0, 13, 8], 0.45);
const panda: SpeciesSpec = {
  kind: 'panda',
  name: { en: 'Panda', ar: 'باندا' },
  emoji: '🐼',
  tex: [64, 64],
  move: 'walk',
  speed: 1.2,
  hp: 15,
  graze: true,
  habitat: { biomes: ['forest'], weight: 0.25, herd: [1, 1] },
  parts: [
    {
      at: [0, 13, 0],
      size: [13, 11, 18],
      uv: [0, 0],
      skin: (g) => {
        g.speckle('all', PW);
        g.speckle('bottom', tones('#e4e3dd', 0.03));
        // black shoulder band (front six rows of the body) with a ragged back edge
        patch(g, 'nx', 12, 0, 6, 11, PK);
        patch(g, 'px', 0, 0, 6, 11, PK);
        patch(g, 'top', 0, 12, 13, 6, PK);
        patch(g, 'bottom', 0, 0, 13, 6, PK);
        patch(g, 'front', 0, 0, 13, 11, PK);
        for (let y = 0; y < 11; y++) {
          if (g.rand() < 0.5) g.px('nx', 11, y, PK[0]);
          if (g.rand() < 0.5) g.px('px', 6, y, PK[0]);
        }
        for (let x = 0; x < 13; x++) if (g.rand() < 0.5) g.px('top', x, 11, PK[0]);
        // thighs above the black hind legs
        g.blob('nx', 2, 9, 3.2, PK[1]);
        g.blob('px', 15, 9, 3.2, PK[1]);
        g.grain(['nx', 'px', 'top'], '#d6d5cf', 0.05);
      },
    },
    {
      at: [0, 15.5, 11],
      size: [10, 8, 7],
      uv: [0, 29],
      joint: pandaHead,
      skin: (g) => {
        g.speckle('all', PW);
        g.speckle('bottom', tones('#e4e3dd', 0.03));
        // eye patches slope down and outwards
        for (const m of [0, 1]) {
          const X = (x: number) => (m ? 9 - x : x);
          g.rect('front', X(2), 2, 1, 1, PK[0]);
          g.rect('front', X(3), 2, 1, 1, PK[0]);
          for (const x of [1, 2, 3]) {
            g.px('front', X(x), 3, PK[1]);
            g.px('front', X(x), 4, PK[1]);
          }
          g.px('front', X(1), 5, PK[1]);
          g.px('front', X(2), 5, PK[1]);
          g.px('front', X(3), 3, '#f4f4f4');
        }
        // patches wrap round the side a little
        g.rect('nx', 5, 3, 2, 2, PK[1]);
        g.rect('px', 0, 3, 2, 2, PK[1]);
      },
    },
    {
      at: [0, 13.5, 15.5],
      size: [4, 3, 2],
      uv: [0, 44],
      joint: pandaHead,
      skin: (g) => {
        g.speckle('all', tones('#efeee9', 0.03));
        g.rect('front', 1, 0, 2, 1, '#1a1a1d');
        g.rect('top', 1, 1, 2, 1, '#1a1a1d');
        g.rect('front', 1, 2, 2, 1, '#6a6a70');
      },
    },
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 4, 20.4, 10],
        size: [3, 3, 2],
        uv: [12, 44],
        rot: [0, 0, -s * 0.12],
        joint: pandaHead,
        skin: (g) => {
          g.speckle('all', PK);
          g.px('front', 1, 1, '#4a4a52');
        },
      })
    ),
    ...legs4({
      size: [5, 7, 5],
      x: 4,
      zFront: 5.5,
      zBack: -5.5,
      uv: [34, 29],
      amp: 0.6,
      skin: (g) => {
        g.speckle('all', PK);
        g.rect('bottom', 0, 0, 5, 5, '#101013');
        for (const f of ['nx', 'front', 'px', 'back'] as const) g.rect(f, 0, 6, 5, 1, '#121215');
      },
    }),
    {
      at: [0, 14, -9.8],
      size: [3, 3, 2],
      uv: [24, 44],
      skin: (g) => g.speckle('all', PW),
    },
  ],
};

// ---- Polar bear ---------------------------------------------------------------------------------
const PB = '#f7f4ea';
const polarBear: SpeciesSpec = {
  kind: 'polar_bear',
  name: { en: 'Polar Bear', ar: 'دب قطبي' },
  emoji: '🐻',
  tex: [128, 64],
  move: 'walk',
  speed: 1.5,
  hp: 18,
  graze: false,
  habitat: { biomes: ['snowy'], weight: 0.8, herd: [1, 2] },
  parts: [
    {
      at: [0, 16, -1],
      size: [14, 12, 20],
      uv: [0, 0],
      skin: (g) => {
        g.speckle('all', tones(PB, 0.035));
        g.speckle('bottom', tones(shade(PB, -0.06), 0.03));
        g.grain(['nx', 'px', 'top', 'back'], '#ffffff', 0.08);
        g.grain(['nx', 'px', 'top', 'back'], '#e6dfc9', 0.05);
        // a creamy shadow low on the flanks
        for (const f of ['nx', 'px'] as const) {
          patch(g, f, 0, 10, 20, 2, tones(shade(PB, -0.05), 0.03));
          ragged(g, f, 9, shade(PB, -0.05), 0.4);
        }
      },
    },
    {
      at: [0, 18, 13],
      size: [9, 9, 8],
      uv: [0, 32],
      skin: (g) => {
        g.speckle('all', tones(PB, 0.03));
        g.grain(['top', 'nx', 'px'], '#ffffff', 0.08);
        g.rect('front', 1, 3, 1, 1, '#17140f');
        g.rect('front', 7, 3, 1, 1, '#17140f');
        // side eyes sit on the front edge of each cheek
        g.px('nx', 7, 3, '#17140f');
        g.px('px', 0, 3, '#17140f');
        g.px('front', 0, 3, shade(PB, -0.1));
        g.px('front', 8, 3, shade(PB, -0.1));
      },
    },
    {
      at: [0, 16, 19.5],
      size: [5, 3, 5],
      uv: [34, 32],
      skin: (g) => {
        g.speckle('all', tones(shade(PB, 0.02), 0.03));
        g.rect('front', 1, 0, 3, 1, '#16130f');
        g.px('front', 0, 0, shade(PB, -0.2));
        g.px('front', 4, 0, shade(PB, -0.2));
        g.rect('top', 1, 4, 3, 1, '#16130f');
        g.rect('front', 2, 2, 1, 1, '#6e6556');
      },
    },
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 3.6, 23.4, 12],
        size: [2, 2, 1],
        uv: [54, 32],
        skin: (g) => {
          g.speckle('all', tones(shade(PB, -0.04), 0.03));
          g.px('front', 0, 0, '#d2b3a5');
          g.px('front', 1, 1, '#d2b3a5');
        },
      })
    ),
    ...legs4({
      size: [5, 10, 5],
      x: 4.5,
      zFront: 6,
      zBack: -8,
      uv: [68, 0],
      amp: 0.6,
      skin: (g) => {
        g.speckle('all', tones(PB, 0.035));
        g.grain('sides', '#ffffff', 0.07);
        for (const f of ['nx', 'front', 'px', 'back'] as const) {
          g.rect(f, 0, 8, 5, 2, shade(PB, -0.08));
          g.rect(f, 0, 9, 5, 1, '#8c8576');
        }
        g.fill('bottom', '#8c8576');
      },
    }),
    {
      at: [0, 20, -12],
      size: [3, 2, 2],
      uv: [62, 32],
      skin: (g) => g.speckle('all', tones(PB, 0.035)),
    },
  ],
};

// ---- Armadillo ----------------------------------------------------------------------------------
const AR_SHELL = '#b08060';
const AR_SEAM = '#5e3b28';
const AR_HI = '#d0a780';
const AR_SKIN = '#cf9f88';
const armaHead = headDip([0, 6.5, 5.5], 0.5);
// the arched shell is three boxes: a solid cap at each end and a taller banded middle
const armaCap = (z: number): PartSpec => ({
  at: [0, 7.5, z],
  size: [9, 4, 3],
  uv: [30, 0],
  skin: (g) => {
    g.speckle('all', tones(shade(AR_SHELL, -0.1), 0.06));
    g.speckle('bottom', tones(AR_SKIN, 0.05));
    for (const x of [3, 6]) {
      g.rect('top', x, 0, 1, 3, AR_SEAM);
      g.rect('front', x, 0, 1, 4, AR_SEAM);
      g.rect('back', x, 0, 1, 4, AR_SEAM);
    }
    g.grain(['top', 'front', 'back', 'nx', 'px'], AR_HI, 0.1);
    g.band(['nx', 'px', 'front', 'back'], 3, 4, shade(AR_SHELL, -0.3));
  },
});
const armadillo: SpeciesSpec = {
  kind: 'armadillo',
  name: { en: 'Armadillo', ar: 'أرماديلو' },
  emoji: '🐾',
  tex: [64, 32],
  move: 'walk',
  speed: 1.2,
  hp: 8,
  graze: true,
  habitat: { biomes: ['desert', 'plains'], weight: 0.5, herd: [1, 2] },
  parts: [
    {
      at: [0, 8, -0.5],
      size: [9, 5, 6],
      uv: [0, 0],
      skin: (g) => {
        g.speckle('all', tones(AR_SHELL, 0.05));
        g.speckle('bottom', tones(AR_SKIN, 0.05));
        // plates: seams run across the shell. On top, row 0 is the tail end; nx runs tail -> head, px head -> tail.
        for (const r of [2, 5]) {
          g.rect('top', 0, r, 9, 1, AR_SEAM);
          g.rect('nx', r, 0, 1, 5, AR_SEAM);
          g.rect('px', 5 - r, 0, 1, 5, AR_SEAM);
        }
        for (const r of [0, 3]) {
          for (let x = (r / 3) % 2; x < 9; x += 2) g.px('top', x, r + 1, AR_HI);
          for (let y = 0; y < 5; y += 2) {
            g.px('nx', r + 1, y, AR_HI);
            g.px('px', 4 - r, y, AR_HI);
          }
        }
        g.grain(['top', 'nx', 'px'], AR_HI, 0.07);
        g.band(['nx', 'px', 'front', 'back'], 4, 5, shade(AR_SHELL, -0.3));
      },
    },
    armaCap(-5),
    armaCap(4),
    {
      at: [0, 11, -0.5],
      size: [5, 1, 6],
      uv: [0, 24],
      skin: (g) => {
        g.speckle('all', tones(shade(AR_SHELL, 0.06), 0.05));
        for (const r of [2, 5]) {
          g.rect('top', 0, r, 5, 1, AR_SEAM);
          g.rect('nx', r, 0, 1, 1, AR_SEAM);
          g.rect('px', 5 - r, 0, 1, 1, AR_SEAM);
        }
        g.grain('top', AR_HI, 0.15);
      },
    },
    {
      at: [0, 4.5, -0.5],
      size: [7, 3, 10],
      uv: [0, 11],
      skin: (g) => {
        g.speckle('all', tones(AR_SKIN, 0.05));
        g.speckle('bottom', tones(shade(AR_SKIN, 0.18), 0.04));
        g.speckle('top', tones(shade(AR_SKIN, -0.1), 0.04));
      },
    },
    {
      at: [0, 6.2, 7.5],
      size: [4, 4, 4],
      uv: [34, 12],
      joint: armaHead,
      skin: (g) => {
        g.speckle('all', tones(AR_SKIN, 0.05));
        g.speckle('top', tones(shade(AR_SKIN, -0.12), 0.05));
        g.px('front', 0, 1, '#1a1210');
        g.px('front', 3, 1, '#1a1210');
        g.px('nx', 3, 1, '#1a1210');
        g.px('px', 0, 1, '#1a1210');
      },
    },
    {
      at: [0, 5.2, 10.5],
      size: [2, 2, 3],
      uv: [50, 12],
      joint: armaHead,
      skin: (g) => {
        g.speckle('all', tones(shade(AR_SKIN, 0.06), 0.04));
        g.rect('front', 0, 0, 2, 1, '#5a3a33');
      },
    },
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 2.5, 10, 6],
        size: [2, 5, 1],
        uv: [34, 20],
        rot: [0, 0, s * 0.3],
        joint: armaHead,
        skin: (g) => {
          g.speckle('all', tones(shade(AR_SKIN, -0.08), 0.04));
          g.rect('front', 0, 1, 2, 4, '#e3a999');
        },
      })
    ),
    ...legs4({
      size: [2, 3, 2],
      x: 2.3,
      zFront: 3.5,
      zBack: -4.5,
      uv: [40, 20],
      amp: 0.9,
      skin: (g) => {
        g.speckle('all', tones(shade(AR_SKIN, -0.1), 0.05));
        for (const f of ['nx', 'front', 'px', 'back'] as const) g.rect(f, 0, 2, 2, 1, '#e8dcc8');
      },
    }),
    {
      at: [0, 5.8, -8],
      size: [2, 2, 3],
      uv: [48, 20],
      rot: [-0.35, 0, 0],
      joint: tailWag([0, 6, -6.5], 0.4),
      skin: (g) => {
        g.speckle('all', tones(AR_SKIN, 0.05));
        slice(g, 1, shade(AR_SKIN, -0.25));
      },
    },
    {
      at: [0, 4.45, -10.64],
      size: [1, 1, 3],
      uv: [34, 26],
      rot: [-0.6, 0, 0],
      joint: tailWag([0, 6, -6.5], 0.4),
      skin: (g) => {
        g.speckle('all', tones(shade(AR_SKIN, -0.1), 0.05));
        slice(g, 1, shade(AR_SKIN, -0.3));
      },
    },
  ],
};

// ---- Sniffer ------------------------------------------------------------------------------------
const SN = '#8c2d31';
const SN_DARK = '#68212a';
const MOSS = ['#4f8c36', '#5a9a3b', '#66a640', '#468433'];
const SN_NOSE = '#c7605a';
const snifferHead = headDip([0, 14, 10], 0.55);
const sniffLeg = (sx: number, z: number, phase: number): PartSpec => ({
  at: [sx * 6, 4.5, z],
  size: [4, 9, 4],
  uv: [88, 30],
  skin: (g) => {
    g.speckle('all', tones(shade(SN, -0.12), 0.06));
    for (const f of ['nx', 'front', 'px', 'back'] as const) {
      g.rect(f, 0, 6, 4, 3, SN_DARK);
      g.px(f, 1, 8, '#3b1216');
      g.px(f, 2, 8, '#3b1216');
    }
    g.fill('bottom', '#3b1216');
  },
  joint: { chan: 'walk', axis: 'x', amp: 0.45, phase },
});
const sniffer: SpeciesSpec = {
  kind: 'sniffer',
  name: { en: 'Sniffer', ar: 'سنيفر' },
  emoji: '🐾',
  tex: [128, 64],
  move: 'walk',
  speed: 0.9,
  hp: 20,
  graze: true,
  habitat: { biomes: ['forest', 'plains'], weight: 0.2, herd: [1, 1] },
  parts: [
    {
      at: [0, 14.5, -1],
      size: [16, 13, 22],
      uv: [0, 0],
      skin: (g) => {
        g.speckle('all', tones(SN, 0.06));
        g.speckle('top', tones(shade(SN, -0.1), 0.05));
        g.speckle('bottom', tones(shade(SN, 0.12), 0.05));
        // fold lines and a few lighter knobbles
        for (const f of ['nx', 'px'] as const) {
          ragged(g, f, 5, shade(SN, -0.22), 0.55);
          ragged(g, f, 9, shade(SN, -0.2), 0.45);
        }
        g.grain(['nx', 'px', 'back', 'front'], shade(SN, 0.2), 0.06);
        // moss creeping down from the back
        for (const f of ['nx', 'px', 'front', 'back'] as const) {
          ragged(g, f, 0, MOSS[1], 0.55);
          ragged(g, f, 1, MOSS[3], 0.25);
        }
      },
    },
    {
      at: [0, 22, -2],
      size: [14, 2, 18],
      uv: [0, 35],
      skin: (g) => {
        g.speckle('all', MOSS);
        g.grain('top', '#86c05a', 0.12);
        g.grain('top', ['#f2d24a', '#e8708f', '#f4f4ea'], 0.025);
        g.grain('sides', '#2f6422', 0.15);
      },
    },
    ...(
      [
        [-3.5, 24, -6, 0.3],
        [3.2, 24, 0, -0.4],
        [-2.2, 24, 4.5, 0.7],
      ] as const
    ).map(
      ([x, y, z, ry]): PartSpec => ({
        at: [x, y, z],
        size: [4, 2, 4],
        uv: [104, 30],
        rot: [0, ry, 0],
        skin: (g) => {
          g.speckle('all', MOSS);
          g.grain('top', '#86c05a', 0.25);
          g.grain('sides', '#2f6422', 0.18);
        },
      })
    ),
    {
      at: [0, 15, 14.5],
      size: [10, 10, 9],
      uv: [76, 0],
      joint: snifferHead,
      skin: (g) => {
        g.speckle('all', tones(SN, 0.06));
        g.speckle('top', tones(shade(SN, -0.08), 0.05));
        g.rect('front', 1, 2, 3, 1, shade(SN, -0.32));
        g.rect('front', 6, 2, 3, 1, shade(SN, -0.32));
        g.px('front', 2, 3, '#140d0d');
        g.px('front', 7, 3, '#140d0d');
        g.px('front', 3, 3, '#e9dcd0');
        g.px('front', 6, 3, '#e9dcd0');
        g.grain(['nx', 'px'], shade(SN, 0.18), 0.06);
      },
    },
    {
      at: [0, 11.5, 21],
      size: [12, 5, 6],
      uv: [76, 19],
      joint: snifferHead,
      skin: (g) => {
        g.speckle('all', tones(SN_NOSE, 0.06));
        g.speckle('bottom', tones(shade(SN_NOSE, -0.12), 0.05));
        g.rect('front', 3, 1, 2, 1, '#4a1518');
        g.rect('front', 7, 1, 2, 1, '#4a1518');
        g.rect('front', 3, 2, 2, 1, shade(SN_NOSE, -0.2));
        g.rect('front', 7, 2, 2, 1, shade(SN_NOSE, -0.2));
        g.rect('front', 0, 4, 12, 1, shade(SN_NOSE, -0.28));
        g.rect('top', 3, 4, 2, 1, '#4a1518');
        g.rect('top', 7, 4, 2, 1, '#4a1518');
        g.grain(['top', 'nx', 'px'], shade(SN_NOSE, 0.18), 0.08);
      },
    },
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 5.5, 14.5, 14.5],
        size: [1, 8, 5],
        uv: [76, 30],
        rot: [0, 0, s * 0.3],
        joint: snifferHead,
        skin: (g) => {
          g.speckle('all', tones(shade(SN, -0.1), 0.06));
          for (const f of ['nx', 'px'] as const) {
            patch(g, f, 1, 1, 3, 6, tones('#b4564f', 0.05));
            g.rect(f, 0, 7, 5, 1, shade(SN, -0.3));
          }
        },
      })
    ),
    sniffLeg(1, 7, 0),
    sniffLeg(1, -1, Math.PI),
    sniffLeg(1, -9, 0),
    sniffLeg(-1, 7, Math.PI),
    sniffLeg(-1, -1, 0),
    sniffLeg(-1, -9, Math.PI),
  ],
};

export const SPECIES: SpeciesSpec[] = [ocelot, fox, panda, polarBear, armadillo, sniffer];
