import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import type { MapZone } from '../schema';
import { HeightfieldTerrain } from '../Terrain';
import { spotAt as at } from '../placement';
import { Baked, Voxel, type Placement, type Spot, type VoxelModel } from '../voxel';
import { baseHeight, pathLevel, SPOT, topColor, WATER_Y } from './cornicheLand';
import * as M from './cornicheModels';
import { Water } from './cornicheWater';
import type { ZoneModule } from './types';

// The Corniche Coast: a bright turquoise sea with the dock running through it. Landmarks, from level 21 to 30: a palm islet
// top left, a small sailboat by the beach, a striped lighthouse on its headland, a flock of gulls, the big dhow, and a second
// palm islet bottom right, with sandbars, sea stacks, a breakwater and a reef sculpted into the ground (cornicheLand.ts).
// Everything that does not move is baked into one mesh; only the two boats, the gulls and the water animate.

const onWater = (x: number, z: number, ry = 0, s = 1): Spot => ({ x, y: WATER_Y, z, ry, s });

function useBaked(): Placement[] {
  return useMemo(() => {
    const [lx, lz] = SPOT.lighthouse;
    return [
      { model: M.PALM_A, items: [at(-18.6, 220.6, 0.4), at(10, 295.5, 2)] },
      { model: M.PALM_B, items: [at(-16.4, 222.8, 1.2), at(12.4, 297.8, 4)] },
      { model: M.LIGHTHOUSE, items: [at(lx, lz, 0, 0.85)] },
      { model: M.BOULDER, items: [at(-10.8, 265.2, 0.5), at(-12.2, 271, 2.1, 0.8)] },
      { model: M.SHELL, items: [at(8.2, 223.2, 0.2, 1.4), at(1.8, 285.5, -0.3, 1.4), at(12.6, 299.8, 0.4, 1.4)] },
      { model: M.BUOY, items: [onWater(-2, 252.5, 0, 0.8), onWater(-3.5, 282, 0, 0.8)] },
    ];
  }, []);
}

/** A boat riding the swell: it rises, rolls and pitches a little; at rest when motion is reduced. */
function Boat({ model, x, z, ry, amp, speed, phase, still }: { model: VoxelModel; x: number; z: number; ry: number; amp: number; speed: number; phase: number; still: boolean }) {
  const hull = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = hull.current;
    if (!g || still) return;
    const a = clock.elapsedTime * speed + phase;
    g.position.y = Math.sin(a) * amp;
    g.rotation.x = Math.sin(a * 0.8 + 1) * amp * 0.25;
    g.rotation.z = Math.sin(a * 1.1) * amp * 0.3;
  });
  return (
    <group position={[x, WATER_Y, z]} rotation-y={ry}>
      <Voxel ref={hull} model={model} />
    </group>
  );
}

/** The gulls circle the middle of the zone, high over the road. */
const FLIGHT = { cx: -2, cz: 274, rx: 13, rz: 8, y: 8, speed: 0.16 };
function place(g: THREE.Group, t: number) {
  const a = 0.6 + t * FLIGHT.speed;
  g.position.set(FLIGHT.cx + Math.cos(a) * FLIGHT.rx, FLIGHT.y + Math.sin(a * 2) * 0.5, FLIGHT.cz + Math.sin(a) * FLIGHT.rz);
  g.rotation.y = Math.atan2(-Math.sin(a) * FLIGHT.rx, Math.cos(a) * FLIGHT.rz); // facing the way they fly
}

function Gulls({ still }: { still: boolean }) {
  const flock = useRef<THREE.Group>(null);
  useLayoutEffect(() => {
    if (flock.current) place(flock.current, 0);
  }, []);
  useFrame(({ clock }) => {
    if (flock.current && !still) place(flock.current, clock.elapsedTime);
  });
  return <Voxel ref={flock} model={M.GULLS} scale={0.55} />;
}

function CornicheScenery({ still }: { zone: MapZone; still: boolean }) {
  const baked = useBaked();
  return (
    <group>
      <Water still={still} />
      <Baked parts={baked} />
      <Boat model={M.SAILBOAT} x={19.5} z={243} ry={-1.2} amp={0.12} speed={1.3} phase={0} still={still} />
      <Boat model={M.DHOW} x={6} z={277} ry={-1} amp={0.1} speed={0.9} phase={2} still={still} />
      <Gulls still={still} />
    </group>
  );
}

export const corniche: ZoneModule = {
  baseHeight,
  pathLevel,
  carve: false, // the sea is not cut into: the road is a dock standing above it
  Ground: ({ zone }: { zone: MapZone }) => <HeightfieldTerrain zone={zone} top={topColor} />,
  Scenery: CornicheScenery,
  atmosphere: { sky: '#bfe4f5', fog: '#c6e8f6', sun: '#fffbea', sunIntensity: 2.4, ambient: '#e0f3ff', ambientIntensity: 0.95 },
};
