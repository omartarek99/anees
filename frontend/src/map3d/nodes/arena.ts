import type { NodeState, ZoneKey } from '../schema';
import { box, defineModel } from '../voxel';
import type { Box, VoxelModel } from '../voxel';
import { GOLD, look, modelFor, padlock, plaque, shade, slab } from './kit';

// The boss arena: a stone gate (two pillars, a lintel with a crest, two banners) standing at the back of a tiered round
// platform whose ring is the zone's accent colour. What the doorway holds says the state:
//   locked    dark, crossed by two chains, with a big padlock;
//   unlocked  a glowing red-orange portal (PORTAL, the one part that moves: it breathes slowly);
//   completed green light in the doorway and a gold trophy on the platform.
// The number sits on a small plaque at the front. A far arena is the platform and a bare gate in one cheap solid mesh.

const Y0 = 1.25; // top of the platform (three steps: 0.6, 0.35, 0.3)
const GZ = -1.5; // the gate stands towards the back, facing the camera
const DOOR_H = 5.1;

interface Colors {
  base: string;
  top: string;
  top2: string;
  accent: string;
  /** The platform's middle ring and the gate's trim. */
  ring: string;
  door: string;
}

function colors(zone: ZoneKey, state: NodeState): Colors {
  const done = state === 'completed';
  const l = look(zone, done ? 'unlocked' : state); // a beaten arena keeps its stone: only the light and the trim turn green and gold
  const k = state === 'locked' ? 0.8 : 1;
  return {
    base: shade(l.base, k),
    top: done ? '#5cc98a' : shade(l.top, k),
    top2: shade(l.top2, k),
    accent: l.accent,
    ring: done ? GOLD : l.accent,
    door: state === 'locked' ? '#14111a' : done ? '#12301f' : '#3a0f0a',
  };
}

const platform = (c: Colors, cell: number): Box[] => [
  ...slab(4.5, cell, 0, 0.6, c.base),
  ...slab(3.9, cell, 0.6, 0.35, c.ring),
  ...slab(3.3, cell, 0.95, 0.3, (row) => (row & 1 ? c.top2 : c.top)),
];

/** The doorway's light: an arch with a bright core, centred on (cx, cy, cz). Unlit. */
const portal = (outer: string, core: string, cx: number, cy: number, cz: number): Box[] => [
  box(cx, cy - 2.4, cz, 3, 4, 0.2, outer, true),
  box(cx, cy + 1.6, cz, 2.2, 0.5, 0.2, outer, true),
  box(cx, cy + 2.1, cz, 1.2, 0.3, 0.2, outer, true),
  box(cx, cy - 2, cz + 0.12, 1.6, 3, 0.12, core, true),
  box(cx, cy + 1, cz + 0.12, 0.8, 0.5, 0.12, core, true),
];

const PORTAL_Y = Y0 + 2.4;
export const PORTAL_POS = [0, PORTAL_Y, GZ + 0.25] as const;
/** The unlocked arena's burning doorway, drawn around its own centre so it can breathe. */
export const PORTAL = defineModel(() => portal('#ff4a1c', '#ffe27a', 0, 0, 0), 0);

const trophy = (y: number, z: number): Box[] => [
  box(0, y, z, 1.6, 0.4, 1.6, '#8d8a94'),
  box(0, y + 0.4, z, 0.5, 0.8, 0.5, '#b8860b'),
  box(0, y + 1.2, z, 1.6, 0.5, 1.2, '#f0b92a'),
  box(0, y + 1.7, z, 2, 0.8, 1.4, '#f0b92a'),
  box(0, y + 2.5, z, 2, 0.3, 1.4, '#ffe27a'),
  box(-1.2, y + 1.9, z, 0.4, 0.8, 0.4, '#f0b92a'),
  box(1.2, y + 1.9, z, 0.4, 0.8, 0.4, '#f0b92a'),
];

function gate(c: Colors, state: NodeState): Box[] {
  const locked = state === 'locked';
  const done = state === 'completed';
  const cloth = done ? '#3fae6e' : c.accent;
  const stripe = done ? GOLD : locked ? c.top : '#f4e6b8';
  const out: Box[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * 2.3;
    out.push(box(x, Y0, GZ, 1.7, 0.7, 1.7, c.base), box(x, Y0 + 0.7, GZ, 1.2, 3.9, 1.2, c.top2), box(x, Y0 + 4.6, GZ, 1.7, 0.5, 1.7, c.top));
    out.push(box(x, Y0 + 1.6, GZ + 1, 1, 2.9, 0.15, cloth), box(x, Y0 + 4.2, GZ + 1.07, 1, 0.3, 0.1, stripe)); // banner
  }
  out.push(box(0, Y0 + 5.1, GZ, 6.3, 1, 1.5, c.top2), box(0, Y0 + 6.1, GZ, 6.7, 0.35, 1.7, c.ring));
  out.push(box(0, Y0 + 6.45, GZ, 2.4, 0.5, 1, c.ring), box(0, Y0 + 6.95, GZ, 1.4, 0.5, 1, c.ring)); // crest
  out.push(box(0, Y0 + 7.45, GZ, 0.5, 0.5, 0.5, locked ? '#4a4048' : done ? '#7dffb0' : '#ff5a2a', done));

  out.push(box(0, Y0, GZ, 3.4, DOOR_H, 0.3, c.door));
  if (locked) {
    for (const y of [1.9, 3.7]) {
      for (let i = 0; i < 5; i++) out.push(box((i - 2) * 0.68, Y0 + y, GZ + 0.5, 0.68, 0.5, 0.5, i & 1 ? '#6a6a76' : '#3d3d46')); // two chains across the doorway
    }
    out.push(...padlock(Y0 + 0.5, GZ + 0.55, 1.1, '#a98736', '#7d7b88'));
  }
  if (done) out.push(...portal('#4fd98a', '#d8ffe8', 0, PORTAL_Y, GZ + 0.25), ...trophy(Y0, 0.6));
  return out;
}

function arenaBoxes(zone: ZoneKey, state: NodeState, id: number): Box[] {
  const c = colors(zone, state);
  const face = state === 'locked' ? '#a8a4b4' : state === 'completed' ? '#ffffff' : '#fff4b8';
  const plate = state === 'locked' ? '#2a2a32' : state === 'completed' ? '#17543a' : '#5a2a0e';
  return [...platform(c, 0.5), ...gate(c, state), ...plaque(id, 0.25, Y0, 2.7, face, plate)];
}

export const arenaModel = (zone: ZoneKey, state: NodeState, id: number): VoxelModel => modelFor(`arena|${zone}|${state}|${id}`, () => arenaBoxes(zone, state, id));

/** What an arena far from the camera draws: the platform and a bare gate, whose doorway still shows the state. */
export const farArenaModel = (zone: ZoneKey, state: NodeState): VoxelModel =>
  modelFor(`arena|far|${zone}|${state}`, () => {
    const c = colors(zone, state);
    const door = state === 'locked' ? c.door : state === 'completed' ? '#4fd98a' : '#ff5a1e';
    return [
      ...platform(c, 1),
      box(-2.3, Y0, GZ, 1.7, DOOR_H, 1.7, c.top2),
      box(2.3, Y0, GZ, 1.7, DOOR_H, 1.7, c.top2),
      box(0, Y0 + DOOR_H, GZ, 6.3, 1, 1.5, c.top2),
      box(0, Y0, GZ, 3.4, DOOR_H, 0.3, door),
    ];
  });
