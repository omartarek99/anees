import type { ComponentType } from 'react';
import type { GroundSource } from '../ground';
import type { MapZone } from '../schema';

/** How the sky, fog and light feel over a zone. The scene blends between neighbouring zones as the camera pans. */
export interface Atmosphere {
  sky: string;
  fog: string;
  sun: string;
  sunIntensity: number;
  ambient: string;
  ambientIntensity: number;
}

/**
 * Everything one zone contributes to the map. A zone is a landscape (baseHeight + Ground), the things standing on it
 * (Scenery) and a mood (atmosphere). The road, the level nodes and the camera are shared and not the zone's business.
 */
export interface ZoneModule extends GroundSource {
  /** Draws the terrain (use <HeightfieldTerrain/>) and anything else that is "ground": water, a sea floor, a starfield. */
  Ground: ComponentType<{ zone: MapZone }>;
  /** Draws the landmarks and decoration. `still` is true for reduced-motion users: skip ambient animation. */
  Scenery: ComponentType<{ zone: MapZone; still: boolean }>;
  atmosphere: Atmosphere;
}
