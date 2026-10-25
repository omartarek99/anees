import { box, defineModel, disc } from '../voxel';
import type { Box } from '../voxel';

// The Corniche's landmarks as lists of coloured boxes (see voxel.tsx). Every model stands on y = 0 with its centre at
// x = z = 0 and faces +z. The boats are the exception: their waterline is y = 0 (the hull dips below it).

const WOOD = '#8a5a2b';
const WOOD_DARK = '#5e3a1b';
const WOOD_MID = '#744a24';
const WOOD_LIGHT = '#b87c40';
const DECK = '#d6aa6c';
const CREAM = '#f6f3ea';
const RED = '#e0453a';
const BLUE = '#2f6fb5';
const STONE = '#3a465e';
const SAIL = ['#fff7e0', '#f2e6c6'];

// ---- palms ---------------------------------------------------------------------------------------------------------------

const TRUNK = ['#9a6538', '#86552b', '#a87241'];
const LEAF = ['#3fa14a', '#55b653'];
const FROND_Y = [0.6, 0.35, -0.5];

/** A banded trunk that leans a little, under a crown of eight drooping fronds. `lean` is how far the top drifts, in blocks. */
function palm(h: number, lean: number): Box[] {
  const o: Box[] = [];
  let tx = 0;
  for (let j = 0; j < h; j++) {
    tx = Math.round(lean * (j / h) ** 2 * 2) / 2;
    o.push(box(tx, j, 0, j === 0 ? 1.6 : 1, 1, j === 0 ? 1.6 : 1, TRUNK[j % 3]));
  }
  o.push(box(tx, h, 0, 1.8, 0.9, 1.8, '#2f8a3f'), box(tx + 0.9, h - 0.6, 0.3, 0.7, 0.7, 0.7, '#5a3b1f'), box(tx - 0.7, h - 0.6, -0.6, 0.7, 0.7, 0.7, '#5a3b1f'));
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2 + 0.2;
    for (let i = 0; i < 3; i++) {
      const d = 1.3 + i * 1.3;
      const s = i < 2 ? 1.6 : 1.1;
      // a hair of height per frond keeps the overlapping tops from flickering against each other
      o.push(box(tx + Math.cos(ang) * d, h + FROND_Y[i] + a * 0.015, Math.sin(ang) * d, s, 0.45, s, LEAF[(i + (a & 1)) % 2]));
    }
  }
  return o;
}
export const PALM_A = defineModel(() => palm(8, 1.5));
export const PALM_B = defineModel(() => palm(7, -1));

// ---- lighthouse, rocks, shell, buoy ---------------------------------------------------------------------------------------

/** A striped lighthouse about 15 blocks tall with a glowing lamp. */
export const LIGHTHOUSE = defineModel(() => {
  const o: Box[] = [];
  for (let i = 0; i < 6; i++) o.push(...disc(0, i * 1.8, 0, 2.7 - i * 0.22, 1.8, i % 2 ? RED : CREAM));
  o.push(...disc(0, 10.8, 0, 2.9, 0.5, STONE), ...disc(0, 11.3, 0, 1.6, 1.6, '#fff0a8', true));
  o.push(...disc(0, 12.9, 0, 2.3, 0.6, BLUE), ...disc(0, 13.5, 0, 1.5, 0.6, BLUE), box(0, 14.1, 0, 0.8, 0.5, 0.8, BLUE), box(0, 14.6, 0, 0.2, 1, 0.2, STONE));
  o.push(box(0, 0, 2.55, 1.2, 1.8, 0.3, '#5a3b1f'), box(0, 4.6, 2.2, 0.8, 1, 0.2, '#25406a'), box(0, 7.8, 1.95, 0.8, 1, 0.2, '#25406a'));
  return o;
});

export const BOULDER = defineModel(() => [
  box(0, 0, 0, 2.4, 1.2, 2, '#8f8b86'),
  box(0.4, 1.2, 0.1, 1.4, 0.9, 1.2, '#a39f99'),
  box(-0.9, 0, 0.9, 1.3, 0.7, 1.1, '#7d7a76'),
]);

const SHELL_ROWS = [1, 3, 4, 5]; // a scallop lying back on its hinge: ribs fanning out and up, towards the viewer's side
export const SHELL = defineModel(() => {
  const o: Box[] = [box(0, 0, 0.5, 0.8, 0.5, 0.6, '#f3d9c6')];
  SHELL_ROWS.forEach((n, j) => {
    for (let i = 0; i < n; i++) {
      const edge = i === 0 || i === n - 1;
      o.push(box((i - (n - 1) / 2) * 0.55, 0.3 + j * 0.15, -j * 0.55, 0.55, 0.4, 0.6, edge ? '#e98f95' : i % 2 ? '#f7b9b6' : '#fbd9d3'));
    }
  });
  return o;
});

/** A red-and-white buoy with a lamp; the lower stripe floats under the surface. */
export const BUOY = defineModel(() => [
  ...disc(0, -0.6, 0, 1.4, 0.8, RED),
  ...disc(0, 0.2, 0, 1.2, 0.8, CREAM),
  ...disc(0, 1, 0, 0.9, 0.8, RED),
  box(0, 1.8, 0, 0.6, 0.9, 0.6, STONE),
  box(0, 2.7, 0, 0.8, 0.8, 0.8, '#ffd45a', true),
]);

// ---- boats ---------------------------------------------------------------------------------------------------------------

const SB_W = [1.8, 2.4, 2.6, 2.2, 1.2]; // the sailboat's hull, stern to bow (z = -2 .. 2)
/** The small sailboat: a brown hull, one mast, a white mainsail and a jib. About 5 long. */
export const SAILBOAT = defineModel(() => {
  const o: Box[] = [];
  SB_W.forEach((w, i) => {
    const z = i - 2;
    o.push(box(0, -0.6, z, w * 0.6, 0.6, 1, WOOD_DARK), box(0, 0, z, w, 0.8, 1, WOOD), box(0, 0.8, z, w - 0.6, 0.2, 1, DECK));
    if (w > 1.5) for (const s of [-1, 1]) o.push(box(s * (w / 2 - 0.15), 0.8, z, 0.3, 0.5, 1, WOOD_LIGHT));
  });
  o.push(box(0, 1, 0.2, 0.3, 6.2, 0.3, '#6b4524'), box(0, 7.2, 0.5, 0.12, 0.5, 0.9, RED));
  for (let j = 0; j < 6; j++) {
    o.push(box(0, 1.5 + j * 0.8, -(2.8 * (1 - j / 7)) / 2 + 0.05, 0.15, 0.8, 2.8 * (1 - j / 7), SAIL[j % 2]));
    if (j < 5) o.push(box(0, 1.5 + j * 0.8, 0.35 + (1.9 * (1 - j / 6)) / 2, 0.12, 0.8, 1.9 * (1 - j / 6), SAIL[(j + 1) % 2]));
  }
  return o;
});

const HULL_W = [3.4, 4.2, 4.6, 4.8, 4.8, 4.6, 4.2, 3.5, 2.7, 1.9, 1.1]; // the dhow's hull, stern to bow
const HULL_RISE = [1.8, 1.2, 0.7, 0.3, 0, 0.2, 0.6, 1.2, 2, 3, 4.2]; // the curved sheer: high at both ends, low amidships
const SECTION = 1.25;

/** A lateen sail: rows of cream from the mast forward, each shorter than the one below, so the long edge slopes. */
function lateen(x: number, z: number, y: number, rows: number, len: number): Box[] {
  const o: Box[] = [];
  for (let j = 0; j < rows; j++) {
    const l = len * (1 - j / (rows + 1));
    o.push(box(x, y + j, z + 0.3 + l / 2, 0.3, 1, l, SAIL[j % 2]));
  }
  return o;
}

/** The big wooden dhow: a curved hull whose bow sweeps up to a point, a cabin at the stern and two lateen sails. About 14 long. */
export const DHOW = defineModel(() => {
  const o: Box[] = [];
  HULL_W.forEach((w, i) => {
    const z = (i - 5) * SECTION;
    const rise = HULL_RISE[i];
    o.push(box(0, -1, z, w * 0.55, 1, SECTION, WOOD_DARK), box(0, 0, z, w * 0.9, 1.2 + rise, SECTION, WOOD_MID), box(0, 1.2 + rise, z, w * 0.7, 0.2, SECTION, DECK));
    if (w > 3) for (const s of [-1, 1]) o.push(box(s * (w * 0.45 - 0.2), 1.2 + rise, z, 0.4, 0.7, SECTION, WOOD_LIGHT));
  });
  o.push(box(0, 5.4, 6.4, 0.3, 0.6, 0.7, RED)); // the tip of the prow
  o.push(box(0, 3.2, -6.9, 2.6, 1, 0.5, WOOD_LIGHT)); // the stern post
  o.push(box(0, 2, -5.3, 3.2, 2.6, 2.6, '#efe3c4'), box(0, 4.6, -5.3, 3.9, 0.4, 3.3, WOOD_MID), box(0, 2.1, -3.95, 1, 1.5, 0.12, '#4a2f18'));
  for (const s of [-1, 1]) o.push(box(s * 1.62, 3.2, -5.3, 0.12, 0.9, 0.9, '#2c4f73'));
  // masts and sails: the aft sail on the left of its mast, the fore sail on the right, so they never touch
  o.push(box(0, 1.5, 0.4, 0.45, 9.5, 0.45, '#6b4524'), box(0, 11, 0.4, 0.14, 0.5, 1.2, RED), box(0, 1.5, -2.3, 0.45, 8, 0.45, '#6b4524'));
  o.push(...lateen(0.4, 0.4, 3.4, 7, 3.8), ...lateen(-0.4, -2.3, 3.4, 6, 3.4));
  return o;
});

// ---- gulls ---------------------------------------------------------------------------------------------------------------

/** One gull gliding, wings spread, tips dark. */
function gull(x: number, y: number, z: number): Box[] {
  const o = [box(x, y, z, 0.6, 0.5, 1.5, '#f6f8fb'), box(x, y + 0.05, z + 0.95, 0.5, 0.5, 0.5, '#f6f8fb'), box(x, y + 0.12, z + 1.4, 0.2, 0.2, 0.4, '#f2a431')];
  for (const s of [-1, 1]) o.push(box(x + s * 1.2, y + 0.15, z, 1.8, 0.16, 1.1, '#f6f8fb'), box(x + s * 2.6, y + 0.3, z - 0.15, 1.2, 0.14, 0.8, '#3a4052'));
  return o;
}
/** Four gulls in a loose V; the leader at the origin, the rest trailing behind (-z). */
export const GULLS = defineModel(() => [...gull(0, 0, 0), ...gull(-4, 0.3, -3.2), ...gull(4.2, -0.2, -3.8), ...gull(-8.2, 0.1, -6.6)]);
