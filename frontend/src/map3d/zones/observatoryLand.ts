import { clamp, hash2, valueNoise } from '../math';
import { groundHeight, seamFade } from '../ground';
import { ZONES } from '../layout';
import { nearestOnPath } from '../pathLine';
import type { MapZone } from '../schema';
import type { Spot } from '../voxel';

// The Sky Observatory's night plain: a deep indigo felt with a gentle swell and the artwork's dot grid. Calm on purpose
// (no craters, no rises): a flat plain keeps the terrain mesh small and lets the landmarks in the sky do the talking.

const OBS: MapZone = ZONES.find((z) => z.key === 'observatory')!;

/** One broad, slow swell (a block or so): few terrace edges, so the terrain mesh stays small. The road follows it. */
export function baseHeight(x: number, z: number): number {
  return (valueNoise(x, z, 44, 31) - 0.5) * 3 * seamFade(OBS, z);
}

// The artwork's dots: a staggered lattice, one every 6 blocks. Cells are (ix, iz) with iz counted from the zone's start.
const cellKey = (ix: number, iz: number) => iz * 128 + ix + 64;
const DOTS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = [];
  for (let row = 0, iz = 3; iz < OBS.z1 - OBS.z0; iz += 6, row++) for (let ix = -30 + (row & 1) * 3; ix <= 30; ix += 6) out.push([ix, iz]);
  return out;
})();
const DOT_CELLS = new Set(DOTS.map(([ix, iz]) => cellKey(ix, iz)));

type RGB = readonly [number, number, number];
const rgb = (hex: string): RGB => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const LOW = rgb('#443495');
const HIGH = rgb('#6a58c4');
const DOT = '#8a7ada';

/** Felt that brightens a little with height and patchy noise (in eighths: a small palette), and a lighter tile on each lattice point. */
export function topColor(x: number, z: number, h: number): string {
  if (DOT_CELLS.has(cellKey(Math.floor(x), Math.floor(z - OBS.z0)))) return DOT;
  const t = Math.round(clamp(0.1 + valueNoise(x, z, 14, 5) * 0.35 + h * 0.1, 0, 1) * 8) / 8;
  return `#${[0, 1, 2].map((i) => Math.round(LOW[i] + (HIGH[i] - LOW[i]) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** About forty of the lattice points carry a little glowing stud (the artwork's dots), clear of the road. */
export function studSpots(): Spot[] {
  const out: Spot[] = [];
  for (const [ix, iz] of DOTS) {
    const x = ix + 0.5;
    const z = OBS.z0 + iz + 0.5;
    if (hash2(ix, iz, 3) > 0.3 || nearestOnPath(x, z).d < 4.5) continue;
    out.push({ x, y: groundHeight(x, z), z });
  }
  return out;
}
