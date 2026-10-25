import { useEffect, useLayoutEffect, useRef, type ElementRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { MapControls } from '@react-three/drei';
import * as THREE from 'three';
import { clamp, lerp } from './math';
import { zoneAtZ } from './layout';
import { pathBaseY } from './ground';
import { nearestOnPath, PATH_POINTS, PATH_STEP } from './pathLine';
import type { MapWorld } from './schema';

// The adventure-map camera, in three views:
//   adventure   looking down at the land from the front, a little tilted: the everyday view
//   eagle       high up and almost straight down: the whole route at a glance
//   walk        first person: standing on the road at eye height, walking it towards the next levels
// Adventure and eagle share the controls: left-drag / one finger pans on the ground, right-drag / two fingers tilt and turn
// (limited), Ctrl + wheel or a pinch zooms, the wheel travels along the map. In walk the wheel (or the arrow keys) walks and
// dragging looks around. Each view has limits that keep the player oriented, and the view cannot leave the map. The scene
// only draws on demand, so everything here asks for the frames it needs (the controls do it themselves while they move).

export type ViewMode = 'eagle' | 'adventure' | 'walk';

export interface RigApi {
  /** Glide to a spot on the ground (and, optionally, a zoom distance). In walk: walk to the nearest bit of road. */
  focus(x: number, z: number, distance?: number): void;
  /** Nudge the view by a ground-plane offset (keyboard panning). Not used in walk. */
  pan(dx: number, dz: number): void;
  /** Zoom by a factor of the current distance (below 1 comes closer). Not used in walk. */
  zoom(factor: number): void;
  /** Travel along the map (wheel scrolling); in walk, walk along the road. Returns false when already at that end, so the page may scroll instead. */
  travel(dz: number): boolean;
  /** Walk only: turn the head by this much (radians) left / up. */
  look(dyaw: number, dpitch?: number): void;
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

interface Limits {
  distance: number;
  min: number;
  max: number;
  polar: number;
  minPolar: number;
  maxPolar: number;
}

/** The two orbit views. `distance` and `polar` are where the camera settles when the view is chosen. */
export const VIEWS: Record<'adventure' | 'eagle', Limits> = {
  adventure: { distance: 54, min: 18, max: 92, polar: 0.95, minPolar: 0.4, maxPolar: 1.2 },
  eagle: { distance: 108, min: 70, max: 150, polar: 0.14, minPolar: 0, maxPolar: 0.45 },
};

export const DEFAULT_VIEW = { distance: VIEWS.adventure.distance, polar: VIEWS.adventure.polar, azimuth: 0 } as const;

/** The orbit view a mode uses (walk leaves the orbit views as the camera it returns to). */
export const orbitOf = (mode: ViewMode) => (mode === 'eagle' ? VIEWS.eagle : VIEWS.adventure);

// While the camera glides from one orbit view to the other it may be outside both views' limits for a moment.
const UNION: Limits = { distance: 0, min: 18, max: 150, polar: 0, minPolar: 0, maxPolar: 1.2 };

/** How far inside the map's edges the view's centre may go. */
const MARGIN_X = 4;
const MARGIN_Z = 6;
/** Within this many blocks of an end of the map the wheel counts as already there (the glide only creeps up on it). */
const END_SLACK = 0.5;

// First person
const EYE = 1.9; // height of the eyes above the road
const SURFACE = 0.45; // the road slab's top above the ground level the pad stands on
const WALK_FOV = 62;
const ORBIT_FOV = 38;
const WALK_PITCH = -0.1; // looking a touch down the road
const MAX_YAW = 1.2;
const MAX_PITCH = 0.45;
const BLEND_SECONDS = 0.8;

const UP = new THREE.Vector3(0, 1, 0);
const ease = (t: number) => t * t * (3 - 2 * t);

interface Pose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  fov: number;
  near: number;
}

const lookQuat = (out: THREE.Quaternion, eye: THREE.Vector3, at: THREE.Vector3) => out.setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, at, UP));

function applyLimits(c: ElementRef<typeof MapControls>, l: Limits) {
  c.minDistance = l.min;
  c.maxDistance = l.max;
  c.minPolarAngle = l.minPolar;
  c.maxPolarAngle = l.maxPolar;
}

export function CameraRig({
  api,
  bounds,
  initial,
  mode,
  instant,
  onZone,
}: {
  api: MutableRefObject<RigApi | null>;
  bounds: MapWorld['bounds'];
  initial: InitialView;
  mode: ViewMode;
  /** Reduced motion: switch views at once instead of gliding. */
  instant: boolean;
  onZone?: (zoneIndex: number) => void;
}) {
  const controls = useRef<ElementRef<typeof MapControls>>(null);
  const goal = useRef<{ x: number; z: number; distance?: number } | null>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const canvas = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  const zone = useRef(-1);
  const offset = useRef(new THREE.Vector3());
  const modeRef = useRef(mode);
  const prevMode = useRef(mode);

  // orbit views: a pending glide to the other view's distance and tilt
  const viewGoal = useRef<{ distance: number; polar: number } | null>(null);
  // first person: where on the route (an index into PATH_POINTS, with a goal it eases to) and where the head is turned
  const walk = useRef({ u: 0, uGoal: 0, yaw: 0, pitch: 0 });
  // a timed move of the camera between the orbit views and first person
  const blend = useRef<{ t: number; kind: 'toWalk' | 'toOrbit'; from: Pose; dest?: Pose } | null>(null);

  modeRef.current = mode;

  const poseNow = (): Pose => ({ pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov, near: camera.near });

  /** Where the first-person camera is right now, and the road surface under it. */
  const walkPose = (surface?: THREE.Vector3): Pose => {
    const w = walk.current;
    const n = PATH_POINTS.length;
    const i = clamp(w.u, 0, n - 1);
    const i0 = Math.floor(i);
    const a = PATH_POINTS[i0];
    const b = PATH_POINTS[Math.min(i0 + 1, n - 1)];
    const f = i - i0;
    const x = lerp(a.x, b.x, f);
    const z = lerp(a.z, b.z, f);
    const ground = pathBaseY(x, z) + SURFACE;
    const yaw = Math.atan2(lerp(a.tx, b.tx, f), lerp(a.tz, b.tz, f)) + w.yaw;
    const pitch = WALK_PITCH + w.pitch;
    const eye = new THREE.Vector3(x, ground + EYE, z);
    const at = eye.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(10));
    surface?.set(x, ground, z);
    return { pos: eye, quat: lookQuat(new THREE.Quaternion(), eye, at), fov: WALK_FOV, near: 0.4 };
  };

  const indexNear = (x: number, z: number) => {
    const p = nearestOnPath(x, z).point;
    return p ? Math.max(0, PATH_POINTS.indexOf(p)) : 0;
  };

  // first placement: the point of interest at the centre, seen from the starting angle
  useLayoutEffect(() => {
    const c = controls.current;
    if (!c) return;
    const sp = Math.sin(initial.polar);
    c.target.set(initial.x, 0, initial.z);
    camera.position.set(initial.x + sp * Math.sin(initial.azimuth) * initial.distance, Math.cos(initial.polar) * initial.distance, initial.z + sp * Math.cos(initial.azimuth) * initial.distance);
    camera.fov = ORBIT_FOV;
    camera.updateProjectionMatrix();
    applyLimits(c, orbitOf(mode));
    c.update();
    if (mode === 'walk') {
      walk.current.u = walk.current.uGoal = indexNear(initial.x, initial.z);
      c.enabled = false;
      const p = walkPose();
      camera.position.copy(p.pos);
      camera.quaternion.copy(p.quat);
      camera.fov = p.fov;
      camera.near = p.near;
      camera.updateProjectionMatrix();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a new view was chosen (a layout effect: it must read the camera before the next frame, which already runs in the new mode)
  useLayoutEffect(() => {
    const c = controls.current;
    const prev = prevMode.current;
    if (!c || prev === mode) return;
    prevMode.current = mode;
    goal.current = null;
    if (mode === 'walk') {
      const t = c.target;
      walk.current = { u: indexNear(t.x, t.z), uGoal: indexNear(t.x, t.z), yaw: 0, pitch: 0 };
      c.enabled = false;
      blend.current = { t: instant ? 1 : 0, kind: 'toWalk', from: poseNow() };
    } else if (prev === 'walk') {
      // back to an orbit view, looking at the spot on the road where the walker stands
      const surface = new THREE.Vector3();
      walkPose(surface);
      const v = orbitOf(mode);
      const dest = new THREE.Vector3(surface.x, surface.y + Math.cos(v.polar) * v.distance, surface.z + Math.sin(v.polar) * v.distance);
      c.target.copy(surface);
      applyLimits(c, orbitOf(mode));
      blend.current = { t: instant ? 1 : 0, kind: 'toOrbit', from: poseNow(), dest: { pos: dest, quat: lookQuat(new THREE.Quaternion(), dest, surface), fov: ORBIT_FOV, near: 1 } };
    } else {
      const v = orbitOf(mode);
      applyLimits(c, UNION);
      viewGoal.current = { distance: v.distance, polar: v.polar };
      if (instant) {
        const off = offset.current.copy(camera.position).sub(c.target);
        const az = Math.atan2(off.x, off.z);
        const sp = Math.sin(v.polar);
        camera.position.set(c.target.x + v.distance * sp * Math.sin(az), c.target.y + v.distance * Math.cos(v.polar), c.target.z + v.distance * sp * Math.cos(az));
        viewGoal.current = null;
        applyLimits(c, v);
      }
    }
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // first person: dragging looks around (the orbit controls are off)
  useEffect(() => {
    if (mode !== 'walk') return;
    let last: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!last) return;
      const w = walk.current;
      // grab the world: dragging right turns the head to the left, dragging down tilts it up
      w.yaw = clamp(w.yaw + (e.clientX - last.x) * 0.004, -MAX_YAW, MAX_YAW);
      w.pitch = clamp(w.pitch + (e.clientY - last.y) * 0.003, -MAX_PITCH, MAX_PITCH);
      last = { x: e.clientX, y: e.clientY };
      invalidate();
    };
    const up = (e: PointerEvent) => {
      last = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    return () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
    };
  }, [mode, canvas, invalidate]);

  useEffect(() => {
    // each move is a new goal for the gliding loop below
    const aim = (patch: (t: THREE.Vector3, g: NonNullable<typeof goal.current> | null) => NonNullable<typeof goal.current> | null) => {
      const t = controls.current?.target;
      if (!t || modeRef.current === 'walk') return false;
      const next = patch(t, goal.current);
      if (!next) return false;
      // a goal outside the map would never be reached, and later moves would start from it: keep it inside
      next.x = clamp(next.x, bounds.x0 + MARGIN_X, bounds.x1 - MARGIN_X);
      next.z = clamp(next.z, bounds.z0 + MARGIN_Z, bounds.z1 - MARGIN_Z);
      goal.current = next;
      invalidate();
      return true;
    };
    const limits = () => orbitOf(modeRef.current);
    api.current = {
      focus: (x, z, distance) => {
        if (modeRef.current === 'walk') {
          walk.current.uGoal = indexNear(x, z);
          invalidate();
        } else void aim((_t, g) => ({ x, z, distance: distance ?? g?.distance }));
      },
      pan: (dx, dz) => void aim((t, g) => ({ x: (g?.x ?? t.x) + dx, z: (g?.z ?? t.z) + dz, distance: g?.distance })),
      zoom: (factor) => void aim((t, g) => ({ x: g?.x ?? t.x, z: g?.z ?? t.z, distance: clamp((g?.distance ?? camera.position.distanceTo(t)) * factor, limits().min, limits().max) })),
      travel: (dz) => {
        if (modeRef.current === 'walk') {
          const w = walk.current;
          const next = clamp(w.uGoal + dz / PATH_STEP, 0, PATH_POINTS.length - 1);
          if (Math.abs(next - w.uGoal) * PATH_STEP < END_SLACK) return false;
          w.uGoal = next;
          invalidate();
          return true;
        }
        return aim((t, g) => {
          const z = g?.z ?? t.z;
          const next = clamp(z + dz, bounds.z0 + MARGIN_Z, bounds.z1 - MARGIN_Z);
          return Math.abs(next - z) < END_SLACK ? null : { x: g?.x ?? t.x, z: next, distance: g?.distance };
        });
      },
      look: (dyaw, dpitch = 0) => {
        const w = walk.current;
        w.yaw = clamp(w.yaw + dyaw, -MAX_YAW, MAX_YAW);
        w.pitch = clamp(w.pitch + dpitch, -MAX_PITCH, MAX_PITCH);
        invalidate();
      },
    };
    return () => {
      api.current = null;
    };
  }, [api, camera, invalidate, bounds]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const t = c.target;
    const step = Math.min(dt, 0.1);
    const b = blend.current;

    if (mode === 'walk' || b) {
      // first person (or moving to / from it): the route, not the controls, places the camera
      const w = walk.current;
      if (mode === 'walk') {
        w.u += (w.uGoal - w.u) * (1 - Math.exp(-step * 6));
        if (Math.abs(w.uGoal - w.u) > 0.02) invalidate();
        else w.u = w.uGoal;
      }
      const surface = new THREE.Vector3();
      const here = walkPose(surface);
      if (b) {
        b.t = Math.min(1, b.t + step / BLEND_SECONDS);
        const e = ease(b.t);
        const to = b.kind === 'toWalk' ? here : b.dest!;
        camera.position.lerpVectors(b.from.pos, to.pos, e);
        camera.quaternion.slerpQuaternions(b.from.quat, to.quat, e);
        camera.fov = lerp(b.from.fov, to.fov, e);
        camera.near = lerp(b.from.near, to.near, e);
        camera.updateProjectionMatrix();
        if (b.t >= 1) {
          blend.current = null;
          if (b.kind === 'toOrbit') c.enabled = true;
        }
        invalidate();
      } else {
        camera.position.copy(here.pos);
        camera.quaternion.copy(here.quat);
      }
      // everything that asks where the camera looks (the sky, the level of detail, the zone buttons) reads the controls' target
      if (mode === 'walk') t.copy(surface);
    } else {
      const vg = viewGoal.current;
      if (vg) {
        // gliding to the other orbit view: ease the distance and the tilt, keep the turn
        const off = offset.current.copy(camera.position).sub(t);
        const r = off.length();
        const polar = Math.acos(clamp(off.y / r, -1, 1));
        const az = Math.atan2(off.x, off.z);
        const k = 1 - Math.exp(-step * 4);
        const r2 = lerp(r, vg.distance, k);
        const p2 = lerp(polar, vg.polar, k);
        camera.position.set(t.x + r2 * Math.sin(p2) * Math.sin(az), t.y + r2 * Math.cos(p2), t.z + r2 * Math.sin(p2) * Math.cos(az));
        if (Math.abs(r2 - vg.distance) < 0.3 && Math.abs(p2 - vg.polar) < 0.01) {
          viewGoal.current = null;
          applyLimits(c, orbitOf(mode));
        } else invalidate();
      }
      const g = goal.current;
      if (g) {
        const k = 1 - Math.exp(-step * 4.5);
        const dx = (g.x - t.x) * k;
        const dz = (g.z - t.z) * k;
        t.x += dx;
        t.z += dz;
        camera.position.x += dx;
        camera.position.z += dz;
        let settled = Math.hypot(g.x - t.x, g.z - t.z) < 0.05;
        if (g.distance !== undefined) {
          const l = orbitOf(mode);
          const want = clamp(g.distance, l.min, l.max);
          const off = offset.current.copy(camera.position).sub(t);
          const len = off.length();
          off.setLength(len + (want - len) * k);
          camera.position.copy(t).add(off);
          settled = settled && Math.abs(len - want) < 0.1;
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
      minAzimuthAngle={-0.7}
      maxAzimuthAngle={0.7}
      zoomSpeed={0.8}
      onStart={() => {
        goal.current = null; // the player took the wheel
      }}
    />
  );
}
