import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { ZONE_MODULES } from './zones';
import type { MapZone } from './schema';

// Draws every zone's ground and scenery. A zone far from where the camera looks is hidden, so only the one or two zones
// on screen are ever sent to the GPU.

const REACH = 100; // blocks beyond a zone's ends at which it still draws

function ZoneSlot({ zone, still }: { zone: MapZone; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  const { Ground, Scenery } = ZONE_MODULES[zone.key];
  useFrame(({ controls }) => {
    const z = (controls as { target?: THREE.Vector3 } | null)?.target?.z;
    if (z !== undefined && group.current) group.current.visible = z > zone.z0 - REACH && z < zone.z1 + REACH;
  });
  return (
    <group ref={group} name={`zone:${zone.key}`}>
      <group name={`ground:${zone.key}`}>
        <Ground zone={zone} />
      </group>
      <group name={`scenery:${zone.key}`}>
        <Scenery zone={zone} still={still} />
      </group>
    </group>
  );
}

export function ZoneLayer({ zones, still }: { zones: readonly MapZone[]; still: boolean }) {
  return (
    <>
      {zones.map((z) => (
        <ZoneSlot key={z.key} zone={z} still={still} />
      ))}
    </>
  );
}
