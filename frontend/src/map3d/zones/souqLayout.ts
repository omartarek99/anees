import { ZONES } from '../layout';
import { nearestOnPath, PATH_POINTS } from '../pathLine';
import { spotAt as at } from '../placement';
import type { Placement, Spot } from '../voxel';
import { GATE, LANTERN, PALM, POOL, POT, RUG_BLUE, RUG_RED, STALL_BLUE, STALL_RED } from './souqModels';

// Where the Souq's landmarks stand. The plaza is flat, so everything sits on y = 0; the spots are hand-placed in world space
// (x across, z along the road, which runs from z 107 to 212) at least 3.5 blocks off the road and well clear of the level pads.
// The camera looks along -z, so a tall prop hides the ground up to ~9 blocks behind it: none stands right in front of a pad.

const ZONE = ZONES.find((z) => z.key === 'souq')!;

/** A spot whose front (+z) looks at the nearest bit of road. */
function facing(x: number, z: number): Spot {
  const p = nearestOnPath(x, z).point;
  return at(x, z, p ? Math.atan2(p.x - x, p.z - z) : 0);
}

const gate = PATH_POINTS.find((p) => p.zone === ZONE.key && p.z >= ZONE.z0 + 3)!;

const LANTERNS = [[-1.5, 113.5], [-5, 138], [5, 149.5], [15.5, 172], [-1, 183], [-1, 199]].map(([x, z]) => at(x, z));

export const SOUQ_PARTS: readonly Placement[] = [
  { model: GATE, items: [at(gate.x, gate.z, Math.atan2(gate.tx, gate.tz))] },
  { model: STALL_RED, items: [facing(11.5, 119.5), facing(15.5, 160)] },
  { model: STALL_BLUE, items: [facing(-3, 140.5), facing(3, 169.5)] },
  { model: LANTERN, items: LANTERNS },
  { model: POOL, items: LANTERNS },
  { model: POT, items: [at(-0.5, 127.5, 0.4), at(1.4, 129, 1.3, 0.6), at(5.5, 178.2, 2.2), at(12.5, 199.5, 0.8), at(14.2, 198, 2.5, 0.6)] },
  { model: PALM, items: [at(-17, 141, Math.PI), at(-13, 194, 0.4)] },
  { model: RUG_RED, items: [at(8.5, 136), at(5.5, 204)] },
  { model: RUG_BLUE, items: [at(-8, 168, Math.PI / 2)] },
];
