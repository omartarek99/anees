import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { smoothstep } from '../math';
import { Voxel } from '../voxel';
import type { Spot } from '../voxel';
import { CLOTH, CLOTH_Y, CLOUDS, FALCON } from './falconParts';

// Falcon's Peak's ambient motion: the clouds drifting (one group), two falcons circling and a waving flag. Each is a ref posed
// from the clock; nothing allocates per frame. `still` (reduced motion) poses them once and never moves them.

/** The pose a still scene shows (seconds into the animation). */
const STILL_T = 2.4;

function useAmbient(still: boolean, pose: (t: number) => void) {
  const latest = useRef(pose);
  latest.current = pose;
  useLayoutEffect(() => {
    latest.current(STILL_T);
  }, [still]);
  useFrame(({ clock }) => {
    if (!still) latest.current(clock.elapsedTime);
  });
}

/** The three clouds drift slowly to and fro as one group. */
export function Clouds({ z0, still }: { z0: number; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  useAmbient(still, (t) => group.current?.position.set(Math.sin(t * 0.07) * 5, Math.sin(t * 0.21) * 0.3, z0));
  return <Voxel ref={group} model={CLOUDS} />;
}

export interface Orbit {
  x: number;
  z: number;
  r: number;
  y: number;
  /** Radians per second; negative circles the other way. */
  speed: number;
  phase: number;
}

/** A falcon gliding in a slow circle, banked into the turn, now and then flapping (its span narrows and widens). */
export function Falcon({ orbit: o, still }: { orbit: Orbit; still: boolean }) {
  const group = useRef<THREE.Group>(null);
  useAmbient(still, (t) => {
    const g = group.current;
    if (!g) return;
    const a = t * o.speed + o.phase;
    const dir = Math.sign(o.speed);
    g.position.set(o.x + Math.cos(a) * o.r, o.y + Math.sin(a * 2) * 0.6, o.z + Math.sin(a) * o.r);
    g.rotation.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), 0.3 * dir, 'YXZ');
    g.scale.x = 1 - 0.22 * (0.5 + 0.5 * Math.sin(t * 6.5 + o.phase)) * smoothstep(-0.2, 0.4, Math.sin(t * 0.55 + o.phase * 2));
  });
  return <Voxel ref={group} model={FALCON} />;
}

/** The red flag: the cloth is two halves, the outer one swinging a little behind the inner. */
export function Flag({ at, still }: { at: Spot; still: boolean }) {
  const inner = useRef<THREE.Group>(null);
  const outer = useRef<THREE.Group>(null);
  useAmbient(still, (t) => {
    if (inner.current) inner.current.rotation.y = Math.sin(t * 1.7) * 0.14;
    if (outer.current) outer.current.rotation.y = Math.sin(t * 1.7 - 1.2) * 0.3;
  });
  return (
    <group position={[at.x + 0.3, at.y + CLOTH_Y, at.z]}>
      <group ref={inner}>
        <Voxel model={CLOTH[0]} />
        <group ref={outer} position={[2.6, 0, 0]}>
          <Voxel model={CLOTH[1]} />
        </group>
      </group>
    </group>
  );
}
