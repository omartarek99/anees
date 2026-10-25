import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { glowMaterial, Voxel, voxelMaterial, type Spot } from '../voxel';
import { PALM, STAR } from './desertModels';

// The desert's only motion: one palm crown swaying and three gold stars bobbing. Nothing allocates per frame, and `still`
// (reduced motion) draws one fixed pose and animates nothing.

/** The pose a still scene shows (seconds into the animation). */
const STILL_T = 1.7;

const P = new THREE.Vector3();
const S = new THREE.Vector3();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const M = new THREE.Matrix4();

export interface StarSpot {
  x: number;
  y: number;
  z: number;
  s: number;
  phase: number;
}

/** All the stars as one instanced pair of meshes (body + glow): two draw calls however many there are. */
export function GoldStars({ stars, still }: { stars: readonly StarSpot[]; still: boolean }) {
  const geo = useMemo(() => STAR.get(), []);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([null, null]);

  const pose = (t: number) => {
    stars.forEach((st, i) => {
      P.set(st.x, st.y + Math.sin(t * 1.8 + st.phase) * 0.4, st.z);
      Q.setFromEuler(E.set(0, Math.sin(t * 0.9 + st.phase * 3) * 0.6, Math.sin(t * 1.1 + st.phase) * 0.1)); // a gentle sway: always face-on
      M.compose(P, Q, S.setScalar(st.s));
      for (const mesh of meshes.current) mesh?.setMatrixAt(i, M);
    });
    for (const mesh of meshes.current) if (mesh) mesh.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => pose(STILL_T), [stars, still]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }) => {
    if (!still) pose(clock.elapsedTime);
  });

  // not frustum-culled: the instances move, so the bounding sphere three would compute once could go stale
  return (
    <>
      {geo.solid && <instancedMesh ref={(m) => (meshes.current[0] = m)} args={[geo.solid, voxelMaterial, stars.length]} frustumCulled={false} />}
      {geo.glow && <instancedMesh ref={(m) => (meshes.current[1] = m)} args={[geo.glow, glowMaterial, stars.length]} frustumCulled={false} />}
    </>
  );
}

/** The crown of one palm sways about the top of its (baked) trunk. */
export function SwayingPalm({ kind, spot, still }: { kind: number; spot: Spot; still: boolean }) {
  const crown = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const c = crown.current;
    if (still || !c) return;
    const t = clock.elapsedTime * 0.9;
    c.rotation.z = Math.sin(t) * 0.05;
    c.rotation.x = Math.sin(t * 0.7 + 1.3) * 0.04;
  });
  const palm = PALM[kind];
  return (
    <group position={[spot.x, spot.y, spot.z]} rotation={[0, spot.ry ?? 0, 0]}>
      <Voxel ref={crown} model={palm.crown} position={[palm.top, palm.h, 0]} />
    </group>
  );
}
