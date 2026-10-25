import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ThreeElements } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hash2 } from './math';

// The map's modelling kit. Every structure (a palm, a stall, a dhow, a rocket...) is a list of coloured boxes, merged once
// into a single mesh with vertex colours: no image files, a handful of draw calls, and the blocky look of the Craft world.
//
//   const PALM = defineModel(() => [
//     box(0, 0, 0, 1, 5, 1, '#8a5a2b'),          // x, y, z, width, height, depth, colour
//     ...disc(0, 5, 0, 2.5, 1, '#3f9a45'),       // helpers for round shapes on the block grid
//   ]);
//   <Voxel model={PALM} position={[x, ground, z]} rotation-y={0.4} />
//   <VoxelInstances model={PALM} items={spots} />   // many copies, one draw call

/** One block. (x, z) is its centre on the ground plane, y its bottom; w/h/d default to 1. Units are blocks. */
export interface Box {
  x: number;
  y: number;
  z: number;
  w?: number;
  h?: number;
  d?: number;
  c: string;
  /** Unlit: shows its colour at full strength whatever the light (lantern flames, windows, stars). */
  glow?: boolean;
}

export const box = (x: number, y: number, z: number, w: number, h: number, d: number, c: string, glow?: boolean): Box => ({ x, y, z, w, h, d, c, glow });

/** A flat round slab on the block grid: centre (cx, cz), bottom y, height h. Rows are merged into long boxes. */
export function disc(cx: number, y: number, cz: number, r: number, h: number, c: string, glow?: boolean): Box[] {
  const out: Box[] = [];
  const n = Math.ceil(r);
  for (let j = -n; j <= n; j++) {
    let start: number | null = null;
    for (let i = -n; i <= n + 1; i++) {
      const inside = i <= n && (i * i + j * j) <= r * r + 0.25;
      if (inside && start === null) start = i;
      if (!inside && start !== null) {
        const w = i - start;
        out.push({ x: cx + start + (w - 1) / 2, y, z: cz + j, w, h, d: 1, c, glow });
        start = null;
      }
    }
  }
  return out;
}

/** A blocky sphere: centre (cx, cy, cz), radius r. */
export function sphere(cx: number, cy: number, cz: number, r: number, c: string, glow?: boolean): Box[] {
  const out: Box[] = [];
  const n = Math.ceil(r);
  for (let k = -n; k <= n; k++) {
    for (let j = -n; j <= n; j++) {
      let start: number | null = null;
      for (let i = -n; i <= n + 1; i++) {
        const inside = i <= n && i * i + j * j + k * k <= r * r + 0.25;
        if (inside && start === null) start = i;
        if (!inside && start !== null) {
          const w = i - start;
          out.push({ x: cx + start + w / 2 - 0.5, y: cy + j - 0.5, z: cz + k, w, h: 1, d: 1, c, glow });
          start = null;
        }
      }
    }
  }
  return out;
}

export interface VoxelGeometry {
  solid: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
}

const unitBox = new THREE.BoxGeometry(1, 1, 1);

function merge(boxes: readonly Box[], jitter: number): THREE.BufferGeometry | null {
  if (!boxes.length) return null;
  const parts = boxes.map((b, i) => {
    const w = b.w ?? 1;
    const h = b.h ?? 1;
    const d = b.d ?? 1;
    const g = unitBox.clone();
    g.deleteAttribute('uv');
    g.scale(w, h, d);
    g.translate(b.x, b.y + h / 2, b.z);
    // a few percent of brightness variation per block: the pixel-art feel of the Craft textures
    const k = 1 + (hash2(Math.round(b.x * 4), Math.round(b.z * 4) + i, Math.round(b.y * 4)) - 0.5) * 2 * jitter;
    const col = new THREE.Color(b.c);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let v = 0; v < arr.length; v += 3) {
      arr[v] = Math.min(1, col.r * k);
      arr[v + 1] = Math.min(1, col.g * k);
      arr[v + 2] = Math.min(1, col.b * k);
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return merged;
}

function buildVoxelGeometry(boxes: readonly Box[], jitter = 0.025): VoxelGeometry {
  return { solid: merge(boxes.filter((b) => !b.glow), jitter), glow: merge(boxes.filter((b) => b.glow), 0) };
}

export interface VoxelModel {
  get(): VoxelGeometry;
}

/** Declares a structure. The boxes are built (and merged) the first time it is drawn, then shared by every copy. */
export function defineModel(build: () => Box[], jitter = 0.025): VoxelModel {
  let cache: VoxelGeometry | null = null;
  return { get: () => (cache ??= buildVoxelGeometry(build(), jitter)) };
}

// Lambert, not Standard: matte blocks need no specular or PBR work, and it is the cheaper shader on every pixel.
export const voxelMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
export const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });

type GroupProps = ThreeElements['group'];

/** One copy of a model. Forwards a ref to the group, so a part of a structure (a sail, a wing) can be animated. */
export const Voxel = forwardRef<THREE.Group, { model: VoxelModel } & GroupProps>(function Voxel({ model, ...group }, ref) {
  const geo = useMemo(() => model.get(), [model]);
  return (
    <group ref={ref} {...group}>
      {geo.solid && <mesh geometry={geo.solid} material={voxelMaterial} />}
      {geo.glow && <mesh geometry={geo.glow} material={glowMaterial} />}
    </group>
  );
});

export interface Spot {
  x: number;
  y: number;
  z: number;
  /** Rotation about the vertical axis, radians. */
  ry?: number;
  /** Uniform scale. */
  s?: number;
}

/** Many copies of one model in a single draw call (trees, cacti, pots, shells...). */
export function VoxelInstances({ model, items }: { model: VoxelModel; items: readonly Spot[] }) {
  const geo = useMemo(() => model.get(), [model]);
  const solid = useRef<THREE.InstancedMesh>(null);
  const glow = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const sc = new THREE.Vector3();
    for (const mesh of [solid.current, glow.current]) {
      if (!mesh) continue;
      items.forEach((it, i) => {
        q.setFromAxisAngle(up, it.ry ?? 0);
        const s = it.s ?? 1;
        m.compose(p.set(it.x, it.y, it.z), q, sc.set(s, s, s));
        mesh.setMatrixAt(i, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }, [items, geo]);
  if (!items.length) return null;
  return (
    <>
      {geo.solid && <instancedMesh key={`s${items.length}`} ref={solid} args={[geo.solid, voxelMaterial, items.length]} />}
      {geo.glow && <instancedMesh key={`g${items.length}`} ref={glow} args={[geo.glow, glowMaterial, items.length]} />}
    </>
  );
}

export interface Placement {
  model: VoxelModel;
  items: readonly Spot[];
}

/**
 * Bakes every placed copy of every model into ONE solid and ONE glow geometry: all of a zone's static props cost two draw
 * calls however many there are. Use it for everything that does not move; animate the few things that do as <Voxel/>s.
 */
function bake(parts: readonly Placement[]): VoxelGeometry {
  const solid: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  for (const { model, items } of parts) {
    const g = model.get();
    for (const it of items) {
      m.compose(p.set(it.x, it.y, it.z), q.setFromAxisAngle(up, it.ry ?? 0), sc.setScalar(it.s ?? 1));
      if (g.solid) solid.push(g.solid.clone().applyMatrix4(m));
      if (g.glow) glow.push(g.glow.clone().applyMatrix4(m));
    }
  }
  const out = { solid: solid.length ? mergeGeometries(solid, false) : null, glow: glow.length ? mergeGeometries(glow, false) : null };
  for (const g of [...solid, ...glow]) g.dispose();
  return out;
}

/** The baked geometry of a list of placed models, as two meshes. `parts` should be memoised by the caller. */
export function Baked({ parts }: { parts: readonly Placement[] }) {
  const geo = useMemo(() => bake(parts), [parts]);
  useEffect(
    () => () => {
      geo.solid?.dispose();
      geo.glow?.dispose();
    },
    [geo]
  );
  return (
    <>
      {geo.solid && <mesh geometry={geo.solid} material={voxelMaterial} />}
      {geo.glow && <mesh geometry={geo.glow} material={glowMaterial} />}
    </>
  );
}
