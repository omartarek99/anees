import { smoothstep } from './math';
import { zoneAtZ } from './layout';
import { nearestOnPath } from './pathLine';
import type { MapZone, ZoneKey } from './schema';

// Ground height anywhere on the map. Each zone describes its own landscape (`baseHeight`); this module blends the road
// into it: a level corridor along the route that eases back into the landscape on both sides, so the path is always
// walkable and never buried. Heights snap to half blocks (the stepped, Minecraft-like terraces).

export interface GroundSource {
  /** The zone's landscape before the road is cut into it. Must be ~0 near the zone's z0/z1 edges (see seamFade). */
  baseHeight(x: number, z: number): number;
  /** Height the road runs at; defaults to baseHeight (so the road follows the land). */
  pathLevel?(x: number, z: number): number;
  /** false for ground that is not cut into: water, where the road is a dock above it. Default true. */
  carve?: boolean;
}

const sources: Partial<Record<ZoneKey, GroundSource>> = {};

export function registerGround(key: ZoneKey, source: GroundSource) {
  sources[key] = source;
}

/** Half-block height steps. */
const quantize = (h: number) => Math.round(h * 2) / 2;

/** Half-width of the level corridor, and how far beyond it the road still shapes the land. */
const CORRIDOR_FLAT = 2.4;
const CORRIDOR_BLEND = 6.5;

/** 0 at a zone's edges, 1 once `width` blocks inside: multiply a landscape by it so neighbouring zones meet flush. */
export function seamFade(zone: MapZone, z: number, width = 10) {
  return smoothstep(0, width, Math.min(z - zone.z0, zone.z1 - z));
}

/** The final terrain height at a ground position. */
export function groundHeight(x: number, z: number): number {
  const src = sources[zoneAtZ(z).key];
  if (!src) return 0;
  const base = src.baseHeight(x, z);
  if (src.carve === false) return quantize(base);
  const hit = nearestOnPath(x, z);
  if (!hit.point || hit.d > CORRIDOR_BLEND) return quantize(base);
  const level = (src.pathLevel ?? src.baseHeight)(hit.point.x, hit.point.z);
  const k = 1 - smoothstep(CORRIDOR_FLAT, CORRIDOR_BLEND, hit.d);
  return quantize(base + (level - base) * k);
}

/** The height a road slab or level pad stands on at a point of the route. */
export function pathBaseY(x: number, z: number): number {
  const src = sources[zoneAtZ(z).key];
  if (!src) return 0;
  return quantize((src.pathLevel ?? src.baseHeight)(x, z));
}
