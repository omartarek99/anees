import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { clamp, hash2 } from './math';
import { groundHeight } from './ground';
import { MAP_BOUNDS } from './layout';
import { voxelMaterial } from './voxel';
import type { MapZone } from './schema';

// Blocky terrain: one column per block, a top face plus the side faces that show where a neighbour is lower (at most two
// quads per face: a half-block edge band and the body below it). One merged mesh per zone, without normals (the material is
// flat-shaded), so it stays small and is culled when the zone is far.

export type TopColor = (x: number, z: number, height: number) => string;
/** `topHex` is the column's own top colour; `depth` is how far below the surface this layer is (0 = the first layer). */
export type SideColor = (x: number, z: number, depth: number, topHex: string) => string;

const SKIRT = -8; // beyond the map's edge the ground drops away to here, so there is never a see-through gap

// Colour softening: the weights of a 3x3 blend (they sum to 1), and the little per-block brightness variation left on top.
const SOFT_CENTRE = 0.34;
const SOFT_EDGE = 0.12;
const SOFT_CORNER = 0.045;
const JITTER = 0.03;

const colorCache = new Map<string, THREE.Color>();
const toColor = (hex: string) => {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
};

const defaultSide: SideColor = (_x, _z, depth, topHex) => {
  const c = toColor(topHex).clone();
  const k = depth < 0.5 ? 0.82 : Math.max(0.42, 0.66 - depth * 0.04);
  return `#${c.multiplyScalar(k).getHexString()}`;
};

interface Opts {
  zone: MapZone;
  top: TopColor;
  side?: SideColor;
  /** Extra blocks of ground either side of the playable strip (default 10). */
  pad?: number;
  /** Height function; the final carved ground by default. */
  height?: (x: number, z: number) => number;
}

function buildHeightfieldGeometry({ zone, top, side = defaultSide, pad = 10, height = groundHeight }: Opts): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const x0 = Math.floor(zone.x0 - pad);
  const x1 = Math.ceil(zone.x1 + pad);
  const z0 = zone.z0;
  const z1 = zone.z1;

  const quad = (a: number[], b: number[], c: number[], d: number[], rgb: THREE.Color, k: number) => {
    for (const v of [a, b, c, a, c, d]) {
      pos.push(v[0], v[1], v[2]);
      col.push(Math.min(1, rgb.r * k), Math.min(1, rgb.g * k), Math.min(1, rgb.b * k));
    }
  };

  // Every column's height, once (a height query searches the road): the zone plus one row either side for the neighbours
  // across its seams. Past the map's outer edge the ground drops away to the skirt.
  const cols = x1 - x0;
  const hs = new Float32Array(cols * (z1 - z0 + 2));
  for (let r = 0; r < z1 - z0 + 2; r++) {
    const iz = z0 - 1 + r;
    for (let c = 0; c < cols; c++) hs[r * cols + c] = iz < MAP_BOUNDS.z0 || iz >= MAP_BOUNDS.z1 ? SKIRT : height(x0 + c + 0.5, iz + 0.5);
  }
  const hAt = (ix: number, iz: number) => (ix < x0 || ix >= x1 ? SKIRT : hs[(iz - z0 + 1) * cols + (ix - x0)]);

  // Each column's own top colour, then softened: blended with its neighbours so the sand, grass and snow melt into each other
  // instead of speckling block by block (the heights stay stepped, that is the voxel look).
  const rows = z1 - z0;
  const own = new Float32Array(cols * rows * 3);
  for (let iz = z0; iz < z1; iz++) {
    for (let ix = x0; ix < x1; ix++) {
      const c = toColor(top(ix + 0.5, iz + 0.5, hAt(ix, iz)));
      const o = ((iz - z0) * cols + (ix - x0)) * 3;
      own[o] = c.r;
      own[o + 1] = c.g;
      own[o + 2] = c.b;
    }
  }
  const soft = new Float32Array(own.length);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const w = dr === 0 && dc === 0 ? SOFT_CENTRE : dr === 0 || dc === 0 ? SOFT_EDGE : SOFT_CORNER;
            sum += w * own[(clamp(r + dr, 0, rows - 1) * cols + clamp(c + dc, 0, cols - 1)) * 3 + ch];
          }
        }
        soft[(r * cols + c) * 3 + ch] = sum;
      }
    }
  }
  const blended = new THREE.Color();

  for (let iz = z0; iz < z1; iz++) {
    for (let ix = x0; ix < x1; ix++) {
      const cx = ix + 0.5;
      const cz = iz + 0.5;
      const y = hAt(ix, iz);
      const o = ((iz - z0) * cols + (ix - x0)) * 3;
      const rgb = blended.setRGB(soft[o], soft[o + 1], soft[o + 2]);
      const topHex = `#${rgb.getHexString()}`;
      const k = 1 + (hash2(ix, iz, 7) - 0.5) * JITTER;
      quad([ix, y, iz + 1], [ix + 1, y, iz + 1], [ix + 1, y, iz], [ix, y, iz], rgb, k);

      // sides, only where the neighbour is lower: an edge band, then the body down to the neighbour
      const faces: { low: number; corner: (y0: number, y1: number) => number[][] }[] = [
        { low: hAt(ix + 1, iz), corner: (y0, y1) => [[ix + 1, y0, iz + 1], [ix + 1, y0, iz], [ix + 1, y1, iz], [ix + 1, y1, iz + 1]] },
        { low: hAt(ix - 1, iz), corner: (y0, y1) => [[ix, y0, iz], [ix, y0, iz + 1], [ix, y1, iz + 1], [ix, y1, iz]] },
        { low: hAt(ix, iz + 1), corner: (y0, y1) => [[ix, y0, iz + 1], [ix + 1, y0, iz + 1], [ix + 1, y1, iz + 1], [ix, y1, iz + 1]] },
        { low: hAt(ix, iz - 1), corner: (y0, y1) => [[ix + 1, y0, iz], [ix, y0, iz], [ix, y1, iz], [ix + 1, y1, iz]] },
      ];
      for (const f of faces) {
        if (f.low >= y) continue;
        const band = Math.max(f.low, y - 0.5);
        let c = f.corner(band, y);
        quad(c[0], c[1], c[2], c[3], toColor(side(cx, cz, 0, topHex)), k);
        if (band > f.low) {
          c = f.corner(f.low, band);
          quad(c[0], c[1], c[2], c[3], toColor(side(cx, cz, 0.5, topHex)), k);
        }
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/** A zone's blocky ground. `top` colours each column from its position and height; `side` (optional) the faces below. */
export function HeightfieldTerrain({ zone, top, side, pad }: { zone: MapZone; top: TopColor; side?: SideColor; pad?: number }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const geometry = useMemo(() => buildHeightfieldGeometry({ zone, top, side, pad }), [zone]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} material={voxelMaterial} />;
}
