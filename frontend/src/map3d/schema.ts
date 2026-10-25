// Data schema for the 3D adventure map. Pure data: no three.js, no React.
//
// The world is split in two on purpose:
//   - the STATIC layout (zones, node positions, connections) lives in layout.ts and never changes;
//   - the DYNAMIC state (locked / unlocked / completed, stars) comes from /api/map and is merged in by
//     buildWorld(), so the visuals only ever read `node.state`.

export type ZoneKey = 'desert' | 'souq' | 'corniche' | 'observatory' | 'falcon';

/** `unlocked` is the API's "available": playable now, not completed yet. */
export type NodeState = 'locked' | 'unlocked' | 'completed';

/** How a node is built: an everyday level pad, or a boss arena (every 5th level). */
export type NodeMeshType = 'pad' | 'arena';

/** World space. 1 unit = 1 block. x grows to the right, y up, z away from level 1 (down the old page). */
export type Vec3 = readonly [x: number, y: number, z: number];

export interface MapNode {
  /** The level number, 1..50: the same key the API and /reels?level=N use. */
  id: number;
  zone: ZoneKey;
  meshType: NodeMeshType;
  /** Where the node's pad sits. y is the ground height there (filled in by buildWorld). */
  position: Vec3;
  state: NodeState;
  /** 0..3, only meaningful once completed. */
  stars: number;
  metadata: {
    title: string;
    titleAr: string | null;
    /** A level the API marks "coming soon" is shown locked and cannot be opened. */
    comingSoon: boolean;
    subject: string | null;
  };
}

export interface MapConnection {
  from: number;
  to: number;
  /** True once the player can walk it: the far end is unlocked or completed. */
  lit: boolean;
}

export interface PathStyle {
  /** Two or more block colours the path alternates through (the dotted look of the artwork). */
  tiles: readonly string[];
  /** The path's outer rim. */
  edge: string;
  /** Emissive tint of a lit (walkable) path. */
  glow: string;
  /** Slab height in blocks. */
  thickness: number;
  /** Path width in blocks. */
  width: number;
  /** Posts under the path, for zones where it floats (a dock over water, a lane in space). */
  pillars: boolean;
}

export interface MapZone {
  key: ZoneKey;
  index: number;
  /** i18n key for the zone's name. */
  nameKey: 'map.zoneDesert' | 'map.zoneSouq' | 'map.zoneCorniche' | 'map.zoneObservatory' | 'map.zoneFalcon';
  /** Depth range in world space. Zones are laid end to end along z. */
  z0: number;
  z1: number;
  /** The playable strip's lateral extent. The ground and scenery run a little past it. */
  x0: number;
  x1: number;
  path: PathStyle;
  /** The ten level numbers in this zone, in order. */
  nodeIds: readonly number[];
}

export interface MapWorld {
  zones: readonly MapZone[];
  nodes: readonly MapNode[];
  connections: readonly MapConnection[];
  /** The whole map's box, for the camera's pan limits. */
  bounds: { x0: number; x1: number; z0: number; z1: number };
}

/** The slice of the /api/map response the world builder reads. */
export interface ApiLevel {
  levelNumber: number;
  title: string;
  titleAr?: string | null;
  kind: 'normal' | 'boss';
  status: 'ready' | 'coming_soon';
  subject: { key: string } | null;
  progress: { status: 'locked' | 'available' | 'completed'; stars: number };
}
