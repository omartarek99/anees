import type { ReactNode } from 'react';
import { Html } from '@react-three/drei';
import { groundHeight } from './ground';
import type { MapNode, MapZone } from './schema';

// Labels that live in the 3D world: a wooden sign at the start of each zone, and the tooltip over the node under the
// pointer. Both are DOM (drei <Html>), so they stay crisp, and Arabic shapes and reads right to left. Their text arrives
// as props: nothing inside the Canvas can reach the app's language context.

export function ZoneBanners({ zones, names }: { zones: readonly MapZone[]; names: readonly string[] }) {
  return (
    <>
      {zones.map((z, i) => (
        <Html key={z.key} position={[0, groundHeight(0, z.z0 + 1.5) + 11, z.z0 + 1.5]} center distanceFactor={30} zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
          <div className="map3d-banner">{names[i]}</div>
        </Html>
      ))}
    </>
  );
}

export function NodeTip({ node, children }: { node: MapNode; children: ReactNode }) {
  const lift = node.meshType === 'arena' ? 13 : 8.5;
  return (
    <Html position={[node.position[0], node.position[1] + lift, node.position[2]]} center zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}>
      {children}
    </Html>
  );
}
