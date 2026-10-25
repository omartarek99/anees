import { useEffect, useLayoutEffect, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import * as THREE from 'three';
import { clamp } from './math';
import { zoneAtZ } from './layout';
import type { MapWorld } from './schema';

// An adventure-map camera: looking down at the land from the front, a little tilted, like the old page seen from above.
//   left-drag / one finger    pan along the ground      wheel      travel along the map (see AdventureMap3D)
//   Ctrl + wheel / pinch      zoom                      right-drag / two fingers   turn and tilt (limited)
// The limits keep the player oriented: the tilt never goes flat or straight down, the turn stays within ~40 degrees of
// the front, the zoom has a near and a far stop, and the view cannot leave the map. The scene only draws on demand, so
// everything here asks for the frames it needs (the controls do it themselves while they move).

export interface RigApi {
  /** Glide to a spot on the ground (and, optionally, a zoom distance). */
  focus(x: number, z: number, distance?: number): void;
  /** Nudge the view by a ground-plane offset (keyboard panning). */
  pan(dx: number, dz: number): void;
  /** Zoom by a factor of the current distance (below 1 comes closer). */
  zoom(factor: number): void;
  /** Travel along the map (wheel scrolling). Returns false when already at that end, so the page may scroll instead. */
  travel(dz: number): boolean;
}

export interface InitialView {
  x: number;
  z: number;
  /** Camera distance from the point it looks at, in blocks. */
  distance: number;
  /** Angle from straight down, radians (0 = top view). */
  polar: number;
  /** Turn around the vertical axis, radians (0 = from the front, looking towards level 1). */
  azimuth: number;
}

export const DEFAULT_VIEW = { distance: 40, polar: 0.95, azimuth: 0 } as const;

const MIN_DISTANCE = 14;
const MAX_DISTANCE = 74;
/** How far inside the map's edges the view's centre may go. */
const MARGIN_X = 4;
const MARGIN_Z = 6;
/** Within this many blocks of an end of the map the wheel counts as already there (the glide only creeps up on it). */
const END_SLACK = 0.5;

export function CameraRig({ api, bounds, initial, onZone }: { api: MutableRefObject<RigApi | null>; bounds: MapWorld['bounds']; initial: InitialView; onZone?: (zoneIndex: number) => void }) {
  const controls = useRef<ElementRef<typeof MapControls>>(null);
  const goal = useRef<{ x: number; z: number; distance?: number } | null>(null);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const zone = useRef(-1);
  const offset = useRef(new THREE.Vector3());

  // first placement: the point of interest at the centre, seen from the starting angle
  useLayoutEffect(() => {
    const c = controls.current;
    if (!c) return;
    const sp = Math.sin(initial.polar);
    c.target.set(initial.x, 0, initial.z);
    camera.position.set(initial.x + sp * Math.sin(initial.azimuth) * initial.distance, Math.cos(initial.polar) * initial.distance, initial.z + sp * Math.cos(initial.azimuth) * initial.distance);
    c.update();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // each move is a new goal for the gliding loop below
    const aim = (patch: (t: THREE.Vector3, g: NonNullable<typeof goal.current> | null) => NonNullable<typeof goal.current> | null) => {
      const t = controls.current?.target;
      if (!t) return false;
      const next = patch(t, goal.current);
      if (!next) return false;
      // a goal outside the map would never be reached, and later moves would start from it: keep it inside
      next.x = clamp(next.x, bounds.x0 + MARGIN_X, bounds.x1 - MARGIN_X);
      next.z = clamp(next.z, bounds.z0 + MARGIN_Z, bounds.z1 - MARGIN_Z);
      goal.current = next;
      invalidate();
      return true;
    };
    api.current = {
      focus: (x, z, distance) => void aim(() => ({ x, z, distance })),
      pan: (dx, dz) => void aim((t, g) => ({ x: (g?.x ?? t.x) + dx, z: (g?.z ?? t.z) + dz, distance: g?.distance })),
      zoom: (factor) => void aim((t, g) => ({ x: g?.x ?? t.x, z: g?.z ?? t.z, distance: (g?.distance ?? camera.position.distanceTo(t)) * factor })),
      travel: (dz) =>
        aim((t, g) => {
          const z = g?.z ?? t.z;
          const next = clamp(z + dz, bounds.z0 + MARGIN_Z, bounds.z1 - MARGIN_Z);
          return Math.abs(next - z) < END_SLACK ? null : { x: g?.x ?? t.x, z: next, distance: g?.distance };
        }),
    };
    return () => {
      api.current = null;
    };
  }, [api, camera, invalidate, bounds]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const t = c.target;
    const g = goal.current;
    if (g) {
      const k = 1 - Math.exp(-Math.min(dt, 0.1) * 4.5);
      const dx = (g.x - t.x) * k;
      const dz = (g.z - t.z) * k;
      t.x += dx;
      t.z += dz;
      camera.position.x += dx;
      camera.position.z += dz;
      let settled = Math.hypot(g.x - t.x, g.z - t.z) < 0.05;
      if (g.distance !== undefined) {
        const off = offset.current.copy(camera.position).sub(t);
        const len = off.length();
        off.setLength(len + (clamp(g.distance, MIN_DISTANCE, MAX_DISTANCE) - len) * k);
        camera.position.copy(t).add(off);
        settled = settled && Math.abs(len - clamp(g.distance, MIN_DISTANCE, MAX_DISTANCE)) < 0.1;
      }
      if (settled) goal.current = null;
      else invalidate(); // still gliding: ask for the next frame
    }
    // the view cannot leave the map: pull the target back and carry the camera with it
    const cx = clamp(t.x, bounds.x0 + MARGIN_X, bounds.x1 - MARGIN_X);
    const cz = clamp(t.z, bounds.z0 + MARGIN_Z, bounds.z1 - MARGIN_Z);
    if (cx !== t.x || cz !== t.z) {
      camera.position.x += cx - t.x;
      camera.position.z += cz - t.z;
      t.x = cx;
      t.z = cz;
    }
    const zi = zoneAtZ(t.z).index;
    if (zi !== zone.current) {
      zone.current = zi;
      onZone?.(zi);
    }
  });

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.1}
      screenSpacePanning={false}
      minDistance={MIN_DISTANCE}
      maxDistance={MAX_DISTANCE}
      minPolarAngle={0.4}
      maxPolarAngle={1.2}
      minAzimuthAngle={-0.7}
      maxAzimuthAngle={0.7}
      zoomSpeed={0.8}
      onStart={() => {
        goal.current = null; // the player took the wheel
      }}
    />
  );
}
