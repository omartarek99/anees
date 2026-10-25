import { clamp, fbm, hash2, lerp, smoothstep, valueNoise } from '../math';
import { groundHeight } from '../ground';
import type { GroundSource } from '../ground';
import { ZONES } from '../layout';
import { nearestOnPath } from '../pathLine';
import type { SideColor, TopColor } from '../Terrain';

// Falcon's Peak, sculpted: a mint meadow valley between two long ridges (rock, then snow above the snow line), rolling terraced
// hills, stepped foot-slopes under the big mountains, a raised summit plateau at the far end, a stream that the road crosses on a
// flat stretch, a scree slope and a few rock pillars. All of it is the heightfield plus colour (no meshes of its own). "v" below
// is the depth into the zone (z - z0); x is across.

const FALCON_ZONE = ZONES.find((z) => z.key === 'falcon')!;
const Z0 = FALCON_ZONE.z0;
/** The zone's far end is the map's end (the ground just drops away there), so only the start has to meet its neighbour flush. */
const calm = (z: number) => smoothstep(0, 10, z - Z0);

/** Flat shelves `step` blocks apart joined by short ramps: the stepped terraces of a block world. */
function terrace(h: number, step: number, ramp = 0.4) {
  const u = h / step;
  const f = Math.floor(u);
  return (f + smoothstep(0.5 - ramp / 2, 0.5 + ramp / 2, u - f)) * step;
}

// ---- landforms ----------------------------------------------------------------------------------------------------------------

/** The foot of a big mountain: a flat crown (the mountain prop stands on it) and stepped slopes down to the meadow. */
export interface Massif {
  x: number;
  v: number;
  crown: number;
  foot: number;
  /** Height of the crown above the meadow. */
  h: number;
  /** Direction (radians, from +x towards +v) of a smooth rubble slope on this foot, if any. */
  scree?: number;
}

export const MASSIFS: readonly Massif[] = [
  { x: -16, v: 34, crown: 6.5, foot: 15, h: 5, scree: 0.25 },
  { x: 16, v: 83, crown: 6, foot: 14, h: 5, scree: Math.PI },
  { x: -23, v: 66, crown: 4.5, foot: 11, h: 4 },
  { x: 21, v: 18, crown: 5, foot: 12, h: 4 },
];

// x, v, radius, height: tall narrow pillars and low wide outcrops, all well off the road.
const ROCKS: readonly (readonly [number, number, number, number])[] = [
  [-22, 20, 2.2, 8],
  [20.5, 58, 2.2, 9],
  [-19.5, 90, 2.1, 7],
  [19, 101, 2, 7],
  [-6, 46, 3.6, 3],
  [14, 14, 3.4, 3],
  [14.5, 58, 3.2, 2.5],
  [-25, 44, 3.5, 3],
];

/** Pine groves: x, v, trees, spread. The ground under them is darker. */
export const GROVES: readonly (readonly [number, number, number, number])[] = [
  [-4.5, 12.5, 3, 2.2],
  [-16, 19, 2, 1.8],
  [-7, 41, 3, 2.6],
  [-2, 56.5, 2, 2],
  [9, 92, 3, 2.6],
  [15, 99, 3, 2.4],
  [-26, 47, 4, 3],
  [14, 6, 3, 2.4],
  [-27, 82, 3, 2.6],
];

// The stream: it springs at the foot of the right mountain, crosses the road halfway between levels 6 and 7 (the road dips to
// water level there) and ends in a pool at the foot of the left ridge.
const STREAM: readonly (readonly [number, number])[] = [
  [9, 71.5],
  [5, 68.8],
  [0.5, 65.6],
  [-4.5, 62.2],
  [-10, 59.2],
  [-15.5, 56.8],
  [-21, 55.2],
];
const WATER_HALF = 1.7;
const BANK = 1.7;
const PLAIN = 0.5; // the meadow's level beside the stream
const SNOW_LINE = 9.5;
const TABLE = 3.5; // how far the summit plateau stands above the meadow

const SEGS = (() => {
  let len = 0;
  const out = STREAM.slice(1).map(([bx, bv], i) => {
    const [ax, av] = STREAM[i];
    const l = Math.hypot(bx - ax, bv - av);
    const s = { ax, av, dx: bx - ax, dv: bv - av, l, from: len };
    len += l;
    return s;
  });
  return { out, len };
})();

interface Stream {
  /** Distance to the stream's centre line (with ragged banks). */
  d: number;
  /** Half-width of the water here: 0 away from it, tapering to nothing at the spring and the pool. */
  hw: number;
}

function stream(x: number, v: number, o: Stream) {
  let best = Infinity;
  let at = 0;
  for (const s of SEGS.out) {
    const t = clamp(((x - s.ax) * s.dx + (v - s.av) * s.dv) / (s.l * s.l), 0, 1);
    const d = Math.hypot(x - s.ax - t * s.dx, v - s.av - t * s.dv);
    if (d < best) {
      best = d;
      at = (s.from + t * s.l) / SEGS.len;
    }
  }
  o.d = best + (valueNoise(x, v, 4, 63) - 0.5) * 1.1;
  o.hw = best > 9 ? 0 : WATER_HALF * smoothstep(0, 0.14, at) * (1 - smoothstep(0.82, 1, at));
}

/** Long ridges either side of the valley, with peaks and saddles along them, in 2-block cliffs. */
function ridge(x: number, v: number, side: number) {
  const wall = smoothstep(19, 27.5, side * x);
  if (wall <= 0) return 0;
  const crest = 2 + 10 * valueNoise(v, 0, 14, 29 + side * 7) ** 1.6;
  const rough = (fbm(x, v, 14, 5, 2) - 0.5) * 2.4;
  return terrace(Math.max(0, (crest + rough) * wall), 2, 0.25);
}

function rocks(x: number, v: number) {
  let best = 0;
  for (const [rx, rv, r, h] of ROCKS) {
    if (Math.abs(x - rx) > r + 3 || Math.abs(v - rv) > r + 3) continue;
    const rr = Math.hypot(x - rx, v - rv) / r + (valueNoise(x, v, 3, 71) - 0.5) * 0.35;
    best = Math.max(best, terrace(h * (1 - smoothstep(0.45, 1, rr)), h > 5 ? 1.5 : 1, 0.3));
  }
  return best;
}

const gentle = (x: number, z: number) => Math.max(0, (fbm(x, z, 46, 8, 2) - 0.45) * 5);
const hills = (x: number, z: number) => terrace(Math.max(0, (fbm(x, z, 30, 3, 3) - 0.4) * 12), 1);

/** 1 on the summit plateau at the far end (it spans x -15 to 21 and falls away in steep steps either side). */
const tableWidth = (x: number) => 1 - smoothstep(14, 18, Math.abs(x - 3));
/** How far up the road has climbed to the summit: flat at level 9, a short stair, flat again at level 10. */
const lift = (v: number) => TABLE * smoothstep(94.5, 100, v);

interface Shape {
  h: number;
  /** Height of the rocky landforms (ridges, mountain feet, pillars) here: > 0 is rock rather than meadow. */
  rock: number;
  /** The ridges' share of `rock`: only they are high enough for snow. */
  ridge: number;
  /** 0..1: this is the smooth rubble slope of a mountain foot. */
  scree: number;
  water: Stream;
}

function shape(x: number, z: number, o: Shape) {
  const v = z - Z0;
  const gate = smoothstep(7, 13, nearestOnPath(x, z).d); // rock never rises beside the road or a level pad
  const table = smoothstep(90, 97, v) * tableWidth(x);

  let mass = 0;
  let crown = 0;
  o.scree = 0;
  for (const m of MASSIFS) {
    const dx = x - m.x;
    const dv = v - m.v;
    if (Math.abs(dx) > m.foot + 3 || Math.abs(dv) > m.foot + 3) continue;
    const r = Math.hypot(dx, dv) + (valueNoise(x, v, 6, 11) - 0.5) * 3;
    const t = smoothstep(m.crown, m.foot, r);
    // a mountain foot is stepped; its rubble slope is smooth (many small ledges)
    const slope = m.scree === undefined ? 0 : smoothstep(0.55, 1, Math.cos(Math.atan2(dv, dx) - m.scree)) * smoothstep(0.1, 0.4, t) * (1 - smoothstep(0.85, 1, t));
    const raw = m.h * (1 - t);
    mass = Math.max(mass, lerp(terrace(raw, 1.25, 0.35), raw, slope));
    crown = Math.max(crown, 1 - smoothstep(m.crown * 0.8, m.foot * 0.9, r));
    o.scree = Math.max(o.scree, slope);
  }

  const wide = 1 + 0.5 * smoothstep(12, 22, Math.abs(x)); // the hills roll higher towards the sides
  const land = lerp(gentle(x, z), hills(x, z) * wide, smoothstep(4.5, 11, nearestOnPath(x, z).d) * (1 - table));
  o.ridge = (ridge(x, v, -1) + ridge(x, v, 1)) * (1 - crown) * gate;
  o.rock = o.ridge + (mass + rocks(x, v)) * gate;
  let h = land * (1 - crown * gate) + o.rock + lift(v) * tableWidth(x);

  stream(x, v, o.water);
  const { d, hw } = o.water;
  if (hw > 0) {
    h = lerp(h, PLAIN, 1 - smoothstep(hw + 1.5, hw + 6.5, d)); // a flat flood plain...
    h -= 1.5 * (1 - smoothstep(hw * 0.6, hw + BANK, d)); // ...with the channel cut into it
  }
  o.h = h * calm(z);
}

const scratch: Shape = { h: 0, rock: 0, ridge: 0, scree: 0, water: { d: 0, hw: 0 } };
const probe: Stream = { d: 0, hw: 0 };

export const falconGround: GroundSource = {
  baseHeight(x, z) {
    shape(x, z, scratch);
    return scratch.h;
  },
  // The road follows only the gentle swell, so it never climbs a staircase; it dips to water level where it crosses the stream.
  pathLevel(x, z) {
    const v = z - Z0;
    stream(x, v, probe);
    const cross = probe.hw > 0 ? 1 - smoothstep(probe.hw + 0.3, probe.hw + 2.3, probe.d) : 0;
    return lerp((gentle(x, z) + lift(v)) * calm(z), -1, cross);
  },
};

// ---- colour -------------------------------------------------------------------------------------------------------------------

// Per-column facts, computed once (the top colour and every side face of a column ask for them).
interface Col {
  y: number;
  rock: number;
  ridge: number;
  scree: number;
  /** Distance past the water's edge (< 0 in the water, < BANK on the bank); large away from the stream. */
  wet: number;
  forest: boolean;
}
const cols = new Map<number, Col>();
const colScratch: Shape = { h: 0, rock: 0, ridge: 0, scree: 0, water: { d: 0, hw: 0 } };

function colAt(x: number, z: number): Col {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const key = ix * 4096 + iz;
  let c = cols.get(key);
  if (!c) {
    const cx = ix + 0.5;
    const cz = iz + 0.5;
    shape(cx, cz, colScratch);
    const v = cz - Z0;
    const ragged = 0.75 + 0.5 * valueNoise(cx, cz, 3, 83);
    c = {
      y: groundHeight(cx, cz),
      rock: colScratch.rock - (valueNoise(cx, cz, 5, 55) - 0.5) * 1.6,
      ridge: colScratch.ridge,
      scree: colScratch.scree,
      wet: colScratch.water.hw > 0 ? colScratch.water.d - colScratch.water.hw : 99,
      forest: GROVES.some(([gx, gv, n, spread]) => n > 2 && Math.hypot(cx - gx, v - gv) < (spread + 2.6) * ragged),
    };
    cols.set(key, c);
  }
  return c;
}

/** Dry meadow: no rock, water or bank. Pines and boulders stand only here. */
export const isMeadow = (x: number, z: number) => {
  const c = colAt(x, z);
  return c.rock < 0.6 && c.wet > BANK + 0.5;
};

const GRASS = [
  ['#8bd8b2', '#84d1ab', '#92ddb8'],
  ['#97e0bc', '#90dab5', '#a0e5c3'],
  ['#b0eccf', '#a8e8c9', '#bcf1d6'],
] as const;
const DOT = '#cdf4e0';
const FOREST = ['#66bb8e', '#5eb386', '#6fc297'] as const;
const EARTH = ['#79b595', '#6ca88a', '#5f9a7e'] as const;
const ROCK = ['#9a9a8c', '#8e8e80', '#a3a395'] as const;
const STRATA = ['#8f8b7b', '#7f7b6c', '#9b9682', '#6f6b5e'] as const;
const SCREE = ['#a8957e', '#b3a28b', '#98866f', '#bdae98'] as const;
const SNOW = ['#fbfdff', '#f3f8fc', '#eaf2f8'] as const;
const SNOW_SIDE = ['#dfe9f2', '#d1dfec'] as const;
const WATER = ['#78cfe6', '#84d7ec', '#6cc7e0'] as const;
const SAND = ['#f2eac8', '#ebe2bd', '#f7f0d4'] as const;
const SAND_SIDE = '#d6cca0';

const shades = new Map<string, string>();
function shade(hex: string, k: number) {
  const key = `${hex}${k}`;
  let s = shades.get(key);
  if (!s) {
    const n = parseInt(hex.slice(1), 16);
    const ch = (v: number) => Math.round(Math.min(255, v * k)).toString(16).padStart(2, '0');
    s = `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
    shades.set(key, s);
  }
  return s;
}

const isFlat = (x: number, z: number, y: number) => [colAt(x + 1, z), colAt(x - 1, z), colAt(x, z + 1), colAt(x, z - 1)].every((n) => Math.abs(n.y - y) <= 0.5);

export const falconTop: TopColor = (x, z, y) => {
  const c = colAt(x, z);
  const r = hash2(Math.floor(x), Math.floor(z), 5);
  if (c.wet < 0) return WATER[Math.floor(r * WATER.length)];
  if (c.wet < BANK && c.rock < 1) return SAND[Math.floor(r * SAND.length)];
  if (c.rock > 1.2) {
    if (c.ridge > 3 && y >= SNOW_LINE + (valueNoise(x, z, 4, 77) - 0.5) * 3) return SNOW[Math.floor(r * SNOW.length)];
    if (c.scree > 0.35) return SCREE[Math.floor(r * SCREE.length)];
    if (y < 5.5 && r > 0.4 && isFlat(x, z, y)) return GRASS[1][Math.floor(r * 3)]; // grassy ledges on the low shelves
    return ROCK[(Math.floor(y / 2) + (r < 0.12 ? 1 : 0)) % ROCK.length]; // bands by height, a few flecks
  }
  if (hash2(Math.floor(x), Math.floor(z), 19) < 0.022) return DOT; // the artwork's tiny lighter dots
  if (c.forest) return FOREST[Math.floor(r * 3)];
  return GRASS[y < 1.5 ? 0 : y < 3 ? 1 : 2][Math.floor(r * 3)]; // lighter towards the crests
};

export const falconSide: SideColor = (x, z, depth, topHex) => {
  const c = colAt(x, z);
  if (c.wet < BANK && c.rock < 1) return SAND_SIDE;
  if (c.rock > 1.2) {
    if (c.ridge > 3 && c.y >= SNOW_LINE) return SNOW_SIDE[depth < 0.5 ? 0 : 1];
    return STRATA[(((Math.floor((c.y - depth) / 1.2) + (hash2(Math.floor(x), Math.floor(z), 3) < 0.25 ? 1 : 0)) % 4) + 4) % 4];
  }
  return depth < 0.5 ? shade(topHex, 0.84) : EARTH[Math.min(2, Math.floor(depth))];
};
