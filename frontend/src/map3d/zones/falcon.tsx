import { useMemo } from 'react';
import { HeightfieldTerrain } from '../Terrain';
import type { MapZone } from '../schema';
import { Baked } from '../voxel';
import { Clouds, Falcon, Flag } from './falconFx';
import type { Orbit } from './falconFx';
import { buildLayout } from './falconPlacement';
import { falconGround, falconSide, falconTop } from './falconTerrain';
import type { ZoneModule } from './types';

// Falcon's Peak: a mint valley between snowy ridges, a stream, big stepped mountains and pines, with clouds drifting, two falcons
// circling and a red flag on the summit. The land is the heightfield (falconTerrain); everything static is ONE baked mesh.

/** Two falcons circling high out beside the road (x, depth into the zone, radius, height, speed): a bird h blocks up appears about 1.3 h farther along. */
const ORBITS: readonly (readonly [number, number, number, number, number])[] = [
  [22, 36, 6, 13, 0.3],
  [-24, 90, 6, 14, -0.26],
];

function Scenery({ zone, still }: { zone: MapZone; still: boolean }) {
  const layout = useMemo(() => buildLayout(zone), [zone]);
  const orbits = useMemo<Orbit[]>(() => ORBITS.map(([x, v, r, y, speed], i) => ({ x, z: zone.z0 + v, r, y, speed, phase: i * 2.4 })), [zone]);
  return (
    <group>
      <Baked parts={layout.parts} />
      <Clouds z0={zone.z0} still={still} />
      {orbits.map((o, i) => (
        <Falcon key={i} orbit={o} still={still} />
      ))}
      <Flag at={layout.flag} still={still} />
    </group>
  );
}

export const falcon: ZoneModule = {
  ...falconGround,
  Ground: ({ zone }: { zone: MapZone }) => <HeightfieldTerrain zone={zone} top={falconTop} side={falconSide} />,
  Scenery,
  atmosphere: { sky: '#d8f1e6', fog: '#dff3ea', sun: '#fffbea', sunIntensity: 2.4, ambient: '#e4f6ee', ambientIntensity: 0.95 },
};
