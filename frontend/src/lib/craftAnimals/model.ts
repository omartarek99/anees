import * as THREE from 'three';
import type { Face, SpeciesSpec } from './types';
import { createPaint, faceRect } from './paint';
import { createRigMaterial, type Pose } from './rig';

// Turns a SpeciesSpec into GPU assets, once per species and lazily (the first animal of a kind builds it):
//   one merged BufferGeometry (every part, with the joint attributes the shader animates)
//   one small canvas atlas + one material per skin variant
// Every individual animal then shares them and costs a single draw call.

const CHAN = { walk: 1, flap: 2, idle: 3, tail: 4, graze: 5 } as const;
const AXIS = { x: 0, y: 1, z: 2 } as const;
/** THREE.BoxGeometry builds its faces in this order, 4 vertices each. */
const BOX_FACES: readonly Face[] = ['px', 'nx', 'top', 'bottom', 'front', 'back'];

export interface SpeciesAssets {
  spec: SpeciesSpec;
  geometry: THREE.BufferGeometry;
  /** one atlas per skin variant */
  textures: THREE.Texture[];
  /** horizontal half-extent of the model, blocks (for collision and hit tests) */
  radius: number;
  /** height of the model, blocks */
  height: number;
  dispose(): void;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function buildGeometry(spec: SpeciesSpec): { geometry: THREE.BufferGeometry; radius: number; height: number } {
  const unit = (spec.scale ?? 1) / 16;
  const [TW, TH] = spec.tex;
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const aJ: number[] = [];
  const aP: number[] = [];
  const idx: number[] = [];
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const m = new THREE.Matrix4();
  let radius = 0;
  let height = 0;

  for (const part of spec.parts) {
    const [w, h, d] = part.size;
    const g = new THREE.BoxGeometry(w * unit, h * unit, d * unit);
    // remap the box UVs onto this part's unwrap in the atlas
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let f = 0; f < 6; f++) {
      const r = faceRect(BOX_FACES[f], w, h, d);
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        const u0 = uv.getX(i);
        const v0 = uv.getY(i);
        const x = part.uv[0] + r.x + u0 * r.w;
        const y = part.uv[1] + r.y + (1 - v0) * r.h;
        uv.setXY(i, x / TW, 1 - y / TH);
      }
    }
    if (part.rot) {
      euler.set(part.rot[0], part.rot[1], part.rot[2], 'YXZ');
      g.applyMatrix4(m.makeRotationFromEuler(euler));
    }
    g.translate(part.at[0] * unit, part.at[1] * unit, part.at[2] * unit);

    const j = part.joint;
    const pivot = j ? (j.pivot ?? (j.chan === 'walk' ? [part.at[0], part.at[1] + h / 2, part.at[2]] : part.at)) : part.at;
    const jv = j ? [CHAN[j.chan], AXIS[j.axis], j.amp, j.phase ?? 0] : [0, 0, 0, 0];
    const pv = [pivot[0] * unit, pivot[1] * unit, pivot[2] * unit, j?.rest ?? 0];

    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uvs.push(uv.getX(i), uv.getY(i));
      aJ.push(jv[0], jv[1], jv[2], jv[3]);
      aP.push(pv[0], pv[1], pv[2], pv[3]);
      radius = Math.max(radius, Math.abs(p.getX(i)), Math.abs(p.getZ(i)));
      height = Math.max(height, p.getY(i));
    }
    const ix = g.getIndex()!;
    for (let i = 0; i < ix.count; i++) idx.push(base + ix.getX(i));
    g.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aJ', new THREE.Float32BufferAttribute(aJ, 4));
  geometry.setAttribute('aP', new THREE.Float32BufferAttribute(aP, 4));
  geometry.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geometry.computeBoundingSphere();
  // joints swing outside the rest pose: leave some slack so a limb never pops out of view at the edge
  geometry.boundingSphere!.radius += 0.35 * (spec.scale ?? 1);
  return { geometry, radius, height };
}

function paintAtlas(spec: SpeciesSpec, variant: number): THREE.CanvasTexture {
  const [TW, TH] = spec.tex;
  const canvas = document.createElement('canvas');
  canvas.width = TW;
  canvas.height = TH;
  const ctx = canvas.getContext('2d')!;
  const done = new Set<string>();
  spec.parts.forEach((part) => {
    const [w, h, d] = part.size;
    const key = `${part.uv[0]},${part.uv[1]},${w},${h},${d}`;
    if (done.has(key)) return;
    done.add(key);
    part.skin(createPaint(ctx, part.uv[0], part.uv[1], w, h, d, variant, hashString(`${spec.kind}|${key}|${variant}`)));
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function buildSpecies(spec: SpeciesSpec): SpeciesAssets {
  const { geometry, radius, height } = buildGeometry(spec);
  const textures: THREE.Texture[] = [];
  const variants = Math.max(1, spec.variants ?? 1);
  for (let v = 0; v < variants; v++) textures.push(paintAtlas(spec, v));
  return {
    spec,
    geometry,
    textures,
    radius,
    height,
    dispose() {
      geometry.dispose();
      textures.forEach((x) => x.dispose());
    },
  };
}

// ---- per-species cache (built lazily, freed with the game) ---------------------------------------
const cache = new Map<string, SpeciesAssets>();

export function getAssets(spec: SpeciesSpec): SpeciesAssets {
  let a = cache.get(spec.kind);
  if (!a) {
    a = buildSpecies(spec);
    cache.set(spec.kind, a);
  }
  return a;
}

export function disposeAllAssets(): void {
  cache.forEach((a) => a.dispose());
  cache.clear();
}

/** One animal: a single Mesh sharing the species' geometry and skin atlas, with its own material (and so its own pose). */
export function createAnimalMesh(assets: SpeciesAssets, variant: number): { mesh: THREE.Mesh; pose: Pose; dispose: () => void } {
  const v = Math.min(variant, assets.textures.length - 1);
  const { material, pose } = createRigMaterial(assets.textures[v], assets.spec.glow ?? 0);
  const mesh = new THREE.Mesh(assets.geometry, material);
  return { mesh, pose, dispose: () => material.dispose() };
}

// ---- authoring check: catches the mistakes that would silently ruin a skin ---------------------
/** Returns a list of problems with a species definition (empty = fine). Used by the dev preview and tests. */
export function validateSpecies(spec: SpeciesSpec): string[] {
  const issues: string[] = [];
  const [TW, TH] = spec.tex;
  const regions = new Map<string, { faces: { x: number; y: number; w: number; h: number }[]; part: number }>();
  spec.parts.forEach((p, i) => {
    const [w, h, d] = p.size;
    if (w <= 0 || h <= 0 || d <= 0) issues.push(`part ${i}: non-positive size`);
    const key = `${p.uv[0]},${p.uv[1]},${w},${h},${d}`;
    if (regions.has(key)) return;
    const faces = (['nx', 'front', 'px', 'back', 'top', 'bottom'] as Face[]).map((f) => {
      const r = faceRect(f, w, h, d);
      return { x: p.uv[0] + r.x, y: p.uv[1] + r.y, w: r.w, h: r.h };
    });
    faces.forEach((r) => {
      if (r.x < 0 || r.y < 0 || r.x + r.w > TW || r.y + r.h > TH) issues.push(`part ${i}: unwrap leaves the ${TW}x${TH} atlas (uv ${p.uv.join(',')}, size ${p.size.join('x')})`);
    });
    regions.set(key, { faces, part: i });
  });
  const list = [...regions.values()];
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      const clash = list[a].faces.some((fa) => list[b].faces.some((fb) => fa.x < fb.x + fb.w && fb.x < fa.x + fa.w && fa.y < fb.y + fb.h && fb.y < fa.y + fa.h));
      if (clash) issues.push(`parts ${list[a].part} and ${list[b].part} paint over each other in the atlas (different uv regions overlap, or same uv with a different size)`);
    }
  }
  if (spec.parts.length > 60) issues.push(`${spec.parts.length} parts: keep animals under ~40 boxes`);
  if (!spec.parts.length) issues.push('no parts');
  return issues;
}
