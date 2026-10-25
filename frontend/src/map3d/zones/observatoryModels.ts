import { clamp } from '../math';
import { box, defineModel, disc } from '../voxel';
import type { Box } from '../voxel';

// The Sky Observatory's landmarks: two ringed planets, a crescent moon, gold stars, the brass telescope, a rocket on its
// launch pad and a satellite. Each is a list of coloured boxes merged once (see voxel.tsx). Origins sit where the thing
// touches the ground, or at its centre for things that float.

const BRASS = '#d9a441';
const BRASS_D = '#a8741f';
const BRASS_L = '#f0c867';
const GRAPHITE = '#3a3350';
const LAVENDER = '#d7d2f0';
const WHITE = '#f4f1ff';
const RED = '#e5484d';
const STONE = '#6a5aa8';
const STONE_L = '#8a7ac8';
const SKIRT = '#3f3476'; // buried under every structure, so a slope never shows a gap

// ---- shape helpers ----------------------------------------------------------------------------------------------------

/** Scans the cells (i, j, k) in -n..n; runs of one colour along x become one long box. `colorAt` returns null for an empty cell. */
function cells(n: number, colorAt: (i: number, j: number, k: number) => string | null): Box[] {
  const out: Box[] = [];
  for (let k = -n; k <= n; k++) {
    for (let j = -n; j <= n; j++) {
      let start = 0;
      let col: string | null = null;
      for (let i = -n; i <= n + 1; i++) {
        const c = i <= n ? colorAt(i, j, k) : null;
        if (col !== null && c !== col) {
          const w = i - start;
          out.push({ x: start + (w - 1) / 2, y: j - 0.5, z: k, w, h: 1, d: 1, c: col });
          col = null;
        }
        if (c !== null && col === null) {
          start = i;
          col = c;
        }
      }
    }
  }
  return out;
}

const ball = (r: number, colorAt: (i: number, j: number, k: number) => string) =>
  cells(Math.ceil(r), (i, j, k) => (i * i + j * j + k * k <= r * r + 0.25 ? colorAt(i, j, k) : null));

/** A ring one block thick, tilted `tilt` radians about z (a staircase on the block grid). `colorAt(d)`: colour at distance d from the axis. */
function ring(r0: number, r1: number, tilt: number, colorAt: (d: number) => string | null): Box[] {
  const s = Math.sin(tilt);
  const c = Math.cos(tilt);
  return cells(Math.ceil(r1) + 1, (i, j, k) => {
    const d = Math.hypot(i * c + j * s, k);
    return Math.abs(j * c - i * s) <= 0.5 && d >= r0 && d <= r1 ? colorAt(d) : null;
  });
}

/** A flat shape in the XY plane (z is its centre, d its thickness): rows merged along x. The moon and the stars glow. */
function plane(inside: (i: number, j: number) => boolean, n: number, z: number, d: number, c: string): Box[] {
  const out: Box[] = [];
  for (let j = -n; j <= n; j++) {
    let start: number | null = null;
    for (let i = -n; i <= n + 1; i++) {
      const on = i <= n && inside(i, j);
      if (on && start === null) start = i;
      if (!on && start !== null) {
        const w = i - start;
        out.push({ x: start + (w - 1) / 2, y: j - 0.5, z, w, h: 1, d, c, glow: true });
        start = null;
      }
    }
  }
  return out;
}

/** A copy of some boxes moved to (x, y, z) and scaled about their own origin. */
const put = (boxes: readonly Box[], x: number, y: number, z: number, s: number): Box[] =>
  boxes.map((b) => ({ ...b, x: x + b.x * s, y: y + b.y * s, z: z + b.z * s, w: (b.w ?? 1) * s, h: (b.h ?? 1) * s, d: (b.d ?? 1) * s }));

// ---- planets and moon -----------------------------------------------------------------------------------------------------

/** The big planet turns slowly (it is animated, so it is its own model) about an axis tilted by BIG_TILT; its ring stays put. */
export const BIG_TILT = 0.32;
const GOLD_BANDS = ['#c9631a', '#f2a23a', '#fbd27a', '#f2a23a', '#e8892e', '#fbd27a', '#f2a23a', '#e8892e', '#c9631a'];
// the storm spot is there to watch it turn
export const BIG_PLANET = defineModel(() => ball(4.1, (i, j, k) => (j === -1 && k >= 2 && Math.abs(i + 1) <= 1 ? '#b8461a' : GOLD_BANDS[j + 4])));
export const BIG_RING = defineModel(() => ring(5.4, 7.8, BIG_TILT, (d) => (d > 6.4 && d < 6.8 ? null : d < 6.4 ? '#f6dc9a' : '#d9a24e')));

/** The smaller lilac planet with its ring, bands tilted to match: all one static model. */
const LILAC_TILT = 0.3;
const LILAC_BANDS = ['#6f55c8', '#8d72e0', '#a98bf0', '#8d72e0', '#6f55c8', '#a98bf0', '#7a5fd0'];
export const LILAC_PLANET = defineModel(() => [
  ...ball(2.8, (i, j) => LILAC_BANDS[clamp(Math.round(j * Math.cos(LILAC_TILT) - i * Math.sin(LILAC_TILT)) + 3, 0, 6)]),
  ...ring(3.9, 6.1, LILAC_TILT, (d) => (d > 4.9 && d < 5.3 ? null : d < 4.9 ? '#e0d4ff' : '#a894e8')),
]);

const crescent = (R: number, R2: number, ox: number, oy: number) => (i: number, j: number) =>
  i * i + j * j <= R * R && (i - ox) ** 2 + (j - oy) ** 2 > R2 * R2;
/** The yellow crescent: a darker, thicker back layer under a brighter, slimmer front one. */
export const CRESCENT = defineModel(() => [
  ...plane(crescent(4.8, 4.1, 2.3, 1.1), 6, -0.4, 2.2, '#f2a92e'),
  ...plane(crescent(4.1, 4.6, 2.2, 1.0), 6, 0.9, 1.0, '#ffe27a'),
]);

// ---- gold stars -----------------------------------------------------------------------------------------------------------

const starPoly = (R: number, r: number): [number, number][] =>
  Array.from({ length: 10 }, (_, k): [number, number] => {
    const a = (k * Math.PI) / 5;
    const rr = k % 2 ? r : R;
    return [Math.sin(a) * rr, Math.cos(a) * rr];
  });
function inPoly(x: number, y: number, p: readonly [number, number][]): boolean {
  let hit = false;
  for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
    if (p[a][1] > y !== p[b][1] > y && x < ((p[b][0] - p[a][0]) * (y - p[a][1])) / (p[b][1] - p[a][1]) + p[a][0]) hit = !hit;
  }
  return hit;
}
/** A fat five-pointed star (5 blocks from centre to tip) with a raised, brighter face towards the camera. */
const STAR = (() => {
  const back = starPoly(5, 2.2);
  const front = starPoly(3.4, 1.5);
  return [...plane((i, j) => inPoly(i, j, back), 5, 0, 1.6, '#eaa626'), ...plane((i, j) => inPoly(i, j, front), 4, 1, 0.8, '#ffe27a')];
})();

/** A little cluster of stars as one model (x, y, z, size), so it can twinkle as one animated group. */
const cluster = (stars: readonly (readonly [number, number, number, number])[]) =>
  defineModel(() => stars.flatMap(([x, y, z, s]) => put(STAR, x, y, z, s)));
export const STARS_A = cluster([[-5, 0, 0, 0.8], [2.5, 3, -2, 0.6], [6.5, -1, 2.5, 0.45], [0, -3, 4, 0.4]]);
export const STARS_B = cluster([[4, 0, 0, 0.75], [-3.5, 2.5, -2, 0.55], [-7, -1.5, 2, 0.45], [0.5, -3, 3.5, 0.4]]);

// ---- the brass telescope ----------------------------------------------------------------------------------------------------

/** Stone platform, graphite tripod, brass mount and a tube pointing up and to the right (a staircase of blocks). */
export const TELESCOPE = defineModel(() => {
  const out: Box[] = [...disc(0, -1.5, 0, 3.8, 1.5, SKIRT), ...disc(0, 0, 0, 3.8, 0.6, STONE), ...disc(0, 0.6, 0, 2.6, 0.15, STONE_L)];
  for (const a of [Math.PI / 2, Math.PI / 2 + 2.094, Math.PI / 2 + 4.189]) {
    for (let s = 0; s < 5; s++) {
      const r = 2.6 - s * 0.5;
      out.push(box(Math.cos(a) * r, 0.75 + s, Math.sin(a) * r, 0.8, 1, 0.8, GRAPHITE));
    }
    out.push(box(Math.cos(a) * 2.8, 0.6, Math.sin(a) * 2.8, 1.2, 0.25, 1.2, BRASS_D));
  }
  const py = 6.8; // the pivot's height
  out.push(box(0, 5.75, 0, 2.2, 0.7, 2.2, BRASS_D), box(0, 6.4, 1.15, 1.6, 1.8, 0.4, BRASS), box(0, 6.4, -1.15, 1.6, 1.8, 0.4, BRASS));
  const dx = Math.cos(0.5);
  const dy = Math.sin(0.5);
  for (let s = -1.2; s <= 5.2; s += 0.95) out.push(box(dx * s, py + dy * s - 0.9, 0, 1.7, 1.8, 1.8, BRASS));
  for (const s of [0.9, 3.4]) out.push(box(dx * s, py + dy * s - 1.05, 0, 1.4, 2.1, 2.1, BRASS_D));
  out.push(box(dx * 6.3, py + dy * 6.3 - 1.4, 0, 2.2, 2.8, 2.8, BRASS_L), box(dx * 7.2, py + dy * 7.2 - 1, 0, 0.5, 2, 2, '#bfe8ff', true));
  out.push(box(dx * -2.4, py - dy * 2.4 - 0.5, 0, 1.2, 1, 1, GRAPHITE));
  return out;
});

// ---- the rocket and its pad ------------------------------------------------------------------------------------------------------

/** White body, red nose and fins, a porthole towards +z and a glowing flame. Origin at the nozzle; about 10 blocks tall. */
export const ROCKET = defineModel(() => [
  ...disc(0, 0, 0, 1, 0.8, GRAPHITE),
  ...disc(0, 0.8, 0, 1.8, 0.7, '#8a86aa'),
  ...disc(0, 1.5, 0, 2.2, 4.5, WHITE),
  ...disc(0, 2.3, 0, 2.7, 0.8, RED),
  ...disc(0, 6, 0, 1.6, 1, WHITE),
  ...disc(0, 7, 0, 1.3, 1, RED),
  ...disc(0, 8, 0, 0.8, 1, RED),
  box(0, 9, 0, 1, 1, 1, RED),
  box(0, 3.6, 2.3, 1.8, 1.8, 0.6, '#8fe0ff'),
  ...[-1, 1].flatMap((s) => [box(s * 3, 1, 0, 1, 3, 1.4, RED), box(s * 3.9, 1, 0, 0.8, 1.6, 1, RED)]),
  box(0, 1, -3, 1.4, 3, 1, RED),
  ...disc(0, -1, 0, 1.2, 1, '#ffe27a', true),
  ...disc(0, -2, 0, 0.8, 1, '#ffb13a', true),
  box(0, -3, 0, 0.8, 1, 0.8, '#ff7a2a', true),
]);

/** A round pad with a scorch glow and a small gantry on its left; the rocket hovers above its middle. */
export const LAUNCH_PAD = defineModel(() => [
  ...disc(0, -1.5, 0, 5, 1.5, SKIRT),
  ...disc(0, 0, 0, 5, 0.5, '#8a82b8'),
  ...disc(0, 0.5, 0, 3.2, 0.2, '#5d5390'),
  ...disc(0, 0.7, 0, 1.6, 0.1, '#ffcf6a', true),
  box(-5.7, 0.5, -0.8, 0.5, 8.5, 0.5, LAVENDER),
  box(-5.7, 0.5, 0.8, 0.5, 8.5, 0.5, LAVENDER),
  ...[2.5, 5, 7.5].map((y) => box(-5.7, y, 0, 0.4, 0.35, 2.1, LAVENDER)),
  box(-5.7, 9, 0, 1.4, 0.5, 2.4, RED),
]);

// ---- satellite and ground stud -------------------------------------------------------------------------------------------------

/** Origin at the centre. Solar panels run along x. */
export const SATELLITE = defineModel(() => [
  box(0, -1.1, 0, 2.2, 2.2, 2.2, WHITE),
  box(0, -0.4, 0, 2.5, 0.6, 2.5, BRASS),
  box(0, 1.1, 0, 0.3, 1.6, 0.3, '#8a86aa'),
  box(0, 2.7, 0, 0.6, 0.6, 0.6, '#ff6a6a', true),
  ...[-1, 1].flatMap((s) => [
    box(s * 2.2, -0.3, 0, 2.2, 0.3, 0.3, '#c8c4e8'),
    box(s * 4.8, -0.25, 0, 3.6, 0.25, 3.4, '#3b6fe0'),
    box(s * 4.8, -0.1, 0, 0.25, 0.1, 3.4, '#e8e4ff'),
  ]),
]);

/** The artwork's dots, as a tiny glowing block. */
export const STUD = defineModel(() => [box(0, 0, 0, 0.55, 0.5, 0.55, '#fff0c8', true)]);
