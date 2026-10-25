import { mulberry32 } from '../math';
import { box, defineModel } from '../voxel';
import type { Box } from '../voxel';

// Falcon's Peak's building blocks: every model is a handful of coloured boxes, built once and shared by all copies. Origin is
// where the thing meets the ground; +z is the way a creature faces. Kept deliberately small: a few bold shapes read better (and
// cost far less) than many tiny ones.

// ---- mountains ----------------------------------------------------------------------------------------------------------------

const ROCK = ['#8f8e80', '#9a998a', '#858476', '#a3a294'] as const;
const STRATA = '#74736a'; // a darker band every third tier
const SNOW = ['#ffffff', '#f4f9fd', '#ebf3f9'] as const;
const BURY = 6; // the first tier goes this far into the ground, so a mountain on a stepped slope never shows a gap

interface Peak {
  x: number;
  z: number;
  /** Half-width of the foot, and height. */
  hw: number;
  h: number;
  /** Where the snow starts, as a share of the height. */
  snow: number;
}

const pick = <T>(list: readonly T[], rand: () => number) => list[Math.floor(rand() * list.length)];

/** A stepped pyramid: tiers narrow towards the top (rock, then white above the snow line, whose first tier overhangs like a cap). */
function peak(p: Peak, seed: number): Box[] {
  const rand = mulberry32(seed);
  const n = Math.round(p.h / 1.9);
  const ts = p.h / n;
  const out: Box[] = [];
  let capped = false;
  for (let i = 0; i < n; i++) {
    const half = Math.max(0.55, p.hw * (1 - (i + 0.5) / n) ** 1.25);
    const cx = p.x + (rand() - 0.5) * half * 0.3;
    const cz = p.z + (rand() - 0.5) * half * 0.3;
    const y = i === 0 ? -BURY : i * ts;
    const h = i === 0 ? ts + BURY : ts;
    const d = 2 * half * (0.9 + rand() * 0.2);
    if ((i + 0.5) / n >= p.snow) {
      const grow = capped ? 0 : 0.9;
      capped = true;
      out.push(box(cx, y, cz, 2 * half + grow, h, d + grow, pick(SNOW, rand)));
    } else {
      out.push(box(cx, y, cz, 2 * half, h, d, i % 3 === 2 ? STRATA : pick(ROCK, rand)));
      // a small lump on one corner of every other tier breaks the square outline (it pokes out only a little, so the foot stays compact)
      if (i % 2 === 0 && half > 2) {
        out.push(box(cx + (rand() < 0.5 ? -1 : 1) * half * 0.7, y, cz + (rand() < 0.5 ? -1 : 1) * half * 0.65, half * 0.8, h, half * 0.8, pick(ROCK, rand)));
      }
    }
  }
  return out;
}

const mountain = (seed: number, peaks: readonly Peak[]) => defineModel(() => peaks.flatMap((p, i) => peak(p, seed + i * 17)));

/**
 * The four big mountains, in the order of the terrain's MASSIFS (each stands on the flat crown of its foot): a main peak with one
 * or two lower ones, the lower ones leaning away from the road.
 */
export const MOUNTAINS = [
  mountain(3, [
    { x: 0, z: 0, hw: 7.5, h: 19, snow: 0.55 },
    { x: -8, z: 3, hw: 5.5, h: 12, snow: 0.6 },
    { x: -1, z: 8.5, hw: 4, h: 8.5, snow: 0.66 },
  ]),
  mountain(11, [
    { x: 0, z: 0, hw: 8.5, h: 21, snow: 0.55 },
    { x: -7, z: -3, hw: 5.5, h: 13, snow: 0.6 },
    { x: 6.5, z: 5.5, hw: 4, h: 8.5, snow: 0.66 },
  ]),
  mountain(23, [
    { x: 0, z: 0, hw: 6, h: 14, snow: 0.55 },
    { x: 5, z: 3.5, hw: 3.8, h: 8.5, snow: 0.62 },
  ]),
  mountain(31, [
    { x: 0, z: 0, hw: 6.5, h: 15, snow: 0.55 },
    { x: -5.5, z: 4.5, hw: 4, h: 8.5, snow: 0.62 },
  ]),
] as const;

/** A small snowy pair standing straight on the meadow, beside the first level. */
export const FOOTHILLS = mountain(41, [
  { x: 0, z: 0, hw: 4.8, h: 10, snow: 0.55 },
  { x: 6, z: -2, hw: 3.6, h: 7, snow: 0.62 },
]);

// ---- pines and rocks ----------------------------------------------------------------------------------------------------------

const TRUNK = '#6b4a2c';
const PINE_DARK = '#2a6f48';
const PINE_MID = '#2f7d4f';

/** A pine: a trunk, two plus-shaped tiers (a square with its corners cut reads as round) and square ones up to the tip. */
export const PINE = defineModel(() => [
  box(0, 0, 0, 1, 2.4, 1, TRUNK),
  box(0, 1.4, 0, 5, 1.6, 3, PINE_DARK),
  box(0, 1.4, 0, 3, 1.6, 5, PINE_DARK),
  box(0, 3.0, 0, 4, 1.6, 2, PINE_MID),
  box(0, 3.0, 0, 2, 1.6, 4, PINE_MID),
  box(0, 4.6, 0, 3, 1.5, 3, PINE_DARK),
  box(0, 6.0, 0, 2, 1.5, 2, PINE_MID),
  box(0, 7.4, 0, 1, 1.5, 1, '#3a9461'),
]);

export const BOULDERS = [
  defineModel(() => [
    box(0, -0.5, 0, 4.2, 2.9, 3.4, '#a39d92'),
    box(-0.2, 2.2, 0.1, 3.2, 1.2, 2.6, '#b0aaa0'),
    box(-2.4, -0.5, 0.7, 1.6, 1.8, 1.8, '#968f85'),
  ]),
  defineModel(() => [box(0, -0.4, 0, 2.6, 1.8, 2.4, '#a39d92'), box(0.1, 1.2, 0, 1.6, 0.8, 1.5, '#b3ada2')]),
] as const;

// ---- the summit flag ----------------------------------------------------------------------------------------------------------

const POLE_TOP = 13;
/** Where the cloth hangs on the pole. */
export const CLOTH_Y = 10.2;

/** A cairn of stacked stones with a tall pale pole through it. The cloth is separate (it waves). */
export const CAIRN = defineModel(() => [
  box(0, -2, 0, 6, 3, 6, '#85827a'),
  box(0.2, 1, -0.1, 4.6, 1.1, 4.4, '#97948b'),
  box(-0.2, 2.1, 0.1, 3.4, 1, 3.2, '#8d8a82'),
  box(0.1, 3.1, -0.1, 2.2, 1, 2.1, '#a29f96'),
  box(0, 4.1, 0, 0.6, POLE_TOP - 4.1, 0.6, '#e6d6b0'),
  box(0, POLE_TOP, 0, 1, 0.9, 1, '#f3c744'),
]);

/** The cloth in two halves, so the outer one can swing a little behind the inner (origin on the pole, hanging towards +x). */
const cloth = (c: string, hem: string) => defineModel(() => [box(1.3, 0, 0, 2.6, 2.8, 0.3, c), box(1.3, 0, 0, 2.62, 0.55, 0.32, hem)]);
export const CLOTH = [cloth('#d83b36', '#b72f2d'), cloth('#d83b36', '#b72f2d')] as const;

// ---- clouds and falcons -------------------------------------------------------------------------------------------------------

const BELLY = '#dce8f2';
const WHITE = '#ffffff';

const cloud = (x: number, y: number, z: number, s: number): Box[] => [
  box(x, y, z, 9 * s, 1.5 * s, 5 * s, BELLY),
  box(x, y + 1.5 * s, z, 10 * s, 2 * s, 5.5 * s, WHITE),
  box(x - 2.5 * s, y + 3.5 * s, z + 0.3 * s, 4 * s, 1.8 * s, 4 * s, WHITE),
  box(x + 1.8 * s, y + 3.5 * s, z - 0.3 * s, 5 * s, 2.6 * s, 4.5 * s, WHITE),
  box(x + 4.8 * s, y + 1.2 * s, z + 1.4 * s, 3 * s, 1.6 * s, 3 * s, WHITE),
  box(x - 5.4 * s, y + 1.2 * s, z - s, 3 * s, 1.6 * s, 3 * s, WHITE),
];

/** All three clouds in one mesh (they drift as one group), in zone coordinates: x, height, depth into the zone. They float out beside the road, since from the camera's angle a cloud h blocks up appears about 1.3 h farther along. */
export const CLOUDS = defineModel(() => [...cloud(21, 16, 26, 1), ...cloud(-23, 15, 62, 0.85), ...cloud(-24, 14, 95, 0.75)]);

const CREAM = '#efe1bf';
const BROWN = '#7a4a2a';
const DARK = '#3b2a1e';

const wing = (sx: 1 | -1) => [
  box(sx * 1.45, 0.35, -0.05, 1.9, 0.2, 1.7, '#8a5630'),
  box(sx * 1.45, 0.3, -0.85, 1.9, 0.16, 0.5, '#e9d9b5'),
  box(sx * 3.3, 0.33, -0.15, 1.8, 0.18, 1.35, '#74462a'),
  box(sx * 4.75, 0.31, -0.3, 1.2, 0.16, 0.95, '#3d2a1f'),
  box(sx * 5.55, 0.29, -0.55, 0.5, 0.14, 0.6, '#3d2a1f'),
];

/** A falcon in flight seen from above: body, tail, head and both wings spread. One mesh; it "flaps" by narrowing its span. */
export const FALCON = defineModel(() => [
  box(0, 0, 0, 1.1, 0.9, 2.4, BROWN),
  box(0, -0.12, 0.35, 0.8, 0.2, 1.4, CREAM),
  box(0, 0.08, -1.7, 0.9, 0.2, 1.3, '#6a3e22'),
  box(0, 0.08, -2.45, 1.0, 0.2, 0.5, CREAM),
  box(0, 0.05, 1.5, 0.95, 0.9, 0.95, CREAM),
  box(0, 0.67, 1.5, 0.98, 0.3, 0.98, '#8a5a35'),
  box(0, 0.17, 2.12, 0.36, 0.34, 0.4, '#e3a62c'),
  box(0.49, 0.43, 1.7, 0.1, 0.2, 0.2, DARK),
  box(-0.49, 0.43, 1.7, 0.1, 0.2, 0.2, DARK),
  ...wing(1),
  ...wing(-1),
]);
