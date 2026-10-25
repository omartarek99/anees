import type { ApiLevel, MapConnection, MapNode, MapWorld, MapZone, NodeState, PathStyle, ZoneKey } from './schema';

// The adventure map's static layout: the five zones of the original artwork laid end to end along z, with every node at
// the spot the artwork's padlock circle used to be. The fractions below are the old page's hand-mapped positions
// (0..1 of each artwork's own width and height), so the topology and the landmarks' order are exactly the 2D map's.

/** Blocks across the playable strip. */
export const MAP_WIDTH = 36;

type ZoneArt = {
  key: ZoneKey;
  nameKey: MapZone['nameKey'];
  /** The old artwork: still used by the 2D fallback map (Map2D.tsx). */
  src: string;
  /** The artwork's height / width. */
  aspect: number;
  /** The ten nodes' positions inside the artwork, in level order. */
  fractions: readonly { x: number; y: number }[];
  path: PathStyle;
};

export const ZONE_ART: readonly ZoneArt[] = [
  {
    key: 'desert',
    nameKey: 'map.zoneDesert',
    src: '/images/desert-map.jpg',
    aspect: 3510 / 1184,
    fractions: [
      { x: 0.5007, y: 0.049 },
      { x: 0.7748, y: 0.154 },
      { x: 0.837, y: 0.2565 },
      { x: 0.6474, y: 0.3535 },
      { x: 0.3556, y: 0.4525 },
      { x: 0.1807, y: 0.5525 },
      { x: 0.2474, y: 0.649 },
      { x: 0.5037, y: 0.7525 },
      { x: 0.7644, y: 0.854 },
      { x: 0.8222, y: 0.954 },
    ],
    // Pebbles set in sand.
    path: { tiles: ['#b9a98f', '#a89678', '#c8b99f', '#b0a086'], edge: '#8c7557', glow: '#ffd98a', thickness: 0.45, width: 3, pillars: false },
  },
  {
    key: 'souq',
    nameKey: 'map.zoneSouq',
    src: '/images/souq-map.jpg',
    aspect: 3532 / 1216,
    fractions: [
      { x: 0.625, y: 0.0648 },
      { x: 0.3456, y: 0.1646 },
      { x: 0.1882, y: 0.2658 },
      { x: 0.2618, y: 0.3671 },
      { x: 0.5191, y: 0.4633 },
      { x: 0.7691, y: 0.5595 },
      { x: 0.8088, y: 0.6633 },
      { x: 0.625, y: 0.762 },
      { x: 0.3485, y: 0.8633 },
      { x: 0.1735, y: 0.9661 },
    ],
    // A red carpet with a stitched pattern.
    path: { tiles: ['#b5332c', '#b5332c', '#eba88f', '#b5332c'], edge: '#8a2420', glow: '#ffb48a', thickness: 0.3, width: 3, pillars: false },
  },
  {
    key: 'corniche',
    nameKey: 'map.zoneCorniche',
    src: '/images/corniche-map.jpg',
    aspect: 3486 / 1184,
    fractions: [
      { x: 0.2529, y: 0.0474 },
      { x: 0.5176, y: 0.1548 },
      { x: 0.7838, y: 0.2582 },
      { x: 0.8309, y: 0.3586 },
      { x: 0.6353, y: 0.452 },
      { x: 0.3529, y: 0.552 },
      { x: 0.1765, y: 0.6484 },
      { x: 0.2618, y: 0.7492 },
      { x: 0.5265, y: 0.8516 },
      { x: 0.8059, y: 0.953 },
    ],
    // A dock of blue planks over the water.
    path: { tiles: ['#3f64b8', '#3f64b8', '#9bb9ff', '#3f64b8'], edge: '#2b4a91', glow: '#bcd4ff', thickness: 0.4, width: 3, pillars: true },
  },
  {
    key: 'observatory',
    nameKey: 'map.zoneObservatory',
    src: '/images/observatory-map.jpg',
    aspect: 3486 / 1184,
    fractions: [
      { x: 0.8191, y: 0.0474 },
      { x: 0.6221, y: 0.1538 },
      { x: 0.3265, y: 0.2582 },
      { x: 0.1647, y: 0.3631 },
      { x: 0.2529, y: 0.4535 },
      { x: 0.5265, y: 0.552 },
      { x: 0.7897, y: 0.6494 },
      { x: 0.8191, y: 0.7492 },
      { x: 0.625, y: 0.8516 },
      { x: 0.3265, y: 0.9581 },
    ],
    // A lavender lane across the night plain.
    path: { tiles: ['#a58ad6', '#b79ae6', '#a58ad6', '#dccbff'], edge: '#7a5fb4', glow: '#eadfff', thickness: 0.35, width: 3, pillars: false },
  },
  {
    key: 'falcon',
    nameKey: 'map.zoneFalcon',
    src: '/images/falcon-map.jpg',
    aspect: 3558 / 1184,
    fractions: [
      { x: 0.1502, y: 0.0475 },
      { x: 0.2553, y: 0.15 },
      { x: 0.5285, y: 0.254 },
      { x: 0.7763, y: 0.355 },
      { x: 0.8153, y: 0.4475 },
      { x: 0.6081, y: 0.545 },
      { x: 0.3228, y: 0.645 },
      { x: 0.1577, y: 0.745 },
      { x: 0.2327, y: 0.849 },
      { x: 0.5285, y: 0.954 },
    ],
    // Grey plank boardwalk.
    path: { tiles: ['#9b9b9b', '#878787', '#a9a9a9', '#909090'], edge: '#6c6c6c', glow: '#ffe9a8', thickness: 0.45, width: 3, pillars: false },
  },
];

/** Zones laid end to end: zone i starts where zone i-1 ends. */
export const ZONES: readonly MapZone[] = (() => {
  let z = 0;
  return ZONE_ART.map((art, index): MapZone => {
    const depth = Math.round(MAP_WIDTH * art.aspect); // whole blocks, so the terrain grid meets at the seams
    const zone: MapZone = {
      key: art.key,
      index,
      nameKey: art.nameKey,
      z0: z,
      z1: z + depth,
      x0: -MAP_WIDTH / 2,
      x1: MAP_WIDTH / 2,
      path: art.path,
      nodeIds: art.fractions.map((_, i) => index * 10 + i + 1),
    };
    z += depth;
    return zone;
  });
})();

export const MAP_BOUNDS = { x0: -MAP_WIDTH / 2, x1: MAP_WIDTH / 2, z0: ZONES[0].z0, z1: ZONES[ZONES.length - 1].z1 } as const;

export function zoneAtZ(z: number): MapZone {
  for (const zone of ZONES) if (z < zone.z1) return zone;
  return ZONES[ZONES.length - 1];
}

/** A node's position on the ground plane (x, z), before terrain height. */
export function nodeXZ(id: number): { x: number; z: number } {
  const zone = ZONES[Math.floor((id - 1) / 10)];
  const f = ZONE_ART[zone.index].fractions[(id - 1) % 10];
  return { x: (f.x - 0.5) * MAP_WIDTH, z: zone.z0 + f.y * (zone.z1 - zone.z0) };
}

export const NODE_COUNT = ZONES.length * 10;

function stateOf(level: ApiLevel | undefined, id: number): NodeState {
  if (!level) return id === 1 ? 'unlocked' : 'locked';
  if (level.status !== 'ready') return 'locked';
  if (level.progress.status === 'completed') return 'completed';
  return level.progress.status === 'available' ? 'unlocked' : 'locked';
}

/** Merges the static layout with the player's progress. `groundY` supplies the terrain height under each node. */
export function buildWorld(levels: readonly ApiLevel[] = [], groundY: (zone: ZoneKey, x: number, z: number) => number = () => 0): MapWorld {
  const byId = new Map(levels.map((l) => [l.levelNumber, l]));
  const nodes: MapNode[] = [];
  for (let id = 1; id <= NODE_COUNT; id++) {
    const zone = ZONES[Math.floor((id - 1) / 10)];
    const { x, z } = nodeXZ(id);
    const level = byId.get(id);
    nodes.push({
      id,
      zone: zone.key,
      meshType: id % 5 === 0 ? 'arena' : 'pad',
      position: [x, groundY(zone.key, x, z), z],
      state: stateOf(level, id),
      stars: level?.progress.stars ?? 0,
      metadata: {
        title: level?.title ?? `Level ${id}`,
        titleAr: level?.titleAr ?? null,
        comingSoon: level ? level.status !== 'ready' : false,
        subject: level?.subject?.key ?? null,
      },
    });
  }
  const connections: MapConnection[] = [];
  for (let id = 1; id < NODE_COUNT; id++) connections.push({ from: id, to: id + 1, lit: nodes[id].state !== 'locked' });
  return { zones: ZONES, nodes, connections, bounds: MAP_BOUNDS };
}

/** The node the camera opens on: the playable level the player reached, else the last completed, else level 1. */
export function currentNodeId(world: MapWorld): number {
  const open = world.nodes.find((n) => n.state === 'unlocked');
  if (open) return open.id;
  const done = world.nodes.filter((n) => n.state === 'completed');
  return done.length ? done[done.length - 1].id : 1;
}
