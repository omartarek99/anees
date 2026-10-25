import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { groundHeight } from '../ground';
import { mulberry32 } from '../math';
import type { MapZone } from '../schema';
import { HeightfieldTerrain } from '../Terrain';
import { Baked, Voxel } from '../voxel';
import type { Placement, Spot, VoxelModel } from '../voxel';
import { baseHeight, studSpots, topColor } from './observatoryLand';
import {
  BIG_PLANET, BIG_RING, BIG_TILT, CRESCENT, LAUNCH_PAD, LILAC_PLANET, ROCKET, SATELLITE, STARS_A, STARS_B, STUD, TELESCOPE,
} from './observatoryModels';
import type { ZoneModule } from './types';

// Sky Observatory, kept calm: a deep indigo night plain with the artwork's dot grid, and a handful of bold landmarks. Two
// ringed planets and a crescent moon hang in the sky, the brass telescope stands beside the road, a rocket hovers over its
// launch pad, a satellite drifts by and two little clusters of gold stars twinkle. Everything that stands still is baked into
// one mesh; only the big planet, the rocket and the two star clusters move. Seen from the default tilt a thing h blocks up
// appears about 1.4 h blocks farther towards level 1, so the sky pieces sit out beside the road rather than over it.

function Ground({ zone }: { zone: MapZone }) {
  return <HeightfieldTerrain zone={zone} top={topColor} />;
}

interface FloatingProps {
  model: VoxelModel;
  at: readonly [number, number, number];
  /** Fixed tilt of the whole thing (x, y, z radians) and size. */
  rotation?: readonly [number, number, number];
  size?: number;
  /** Bobbing height (blocks) and speed (rad/s). */
  bob?: number;
  speed?: number;
  /** Constant turn about the (tilted) vertical axis, rad/s. */
  spin?: number;
  /** Size swell for a twinkle, as a fraction. */
  pulse?: number;
  phase?: number;
  still: boolean;
}

/** One animated model: bobs, turns and swells by the clock. `still` leaves it in its resting pose. */
function Floating({ model, at, rotation = [0, 0, 0], size = 1, bob = 0, speed = 1, spin = 0, pulse = 0, phase = 0, still }: FloatingProps) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g || still) return;
    const t = clock.elapsedTime;
    g.position.y = bob * Math.sin(t * speed + phase);
    g.rotation.y = spin * t;
    g.scale.setScalar(1 + pulse * Math.sin(t * speed * 2.3 + phase));
  });
  return (
    <group position={[at[0], at[1], at[2]]} rotation={[rotation[0], rotation[1], rotation[2]]} scale={size}>
      <Voxel ref={ref} model={model} />
    </group>
  );
}

// A sprinkle of small square stars hanging in the air: one draw call, no animation.
const DUST = 150;
const DUST_COLORS = ['#ffffff', '#ffe9a6', '#a9d4ff'];

function StarDust({ zone }: { zone: MapZone }) {
  const { pos, col } = useMemo(() => {
    const rand = mulberry32(4242);
    const pos = new Float32Array(DUST * 3);
    const col = new Float32Array(DUST * 3);
    const c = new THREE.Color();
    for (let i = 0; i < DUST; i++) {
      pos.set([(rand() - 0.5) * 70, 6 + rand() * 34, zone.z0 + rand() * (zone.z1 - zone.z0)], i * 3);
      c.set(DUST_COLORS[Math.floor(rand() * DUST_COLORS.length)]).toArray(col, i * 3);
    }
    return { pos, col };
  }, [zone]);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        <bufferAttribute attach="attributes-color" args={[col, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.3} vertexColors toneMapped={false} />
    </points>
  );
}

const ROCKET_SIZE = 1.15;
/** Leans the star clusters back so their faces turn up towards the default camera. */
const STAR_LEAN = [-0.6, 0, 0] as const;

function Scenery({ zone, still }: { zone: MapZone; still: boolean }) {
  const layout = useMemo(() => {
    const sky = (x: number, y: number, zr: number): Spot => ({ x, y, z: zone.z0 + zr });
    const on = (x: number, zr: number): Spot => sky(x, groundHeight(x, zone.z0 + zr), zr);
    const planet = sky(19, 13, 10);
    const pad = on(-21, 53);
    const parts: Placement[] = [
      { model: STUD, items: studSpots() },
      { model: TELESCOPE, items: [{ ...on(3.5, 30), ry: 0.25, s: 0.9 }] },
      { model: LAUNCH_PAD, items: [{ ...pad, s: ROCKET_SIZE }] },
      { model: BIG_RING, items: [planet] },
      { model: LILAC_PLANET, items: [sky(-18, 10, 84)] },
      { model: CRESCENT, items: [{ ...sky(20, 11, 26), s: 0.9 }] },
      { model: SATELLITE, items: [{ ...sky(15, 7, 62), ry: -0.4 }] },
    ];
    const at = (p: Spot, lift = 0) => [p.x, p.y + lift, p.z] as const;
    return { parts, planet: at(planet), rocket: at(pad, 4.5), starsA: at(sky(0, 3.5, 44)), starsB: at(sky(-10, 3.5, 88)) };
  }, [zone]);

  return (
    <group>
      <Baked parts={layout.parts} />
      <StarDust zone={zone} />
      <Floating model={BIG_PLANET} at={layout.planet} rotation={[0, 0, BIG_TILT]} spin={0.15} still={still} />
      <Floating model={ROCKET} at={layout.rocket} size={ROCKET_SIZE} bob={0.3} speed={1.4} still={still} />
      <Floating model={STARS_A} at={layout.starsA} rotation={STAR_LEAN} bob={0.35} speed={1.1} pulse={0.1} still={still} />
      <Floating model={STARS_B} at={layout.starsB} rotation={STAR_LEAN} bob={0.35} speed={1.3} pulse={0.1} phase={2} still={still} />
    </group>
  );
}

export const observatory: ZoneModule = {
  baseHeight,
  Ground,
  Scenery,
  // A dark purple night that stays readable: cool moonlight from the sun, a violet fill from everywhere else.
  atmosphere: { sky: '#1c1446', fog: '#241a58', sun: '#c3ceff', sunIntensity: 1.9, ambient: '#8576e0', ambientIntensity: 1.25 },
};
