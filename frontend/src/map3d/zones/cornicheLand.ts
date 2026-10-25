import { seamFade } from '../ground';
import { ZONES } from '../layout';
import { fbm, hash2, lerp, smoothstep } from '../math';
import type { MapZone } from '../schema';
import type { TopColor } from '../Terrain';

// The Corniche's landforms, all in the heightfield (so they cost no draw calls): a sea floor with shallow sand shelves, a curved
// beach and dunes down the right edge, a rocky bank down the left one with a stepped headland (the lighthouse stands on it),
// two islets and two sandbars, a few sea stacks, a breakwater and a turquoise reef. Pure functions of (x, z): the terrain, the
// water's depth texture and the scenery placement all read the same land, so they always agree.

export const ZONE: MapZone = ZONES.find((z) => z.key === 'corniche')!;
/** The water's resting surface. The dock stands at +0.5, so its slabs are always above it. */
export const WATER_Y = -0.2;

/** Where the scenery stands: the land below is built around these. */
export const SPOT = {
  isletA: [-17.5, 221.5],
  isletB: [11, 296.5],
  barC: [8, 224],
  barD: [1.5, 286.5],
  lighthouse: [-18, 266],
} as const;

type Kind = 'sea' | 'sand' | 'rock' | 'pillar' | 'stone' | 'reef';
type Height = (x: number, z: number) => number;

// ---- the pieces ----------------------------------------------------------------------------------------------------------

/** The open sea's floor: level at -1.5, with a few broad basins a block or so deeper. */
const seaFloor: Height = (x, z) => -1.5 - 1.2 * smoothstep(0.52, 0.6, fbm(x, z, 40, 17, 2));

// The right shoreline winds in a long bay: [z, x] control points, eased between.
const SHORE = [[212, 23], [236, 24], [250, 24], [262, 20], [270, 18], [281, 20], [295, 23], [308, 24], [318, 23.5]] as const;
function shoreX(z: number) {
  let i = 0;
  while (i < SHORE.length - 2 && z > SHORE[i + 1][0]) i++;
  const [za, xa] = SHORE[i];
  const [zb, xb] = SHORE[i + 1];
  return lerp(xa, xb, smoothstep(za, zb, z)) + 0.8 * Math.sin(z * 0.33);
}

/** A gentle sandy slope into the water, then dunes behind the beach. */
const beach: Height = (x, z) => {
  const d = x - shoreX(z);
  const crest = 1 + smoothstep(4, 12, d) * (0.4 + 1.8 * fbm(x + 40, z, 7, 3, 2));
  return Math.min(0.3 * (d + 5) - 1.5, crest);
};

const bankX = (z: number) => -22 + 1.8 * Math.sin(z * 0.06 + 1) + 1.2 * Math.sin(z * 0.17);

/** The left bank: steep rock steps up to a plateau. */
const bank: Height = (x, z) => Math.min(0.9 * (bankX(z) - x + 2) - 1.5, 2.5 + 1.4 * fbm(x, z, 9, 21, 2));

const HEAD_A = [-29, 268.5] as const;
const HEAD_B = [-16, 265] as const;

/** A headland reaching out from the bank in four rock terraces; the top is flat, for the lighthouse. */
const headland: Height = (x, z) => {
  const [ax, az] = HEAD_A;
  const [bx, bz] = HEAD_B;
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
  const s = Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t)) + (fbm(x, z, 5, 9, 2) - 0.5) * 1.4;
  if (s < 3.2) return 5;
  if (s < 4.3) return 3.5;
  if (s < 5.3) return 2;
  if (s < 6.1) return 0.5;
  return 0.5 - 0.7 * (s - 6.1);
};

interface Isle {
  x: number;
  z: number;
  /** Radius of the flat top; the sand slopes away beyond it. */
  r: number;
  top: number;
  slope: number;
}
const ISLES: readonly Isle[] = [
  { x: SPOT.isletA[0], z: SPOT.isletA[1], r: 3, top: 1, slope: 0.55 },
  { x: SPOT.isletB[0], z: SPOT.isletB[1], r: 3.8, top: 1, slope: 0.5 },
  { x: SPOT.barC[0], z: SPOT.barC[1], r: 1.4, top: 0.5, slope: 0.5 },
  { x: SPOT.barD[0], z: SPOT.barD[1], r: 1.8, top: 0.5, slope: 0.5 },
];
const isles: Height = (x, z) => {
  let h = -Infinity;
  for (const o of ISLES) {
    const dx = x - o.x;
    const dz = z - o.z;
    if (dx * dx + dz * dz > (o.r + 12) ** 2) continue;
    const d = Math.hypot(dx, dz) / (0.8 + 0.4 * fbm(x + o.x * 3, z + o.z * 3, 5, 5, 2)); // not a perfect circle
    h = Math.max(h, o.top - o.slope * Math.max(0, d - o.r));
  }
  return h;
};

/** Tall rock pillars standing in the water, narrowing in three steps: [x, z, radius, height]. */
const STACKS = [[-11.5, 232, 2.2, 7], [-14.5, 302, 2.6, 9], [-11.2, 299.8, 1.4, 4.5]] as const;
const stacks: Height = (x, z) => {
  let h = -Infinity;
  for (const [sx, sz, r, top] of STACKS) {
    const d = Math.hypot(x - sx, z - sz);
    h = Math.max(h, d < r * 0.55 ? top : d < r * 0.95 ? top * 0.62 : d < r * 1.35 ? top * 0.3 : d < r * 1.8 ? 0 : -Infinity);
  }
  return h;
};

const WALL_Z = 241.2;
const HEAD_X = -10.8;
/** A low stone wall out from the bank, with a wider head and rubble at its foot. */
const breakwater: Height = (x, z) => {
  if (x < -24 || x > -8.2) return -Infinity;
  const dz = Math.abs(z - WALL_Z);
  const head = x > HEAD_X;
  if (dz <= (head ? 1.6 : 1)) return head ? 1.5 : 1;
  return dz <= (head ? 2.8 : 2.2) && hash2(Math.floor(x), Math.floor(z), 11) > 0.4 ? 0 : -Infinity;
};

/** A shallow shelf, so near the surface that its floor shows turquoise through the water. */
const reef: Height = (x, z) => {
  const u = Math.hypot((x + 3) / 9, (z - 245) / 6.5);
  return u > 1.15 ? -Infinity : -0.5 - 1.6 * smoothstep(0.55, 1.1, u) + 0.5 * (fbm(x, z, 6, 13, 2) - 0.5);
};

const PIECES: readonly { kind: Kind; h: Height }[] = [
  { kind: 'sand', h: beach },
  { kind: 'rock', h: bank },
  { kind: 'rock', h: headland },
  { kind: 'sand', h: isles },
  { kind: 'pillar', h: stacks },
  { kind: 'stone', h: breakwater },
  { kind: 'reef', h: reef },
];

/** The tallest piece wins at every point; every piece sinks below the sea floor away from its own shore. */
function sample(x: number, z: number): { h: number; kind: Kind } {
  let h = seaFloor(x, z);
  let kind: Kind = 'sea';
  for (const p of PIECES) {
    const v = p.h(x, z);
    if (v > h) {
      h = v;
      kind = p.kind;
    }
  }
  return { h: h * seamFade(ZONE, z, 10), kind }; // the zone's ends ease up to y = 0 and meet their neighbours flush
}

export const baseHeight: Height = (x, z) => sample(x, z).h;

/** The dock climbs out of the shore: level 0 at the zone's ends, standing half a block above the water inside. */
export const pathLevel: Height = (_x, z) => 0.5 * seamFade(ZONE, z, 8);

// ---- colours -------------------------------------------------------------------------------------------------------------

type Pair = readonly [string, string];
const pick = (p: Pair, n: number) => (n < 0.5 ? p[0] : p[1]);

/** The floor under the water, from pale shallows to deep blue. */
function seabed(h: number): string {
  if (h >= -0.75) return '#ece4c2';
  if (h >= -1.25) return '#c3e6cf';
  if (h >= -1.75) return '#86d3d2';
  if (h >= -2.25) return '#4fb4d2';
  return '#3b93c4';
}

const SAND: readonly Pair[] = [['#f7e6b8', '#f3deab'], ['#f2dca4', '#edd49a'], ['#ecd29a', '#e6c98c']];
const ROCK: readonly Pair[] = [['#b3ad9f', '#a9a395'], ['#a39c8e', '#9a9385'], ['#8f8778', '#968d7d'], ['#7d7568', '#847b6d']];
const GRASS: Pair = ['#7bbd58', '#70b14f'];
const STONE: Pair = ['#9ea3ab', '#8d929b'];
const CORAL = ['#f29a9a', '#f4b27c', '#e98cb8'];

export const topColor: TopColor = (x, z, h) => {
  const n = hash2(Math.floor(x), Math.floor(z), 5);
  if (h < -0.25) {
    if (sample(x, z).kind !== 'reef' || h < -1.75) return seabed(h);
    if (fbm(x, z, 3.5, 41, 2) > 0.74) return CORAL[Math.floor(n * 3)]; // coral grows in small clusters
    return h >= -1.25 ? '#a2e3c9' : '#7fd5c8';
  }
  const kind = seamFade(ZONE, z, 10) < 0.75 ? 'sand' : sample(x, z).kind; // the beaches at the zone's ends are sand
  if (kind === 'stone') return pick(STONE, (Math.floor(x) + Math.floor(z)) & 1 ? 0 : 1);
  if (kind === 'rock' || kind === 'pillar') {
    if (kind === 'rock' && h >= 2.5 && fbm(x, z, 6, 31, 2) > 0.42) return pick(GRASS, n); // a little green on the bank's tops
    return h >= 4.5 ? pick(ROCK[0], n) : h >= 3 ? pick(ROCK[1], n) : h >= 1.5 ? pick(ROCK[2], n) : h >= 0.25 ? pick(ROCK[3], n) : '#6c7f80';
  }
  if (h >= 1.25) return pick(SAND[0], n);
  if (h >= 0.75) return pick(SAND[1], n);
  if (h >= 0.25) return pick(SAND[2], n);
  return '#d6bc84'; // wet sand, just above the water
};
