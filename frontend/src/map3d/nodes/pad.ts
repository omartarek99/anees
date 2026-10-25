import type { NodeState, ZoneKey } from '../schema';
import { box, defineModel } from '../voxel';
import type { Box, VoxelModel } from '../voxel';
import { look, modelFor, padlock, pixels, plaque, slab } from './kit';

// The level pad: a round plinth (a cog in the observatory and on the falcon mountain) in the zone's own colours, three steps
// high. What stands on it says the state:
//   locked    a padlock;
//   unlocked  the level number, and a bobbing gold star floating over it (BEACON, the only part that moves);
//   completed the level number with the earned stars above it (a check mark when there are none).
// Everything that does not move is one merged model per (zone, state, number, stars). A far pad is the plinth alone, coarser.

/** Height of the top step: where the number plate and the padlock stand. */
const TOP = 1.25;
const PLATE_H = 1.86; // the number plate: 5 rows of 0.3 plus its margins

/** Where the beacon floats: just above the number plate. */
export const BEACON_Y = TOP + PLATE_H + 0.6;

const COGS: ReadonlySet<ZoneKey> = new Set(['observatory', 'falcon']);

// a cog's teeth: four on the axes, four on the diagonals (x, z, size)
const TEETH: readonly (readonly [number, number, number])[] = [
  [2.6, 0, 0.9], [-2.6, 0, 0.9], [0, 2.6, 0.9], [0, -2.6, 0.9],
  [1.85, 1.85, 0.8], [-1.85, 1.85, 0.8], [1.85, -1.85, 0.8], [-1.85, -1.85, 0.8],
];

/** The plinth: foot, rim ring and top. `cell` is the block size of the round steps (0.5 up close, 1 for a far pad). */
function plinth(zone: ZoneKey, state: NodeState, cell: number): Box[] {
  const l = look(zone, state);
  const cog = COGS.has(zone);
  const out = slab(cog ? 2.4 : 2.7, cell, 0, 0.6, l.base);
  if (cog) for (const [x, z, s] of TEETH) out.push(box(x, 0, z, s, 0.6, s, l.base));
  out.push(...slab(cog ? 2.15 : 2.4, cell, 0.6, 0.35, l.rim));
  out.push(...slab(cog ? 1.7 : 1.8, cell, 0.95, 0.3, (row) => (row & 1 ? l.top2 : l.top)));
  return out;
}

const STAR = ['..#..', '#####', '.###.', '.#.#.'];
const CHECK = ['.....##', '....##.', '##.##..', '.###...', '..#....'];
const BEACON_STAR = ['...#...', '..#+#..', '###+###', '.#+++#.', '.##.##.', '.#...#.'];

/** Three small stars, the first `earned` lit gold and the rest dim; a green check mark when none is earned. */
function stars(earned: number, y: number): Box[] {
  if (earned < 1) return pixels(CHECK, 0.3, 0, y, 0, 0.3, { '#': '#8dffb8' }, true);
  const out: Box[] = [];
  for (let i = 0; i < 3; i++) {
    const lit = i < earned;
    out.push(...pixels(STAR, 0.24, (i - 1) * 1.5, y + (i === 1 ? 0.3 : 0), 0, 0.24, { '#': lit ? '#ffc72a' : '#6f6a7c' }, lit));
  }
  return out;
}

function padBoxes(zone: ZoneKey, state: NodeState, id: number, earned: number): Box[] {
  const out = plinth(zone, state, 0.5);
  if (state === 'locked') return out.concat(padlock(TOP, 0, 0.85, '#b9923a', '#8c8a98'));
  const done = state === 'completed';
  out.push(...plaque(id, 0.3, TOP, 0, done ? '#ffffff' : '#fff4b8', done ? '#17543a' : '#5a3410'));
  return done ? out.concat(stars(earned, TOP + PLATE_H + 0.35)) : out;
}

/** The pad with everything that stays still on it. Locked pads are all alike; only completed ones show their stars. */
export function padModel(zone: ZoneKey, state: NodeState, id: number, starCount: number): VoxelModel {
  const earned = state === 'completed' ? Math.max(0, Math.min(3, Math.round(starCount))) : 0;
  return modelFor(`pad|${zone}|${state}|${state === 'locked' ? 0 : id}|${earned}`, () => padBoxes(zone, state, id, earned));
}

/** What a node far from the camera draws: the plinth alone, in one cheap solid mesh. */
export const farPadModel = (zone: ZoneKey, state: NodeState): VoxelModel => modelFor(`pad|far|${zone}|${state}`, () => plinth(zone, state, 1));

/** The playable level's beacon: a gold star with a dark outline, unlit so it shines. Bottom middle at the origin. */
export const BEACON = defineModel(() => pixels(BEACON_STAR, 0.5, 0, 0, 0, 0.4, { '#': '#ffc72a', '+': '#fff2a0' }, true, '#8a4b10'), 0);
