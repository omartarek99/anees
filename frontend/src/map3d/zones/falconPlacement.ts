import { groundHeight } from '../ground';
import { mulberry32 } from '../math';
import { distToNode, nearestOnPath } from '../pathLine';
import { scatter } from '../placement';
import type { MapZone } from '../schema';
import type { Placement, Spot } from '../voxel';
import { BOULDERS, CAIRN, FOOTHILLS, MOUNTAINS, PINE } from './falconParts';
import { GROVES, isMeadow, MASSIFS } from './falconTerrain';

// Where Falcon's Peak's static scenery stands. Seeded, so it is the same on every device; everything keeps off the road and the
// level pads and stands on the terrain. Call it once the zones are registered (it reads ground heights).

export interface FalconLayout {
  /** Everything that does not move: one Baked. */
  parts: Placement[];
  /** The flag pole (the cloth waves on it). */
  flag: Spot;
}

const TAU = Math.PI * 2;

export function buildLayout(zone: MapZone): FalconLayout {
  const rand = mulberry32(9051);
  const z0 = zone.z0;
  const at = (x: number, v: number, ry = 0, s = 1): Spot => ({ x, y: groundHeight(x, z0 + v), z: z0 + v, ry, s });

  // the big mountains stand on the flat crowns the terrain leaves for them
  const mountains = MASSIFS.map((m, i): Placement => ({ model: MOUNTAINS[i], items: [at(m.x, m.v)] }));
  const foothills: Placement = { model: FOOTHILLS, items: [at(3, 8)] };

  // pines in groves (the terrain darkens the ground under them)
  const pines: Spot[] = [];
  const free = (x: number, z: number) => x > -29 && x < 29 && nearestOnPath(x, z).d >= 5.5 && distToNode(x, z) >= 7.5 && isMeadow(x, z);
  for (const [gx, gv, n, spread] of GROVES) {
    for (let k = 0, tries = 0; k < n && tries < n * 14; tries++) {
      const a = rand() * TAU;
      const r = 0.8 + rand() * spread;
      const x = gx + Math.cos(a) * r;
      const z = z0 + gv + Math.sin(a) * r;
      if (!free(x, z) || pines.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 9)) continue;
      pines.push({ x, y: groundHeight(x, z) - 0.2, z, ry: rand() * TAU, s: 0.62 + rand() * 0.34 });
      k++;
    }
  }

  // a few boulders on the meadow
  const rocks = scatter(zone, { count: 7, seed: 61, minPath: 6.5, gap: 11, accept: (x, z) => isMeadow(x, z) && distToNode(x, z) >= 7.5 });
  const boulders = (big: boolean) => rocks.filter((p) => p.r < 0.45 === big).map((p): Spot => ({ x: p.x, y: p.y - 0.3, z: p.z, ry: p.ry, s: 0.8 + p.r * 0.6 }));

  // the flag and its cairn near the end of the zone, on the summit plateau
  const flag = at(11.5, 99);

  return {
    parts: [
      ...mountains,
      foothills,
      { model: PINE, items: pines },
      { model: BOULDERS[0], items: boulders(true) },
      { model: BOULDERS[1], items: boulders(false) },
      { model: CAIRN, items: [flag] },
    ],
    flag,
  };
}
