// The first four species, written as the reference for everyone else: a pig, a cow, a dog and a cat.
// They show the whole vocabulary: parts + atlas layout, shared leg skins, a head that dips when grazing
// (with everything glued to the head sharing the joint), a wagging tail, coat variants and painted faces.
import type { PartSpec, SpeciesSpec } from '../types';
import { eyes, fur, headDip, legs4, shade, tailWag, tones } from './kit';

// ---- Pig ----------------------------------------------------------------------------------------
const PIG = '#eda7ae';
const pigHead = headDip([0, 11, 8], 0.5);
const pig: SpeciesSpec = {
  kind: 'pig',
  name: { en: 'Pig', ar: 'خنزير' },
  emoji: '🐷',
  tex: [64, 64],
  move: 'walk',
  speed: 1.4,
  hp: 6,
  graze: true,
  habitat: { weight: 1.2, biomes: ['plains', 'forest'], herd: [1, 3] },
  parts: [
    {
      at: [0, 10, 0],
      size: [10, 8, 16],
      uv: [0, 0],
      skin: (g) => {
        g.speckle('all', tones(PIG, 0.05));
        g.speckle('bottom', tones(shade(PIG, 0.12), 0.04));
        g.grain('top', shade(PIG, -0.1), 0.06);
      },
    },
    {
      at: [0, 11.5, 11],
      size: [8, 8, 8],
      uv: [0, 24],
      joint: pigHead,
      skin: (g) => {
        g.speckle('all', tones(PIG, 0.05));
        eyes(g, 'front', 3, 4);
        g.rect('front', 2, 6, 4, 1, shade(PIG, -0.18));
      },
    },
    {
      at: [0, 10.5, 15.5],
      size: [4, 3, 1],
      uv: [34, 24],
      joint: pigHead,
      skin: (g) => {
        g.fill('all', shade(PIG, 0.18));
        g.px('front', 1, 1, '#b8606e');
        g.px('front', 2, 1, '#b8606e');
      },
    },
    // ears
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 3.4, 16.3, 9.5],
        size: [3, 3, 1],
        uv: [52, 0],
        rot: [0.35, 0, s * 0.25],
        joint: pigHead,
        skin: (g) => g.speckle('all', tones(shade(PIG, -0.06), 0.04)),
      })
    ),
    ...legs4({ size: [4, 6, 4], x: 3, zFront: 5.5, zBack: -5.5, uv: [34, 28], skin: fur(shade(PIG, -0.06), { spread: 0.05, belly: shade(PIG, -0.1) }) }),
    {
      at: [0, 12.5, -9],
      size: [1, 1, 2],
      uv: [52, 6],
      rot: [0.6, 0, 0],
      joint: tailWag([0, 12.5, -8.2], 0.5),
      skin: (g) => g.fill('all', shade(PIG, -0.12)),
    },
  ],
};

// ---- Cow ----------------------------------------------------------------------------------------
const cowHead = headDip([0, 17, 9], 0.55);
const cow: SpeciesSpec = {
  kind: 'cow',
  name: { en: 'Cow', ar: 'بقرة' },
  emoji: '🐮',
  tex: [128, 64],
  variants: 3,
  move: 'walk',
  speed: 1.2,
  hp: 10,
  graze: true,
  habitat: { weight: 1.2, biomes: ['plains', 'forest'], herd: [2, 4] },
  parts: [
    {
      at: [0, 15, 0],
      size: [12, 10, 18],
      uv: [0, 0],
      skin: (g) => {
        // variant 0: black and white, 1: brown and white, 2: red-brown
        const hide = ['#f1f1ee', '#e8e8e4'];
        const patch = ['#2b2b2e', '#5b3a24', '#8a4a2a'][g.variant];
        if (g.variant === 2) {
          g.speckle('all', tones('#8a4a2a', 0.07));
          g.blob('px', 4, 3, 3, '#e8d9c4');
          g.blob('nx', 12, 6, 3, '#e8d9c4');
        } else {
          g.speckle('all', hide);
          g.blob('px', 5, 3, 3.4, patch);
          g.blob('px', 12, 7, 2.6, patch);
          g.blob('nx', 12, 3, 3.2, patch);
          g.blob('nx', 5, 7, 3, patch);
          g.blob('top', 4, 6, 3.4, patch);
          g.blob('top', 9, 12, 3, patch);
          g.blob('back', 5, 4, 2.4, patch);
        }
      },
    },
    {
      at: [0, 17, 11.5],
      size: [8, 8, 6],
      uv: [0, 28],
      joint: cowHead,
      skin: (g) => {
        const patch = ['#2b2b2e', '#5b3a24', '#8a4a2a'][g.variant];
        g.speckle('all', g.variant === 2 ? tones('#8a4a2a', 0.07) : ['#f1f1ee', '#e8e8e4']);
        if (g.variant !== 2) g.rect('front', 0, 0, 8, 3, patch);
        eyes(g, 'front', 3, 5, '#15151c', true);
      },
    },
    {
      at: [0, 15.2, 14.6],
      size: [6, 3, 1],
      uv: [28, 28],
      joint: cowHead,
      skin: (g) => {
        g.fill('all', '#e9b3a8');
        g.px('front', 1, 1, '#a8665a');
        g.px('front', 4, 1, '#a8665a');
      },
    },
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 4.6, 22.2, 10.5],
        size: [1, 3, 1],
        uv: [44, 28],
        joint: cowHead,
        skin: (g) => g.fill('all', '#e9e2c9'),
      })
    ),
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 4.8, 18.4, 9.8],
        size: [2, 1, 3],
        uv: [48, 28],
        joint: cowHead,
        skin: (g) => g.speckle('all', ['#2b2b2e', '#3a3a3e']),
      })
    ),
    ...legs4({ size: [4, 10, 4], x: 4, zFront: 6.5, zBack: -6.5, uv: [64, 0], skin: (g) => {
      g.speckle('all', g.variant === 2 ? tones('#8a4a2a', 0.06) : ['#f1f1ee', '#e8e8e4']);
      for (const f of ['nx', 'front', 'px', 'back'] as const) g.rect(f, 0, 7, 4, 3, '#3a3a3e');
    } }),
    {
      at: [0, 8.6, -4],
      size: [4, 2, 5],
      uv: [64, 14],
      skin: (g) => g.speckle('all', tones('#e9b3a8', 0.05)),
    },
    {
      at: [0, 16.5, -10],
      size: [2, 9, 1],
      uv: [86, 0],
      rot: [0.15, 0, 0],
      joint: { chan: 'tail', axis: 'x', amp: 0.25, pivot: [0, 20, -9.5] },
      skin: (g) => {
        g.speckle('all', ['#2b2b2e', '#3a3a3e']);
        g.rect('front', 0, 6, 2, 3, '#1a1a1c');
      },
    },
  ],
};

// ---- Dog ----------------------------------------------------------------------------------------
const dogHead = headDip([0, 11, 5.5], 0.45);
const dog: SpeciesSpec = {
  kind: 'dog',
  name: { en: 'Dog', ar: 'كلب' },
  emoji: '🐶',
  tex: [64, 64],
  variants: 3,
  move: 'walk',
  speed: 1.7,
  hp: 8,
  habitat: { weight: 0.8, biomes: ['plains', 'forest', 'snowy'], herd: [1, 2] },
  parts: [
    {
      at: [0, 10, -0.5],
      size: [6, 6, 12],
      uv: [0, 0],
      skin: (g) => {
        const base = ['#9a7b57', '#3a332e', '#cfcac2'][g.variant];
        g.speckle('all', tones(base, 0.07));
        g.speckle('bottom', tones(shade(base, 0.25), 0.05));
        g.band('sides', 3, 6, shade(base, g.variant === 2 ? -0.05 : 0.18));
        if (g.variant === 1) g.blob('top', 3, 6, 2.6, '#8a6a43');
      },
    },
    {
      at: [0, 12, 6.5],
      size: [6, 6, 6],
      uv: [0, 18],
      joint: dogHead,
      skin: (g) => {
        const base = ['#b08e63', '#3a332e', '#d6d1c9'][g.variant];
        g.speckle('all', tones(base, 0.06));
        eyes(g, 'front', 2, 3, '#15151c');
        g.rect('front', 2, 4, 2, 2, shade(base, 0.25));
      },
    },
    {
      at: [0, 10.8, 10.8],
      size: [3, 2, 3],
      uv: [24, 18],
      joint: dogHead,
      skin: (g) => {
        const base = ['#d8c3a0', '#8a6a43', '#efece6'][g.variant];
        g.speckle('all', tones(base, 0.04));
        g.rect('front', 1, 0, 1, 1, '#15151c');
      },
    },
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 3.4, 12.6, 6],
        size: [1, 3, 2],
        uv: [40, 18],
        rot: [0, 0, s * 0.25],
        joint: dogHead,
        skin: (g) => g.speckle('all', tones(['#6e5438', '#24201c', '#a9a49c'][g.variant], 0.05)),
      })
    ),
    ...legs4({ size: [2, 6, 2], x: 2, zFront: 4, zBack: -5, uv: [0, 34], skin: (g) => {
      const base = ['#7c6144', '#2c2723', '#bdb8b0'][g.variant];
      g.speckle('all', tones(base, 0.06));
      g.rect('front', 0, 4, 2, 2, '#e9e5de');
    } }),
    {
      at: [0, 12.2, -7.6],
      size: [2, 2, 5],
      uv: [16, 34],
      rot: [-0.7, 0, 0],
      joint: tailWag([0, 11, -6.2], 0.7),
      skin: (g) => g.speckle('all', tones(['#9a7b57', '#3a332e', '#cfcac2'][g.variant], 0.07)),
    },
  ],
};

// ---- Cat ----------------------------------------------------------------------------------------
const catHead = headDip([0, 8, 4.5], 0.4);
const CAT_COATS = ['#d98a3c', '#26242a', '#ecebe8', '#9a9aa0', '#cfb994'] as const;
const cat: SpeciesSpec = {
  kind: 'cat',
  name: { en: 'Cat', ar: 'قطة' },
  emoji: '🐱',
  tex: [64, 64],
  variants: 5,
  move: 'walk',
  speed: 1.6,
  hp: 8,
  habitat: { weight: 0.8, biomes: ['plains', 'forest', 'desert'], herd: [1, 2] },
  parts: [
    {
      at: [0, 7.5, -0.5],
      size: [5, 5, 10],
      uv: [0, 0],
      skin: (g) => {
        const base = CAT_COATS[g.variant];
        g.speckle('all', tones(base, 0.05));
        g.speckle('bottom', tones(shade(base, 0.3), 0.04));
        if (g.variant === 0 || g.variant === 3) {
          // tabby stripes across the back and flanks
          const stripe = shade(base, -0.28);
          for (let x = 1; x < 10; x += 3) {
            g.rect('px', x, 0, 1, 3, stripe);
            g.rect('nx', x, 0, 1, 3, stripe);
            g.rect('top', 0, x, 5, 1, stripe);
          }
        }
        if (g.variant === 4) {
          g.blob('px', 4, 2, 2, '#e8e2d6');
          g.blob('nx', 7, 3, 2, '#3a2f26');
          g.blob('top', 2, 4, 2, '#d98a3c');
        }
      },
    },
    {
      at: [0, 9, 5.5],
      size: [5, 4, 4],
      uv: [0, 16],
      joint: catHead,
      skin: (g) => {
        const base = CAT_COATS[g.variant];
        g.speckle('all', tones(base, 0.05));
        eyes(g, 'front', 1, 3, g.variant === 1 ? '#e4d23a' : '#2a8a3a');
        g.px('front', 2, 2, '#e08a8a');
        if (g.variant === 4) g.rect('front', 0, 0, 5, 1, '#3a2f26');
        if (g.variant === 0 || g.variant === 3) g.rect('top', 2, 1, 1, 3, shade(base, -0.25));
      },
    },
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 1.7, 11.6, 5.2],
        size: [1, 2, 1],
        uv: [20, 16],
        joint: catHead,
        skin: (g) => g.speckle('all', tones(shade(CAT_COATS[g.variant], -0.1), 0.04)),
      })
    ),
    ...legs4({ size: [2, 5, 2], x: 1.5, zFront: 3.5, zBack: -4.5, uv: [0, 28], skin: (g) => {
      g.speckle('all', tones(CAT_COATS[g.variant], 0.05));
      g.rect('front', 0, 3, 2, 2, shade(CAT_COATS[g.variant], g.variant === 1 ? 0.1 : 0.4));
    } }),
    {
      at: [0, 9.5, -7],
      size: [2, 2, 8],
      uv: [16, 28],
      rot: [-0.65, 0, 0],
      joint: tailWag([0, 8, -4.7], 0.45),
      skin: (g) => g.speckle('all', tones(shade(CAT_COATS[g.variant], g.variant === 1 ? 0.05 : -0.08), 0.05)),
    },
  ],
};

export const SPECIES: SpeciesSpec[] = [pig, cow, dog, cat];
