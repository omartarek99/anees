// Monsters of the Builder's Quarry: hostile creatures that hunt the player (craftEntities: stepGround's hunting branch and
// monsterAttack). Same data format as the animals; `hostile` turns on the hunting, and pickSpecies never offers them as animals.
//   Sandling      a chunky biped of packed sand with ember eyes: the common one.
//   Thorn Crawler a low, quick six-legged beetle with a spiny back: small bites, hard to outrun.
//   Stone Brute   a slow rock giant with mossy shoulders: rare, hits hard.
import type { PartSpec, SpeciesSpec } from '../types';
import { legs2, shade, tones } from './kit';
import { COBBLE, SAND as SAND_BLOCK } from '../../craftWorld';
import { IRON, STICK } from '../../craftItems';

// ---- Sandling -----------------------------------------------------------------------------------
const SAND = '#cfa865';
const sandSkin = (g: Parameters<PartSpec['skin']>[0]) => {
  g.speckle('all', tones(SAND, 0.08));
  g.grain('all', shade(SAND, -0.25), 0.08);
  g.grain('all', shade(SAND, 0.15), 0.05);
};
const sandling: SpeciesSpec = {
  kind: 'sandling',
  name: { en: 'Sandling', ar: 'رمّال' },
  emoji: '👹',
  tex: [64, 64],
  move: 'walk',
  speed: 1.2,
  hp: 12,
  tameable: false,
  hostile: { damage: 3, chase: 3.1, sight: 16, cooldown: 1.1, knock: 5, drops: [[SAND_BLOCK, 2]] },
  habitat: { weight: 1, herd: [1, 2] },
  parts: [
    {
      // body
      at: [0, 15, 0],
      size: [8, 10, 5],
      uv: [0, 0],
      skin: (g) => {
        sandSkin(g);
        // a dark crack down the chest
        for (let y = 1; y < 9; y++) g.px('front', 3 + (y % 3 === 0 ? 1 : 0), y, shade(SAND, -0.45));
      },
    },
    {
      // head: a flat block with a glowing brow slit
      at: [0, 23.5, 0.5],
      size: [8, 7, 7],
      uv: [0, 16],
      skin: (g) => {
        sandSkin(g);
        g.rect('front', 1, 2, 6, 2, '#3a2412');
        g.rect('front', 1, 2, 2, 1, '#ffb02e');
        g.rect('front', 5, 2, 2, 1, '#ffb02e');
        g.px('front', 2, 3, '#ff7a1a');
        g.px('front', 5, 3, '#ff7a1a');
        g.rect('front', 2, 5, 4, 1, shade(SAND, -0.4));
      },
    },
    ...legs2({ size: [3, 10, 3], x: 2, z: 0, uv: [30, 0], skin: (g) => { sandSkin(g); g.band('sides', 8, 10, shade(SAND, -0.3)); }, amp: 0.7 }),
    // arms swing opposite to the legs
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 5.5, 14.5, 0],
        size: [3, 11, 3],
        uv: [44, 0],
        joint: { chan: 'walk', axis: 'x', amp: 0.6, phase: s === 1 ? Math.PI : 0 },
        skin: (g) => {
          sandSkin(g);
          g.band('sides', 9, 11, shade(SAND, -0.35));
        },
      })
    ),
    // ember crystals on the shoulders
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 4.5, 21, -1],
        size: [2, 3, 2],
        uv: [32, 16],
        rot: [0, 0, s * -0.3],
        joint: { chan: 'idle', axis: 'z', amp: 0.08, phase: s },
        skin: (g) => {
          g.speckle('all', ['#ff8a1e', '#ffa53a', '#e8650f']);
          g.px('top', 0, 0, '#ffd27a');
        },
      })
    ),
  ],
};

// ---- Thorn Crawler ------------------------------------------------------------------------------
const SHELL = '#3f5a2c';
const crawlerLeg = (g: Parameters<PartSpec['skin']>[0]) => g.speckle('all', tones('#2a2a22', 0.06));
const crawler: SpeciesSpec = {
  kind: 'thornCrawler',
  name: { en: 'Thorn Crawler', ar: 'الزاحف الشوكي' },
  emoji: '🪲',
  tex: [64, 64],
  move: 'walk',
  speed: 1.8,
  hp: 8,
  tameable: false,
  hostile: { damage: 2, chase: 4.2, sight: 14, cooldown: 0.9, knock: 3.5, drops: [[STICK, 2]] },
  habitat: { weight: 0.8, biomes: ['forest', 'plains'], herd: [1, 2] },
  parts: [
    {
      // shell
      at: [0, 6, 0],
      size: [10, 5, 14],
      uv: [0, 0],
      skin: (g) => {
        g.speckle('all', tones(SHELL, 0.08));
        g.grain('top', shade(SHELL, 0.25), 0.1);
        // a pale seam down the middle of the back
        g.rect('top', 4, 0, 2, 14, shade(SHELL, -0.3));
        g.speckle('bottom', tones('#2a2a22', 0.05));
      },
    },
    {
      // head
      at: [0, 5.5, 9],
      size: [6, 4, 4],
      uv: [0, 20],
      skin: (g) => {
        g.speckle('all', tones('#2c3320', 0.06));
        g.px('front', 1, 1, '#ff3b3b');
        g.px('front', 4, 1, '#ff3b3b');
        g.px('front', 1, 2, '#9e1414');
        g.px('front', 4, 2, '#9e1414');
      },
    },
    // mandibles that snap
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 2, 4.5, 12],
        size: [1, 1, 3],
        uv: [22, 20],
        rot: [0, s * 0.35, 0],
        joint: { chan: 'idle', axis: 'y', amp: s * 0.35, phase: 0, pivot: [s * 2, 4.5, 10.5] },
        skin: (g) => g.fill('all', '#c9c2a0'),
      })
    ),
    // six legs: front and back pairs as diagonals, the middle pair in between
    ...([
      [6, 4, 0],
      [-6, 4, Math.PI],
      [6, -4, Math.PI],
      [-6, -4, 0],
      [6, 0, Math.PI / 2],
      [-6, 0, -Math.PI / 2],
    ] as const).map(
      ([x, z, phase]): PartSpec => ({
        at: [x, 2, z],
        size: [2, 4, 2],
        uv: [32, 20],
        joint: { chan: 'walk', axis: 'x', amp: 0.9, phase },
        skin: crawlerLeg,
      })
    ),
    // thorns along the back
    ...[-4, 0, 4].map(
      (z): PartSpec => ({
        at: [0, 9.5, z],
        size: [1, 3, 1],
        uv: [42, 20],
        rot: [-0.3, 0, 0],
        skin: (g) => {
          g.fill('all', '#d8d0a8');
          g.px('top', 0, 0, '#fff4c8');
        },
      })
    ),
  ],
};

// ---- Stone Brute --------------------------------------------------------------------------------
const STONE = '#7d7f86';
const stoneSkin = (g: Parameters<PartSpec['skin']>[0]) => {
  g.speckle('all', tones(STONE, 0.09));
  g.grain('all', shade(STONE, -0.3), 0.07);
};
const brute: SpeciesSpec = {
  kind: 'stoneBrute',
  name: { en: 'Stone Brute', ar: 'العملاق الصخري' },
  emoji: '🗿',
  tex: [64, 64],
  move: 'walk',
  speed: 0.9,
  hp: 24,
  tameable: false,
  hostile: { damage: 6, chase: 2.2, sight: 18, cooldown: 1.7, knock: 8, drops: [[COBBLE, 3], [IRON, 1]] },
  habitat: { weight: 0.3, herd: [1, 1] },
  parts: [
    {
      // body with a mossy top
      at: [0, 22, 0],
      size: [12, 12, 7],
      uv: [0, 0],
      skin: (g) => {
        stoneSkin(g);
        g.speckle('top', tones('#5d8a3a', 0.08));
        g.band('sides', 0, 2, '#5d8a3a');
        g.grain('sides', '#6f9d47', 0.06);
      },
    },
    {
      // head sunk between the shoulders
      at: [0, 31, 1],
      size: [8, 6, 7],
      uv: [0, 20],
      skin: (g) => {
        stoneSkin(g);
        g.rect('front', 1, 2, 2, 1, '#5ff0ff');
        g.rect('front', 5, 2, 2, 1, '#5ff0ff');
        g.rect('front', 1, 1, 6, 1, shade(STONE, -0.4));
        g.rect('front', 2, 4, 4, 1, shade(STONE, -0.45));
      },
    },
    ...legs2({ size: [4, 16, 4], x: 3.5, z: 0, uv: [40, 0], skin: (g) => { stoneSkin(g); g.band('sides', 14, 16, shade(STONE, -0.35)); }, amp: 0.5 }),
    // long heavy arms
    ...[1, -1].map(
      (s): PartSpec => ({
        at: [s * 8.5, 20, 0],
        size: [5, 16, 5],
        uv: [32, 22],
        joint: { chan: 'walk', axis: 'x', amp: 0.45, phase: s === 1 ? Math.PI : 0 },
        skin: (g) => {
          stoneSkin(g);
          g.band('sides', 13, 16, shade(STONE, -0.25));
          g.speckle('top', tones('#5d8a3a', 0.08));
        },
      })
    ),
  ],
};

export const SPECIES: SpeciesSpec[] = [sandling, crawler, brute];
