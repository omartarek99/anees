import * as THREE from 'three';
import { NODE_COUNT, nodeXZ, zoneAtZ } from './layout';
import type { ZoneKey } from './schema';

// The route the player walks: a smooth curve through the 50 nodes (the old artwork's winding road), sampled every half
// block. Static: it depends only on the layout, never on progress. The terrain carves a corridor along it, the path
// ribbon is laid on it, and scenery uses it to stay clear of the road.

export interface PathPoint {
  x: number;
  z: number;
  /** Unit tangent in the ground plane (the direction of travel, towards the next level). */
  tx: number;
  tz: number;
  /** The connection this point is on: from level `from` to level `from + 1`. */
  from: number;
  zone: ZoneKey;
}

const PATH_STEP = 0.5;

export const PATH_POINTS: readonly PathPoint[] = (() => {
  const curve = new THREE.CatmullRomCurve3(
    Array.from({ length: NODE_COUNT }, (_, i) => {
      const { x, z } = nodeXZ(i + 1);
      return new THREE.Vector3(x, 0, z);
    }),
    false,
    'centripetal'
  );
  const out: PathPoint[] = [];
  const span = 1 / (NODE_COUNT - 1);
  const tan = new THREE.Vector3();
  for (let k = 0; k < NODE_COUNT - 1; k++) {
    const a = nodeXZ(k + 1);
    const b = nodeXZ(k + 2);
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / PATH_STEP));
    const last = k === NODE_COUNT - 2;
    for (let i = 0; i < (last ? n + 1 : n); i++) {
      const t = (k + i / n) * span;
      const p = curve.getPoint(t);
      curve.getTangent(t, tan);
      const len = Math.hypot(tan.x, tan.z) || 1;
      out.push({ x: p.x, z: p.z, tx: tan.x / len, tz: tan.z / len, from: k + 1, zone: zoneAtZ(p.z).key });
    }
  }
  return out;
})();

const BUCKET = 6;
const buckets = new Map<number, PathPoint[]>();
for (const p of PATH_POINTS) {
  const b = Math.floor(p.z / BUCKET);
  const list = buckets.get(b);
  if (list) list.push(p);
  else buckets.set(b, [p]);
}

export interface PathHit {
  /** Distance from (x, z) to the nearest point of the route; Infinity when it is far from the road. */
  d: number;
  point: PathPoint | null;
}

const REACH = 3; // buckets either side: 18 blocks

/** The nearest point of the route to a ground position. */
export function nearestOnPath(x: number, z: number): PathHit {
  const b0 = Math.floor(z / BUCKET);
  let best = Infinity;
  let hit: PathPoint | null = null;
  for (let b = b0 - REACH; b <= b0 + REACH; b++) {
    const list = buckets.get(b);
    if (!list) continue;
    for (const p of list) {
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < best) {
        best = d;
        hit = p;
      }
    }
  }
  return { d: Math.sqrt(best), point: hit };
}

/** The distance to the nearest level pad centre. */
export function distToNode(x: number, z: number): number {
  const zone = zoneAtZ(z);
  let best = Infinity;
  for (const id of zone.nodeIds) {
    const n = nodeXZ(id);
    best = Math.min(best, Math.hypot(n.x - x, n.z - z));
  }
  return best;
}
