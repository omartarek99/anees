import { groundHeight } from './ground';
import { mulberry32 } from './math';
import { nearestOnPath } from './pathLine';
import type { Spot } from './voxel';
import type { MapZone } from './schema';

// Where scenery goes. Deterministic (seeded), keeps clear of the road and of each other, and stands each item on the
// terrain. A zone module calls this once and feeds the result to <Baked/> (or maps it to <Voxel/>s).

/** A spot standing on the terrain at (x, z), turned `ry` radians about the vertical and scaled by `s`. */
export const spotAt = (x: number, z: number, ry = 0, s = 1): Spot => ({ x, y: groundHeight(x, z), z, ry, s });

export interface ScatterOptions {
  count: number;
  seed: number;
  /** Stay at least this far from the road's centre line (default 5: past the corridor and the road's rim). */
  minPath?: number;
  /** ...and no farther than this (default: anywhere). */
  maxPath?: number;
  /** Minimum distance between two items (default 3). */
  gap?: number;
  /** Lateral limits; default is the playable strip plus its ground margin. */
  xMin?: number;
  xMax?: number;
  /** Keep this many blocks off the zone's z edges (default 2). */
  zMargin?: number;
  /** Extra veto: return false to reject a position. */
  accept?: (x: number, z: number, y: number) => boolean;
}

export interface Placed extends Spot {
  /** A random 0..1 for the caller's own variation (a colour pick, a size). */
  r: number;
}

export function scatter(zone: MapZone, o: ScatterOptions): Placed[] {
  const rand = mulberry32(o.seed + zone.index * 7919);
  const minPath = o.minPath ?? 5;
  const gap = o.gap ?? 3;
  const xMin = o.xMin ?? zone.x0 - 10;
  const xMax = o.xMax ?? zone.x1 + 10;
  const zMargin = o.zMargin ?? 2;
  const out: Placed[] = [];
  for (let tries = 0; tries < o.count * 60 && out.length < o.count; tries++) {
    const x = xMin + rand() * (xMax - xMin);
    const z = zone.z0 + zMargin + rand() * (zone.z1 - zone.z0 - zMargin * 2);
    const d = nearestOnPath(x, z).d;
    if (d < minPath || (o.maxPath !== undefined && d > o.maxPath)) continue;
    if (out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < gap * gap)) continue;
    const y = groundHeight(x, z);
    if (o.accept && !o.accept(x, z, y)) continue;
    out.push({ x, y, z, ry: rand() * Math.PI * 2, s: 1, r: rand() });
  }
  return out;
}
