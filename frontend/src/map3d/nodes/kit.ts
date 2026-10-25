import * as THREE from 'three';
import type { NodeState, ZoneKey } from '../schema';
import { box, defineModel } from '../voxel';
import type { Box, VoxelModel } from '../voxel';

// Building blocks the level pads and boss arenas share: the zone palettes, round slabs on a block grid, pixel sprites, the
// level number plaque and the padlock. Every function returns plain Box lists; pad.ts / arena.ts turn them into models.

const tmp = new THREE.Color();
const hsl = { h: 0, s: 0, l: 0 };

export const GOLD = '#f2c230';

/** The locked look of a colour: the same hue as dim, grey stone. */
function dull(c: string, sat = 0.3, light = 0.85) {
  tmp.set(c).getHSL(hsl, THREE.SRGBColorSpace);
  return `#${tmp.setHSL(hsl.h, hsl.s * sat, hsl.l * light, THREE.SRGBColorSpace).getHexString()}`;
}

export const shade = (c: string, k: number) => `#${tmp.set(c).multiplyScalar(k).getHexString()}`;

// ---- palettes ---------------------------------------------------------------------------------------------------

// Each zone's own materials (sandstone, terracotta and cream, dock planks, violet metal, mossy stone) and its accent colour
// (the boss arena's ring and banners).
const NATIVE: Record<ZoneKey, { base: string; top: string; top2: string; accent: string }> = {
  desert: { base: '#b08a55', top: '#e8c98a', top2: '#dcbc7c', accent: '#2aa198' },
  souq: { base: '#a8402f', top: '#c4533f', top2: '#f1dfc0', accent: '#d8453a' },
  corniche: { base: '#6e4520', top: '#9c6b36', top2: '#8a5a2b', accent: '#3f64b8' },
  observatory: { base: '#463586', top: '#8d72d4', top2: '#7b60c4', accent: '#a98bf0' },
  falcon: { base: '#6f7378', top: '#9da1a6', top2: '#8f9398', accent: '#5f9a58' },
};

export interface Look {
  base: string;
  top: string;
  top2: string;
  /** The ring round the top: gold when playable or done, stone when locked. */
  rim: string;
  accent: string;
}

/** The zone's colours for one state: bright with a gold rim (playable), green and gold (done), grey stone (locked). */
export function look(zone: ZoneKey, state: NodeState): Look {
  const n = NATIVE[zone];
  if (state === 'unlocked') return { ...n, rim: '#ffd23a' };
  if (state === 'completed') return { base: '#2a7a4d', top: '#5cc98a', top2: '#4fba7b', rim: GOLD, accent: GOLD };
  return { base: dull(n.base), top: dull(n.top), top2: dull(n.top2), rim: dull(n.top, 0.25, 0.7), accent: dull(n.accent) };
}

const models = new Map<string, VoxelModel>();

/** One model per key, built the first time it is drawn: pads of the same zone and state share their geometry. */
export function modelFor(key: string, build: () => Box[]): VoxelModel {
  let m = models.get(key);
  if (!m) models.set(key, (m = defineModel(build)));
  return m;
}

// ---- shapes -----------------------------------------------------------------------------------------------------

/** A round slab of radius `r` centred on the origin, one box per row of `cell`-sized blocks. A row's colour may vary. */
export function slab(r: number, cell: number, y: number, h: number, color: string | ((row: number) => string)): Box[] {
  const out: Box[] = [];
  const n = Math.floor(r / cell + 0.5);
  for (let j = -n; j < n; j++) {
    const z = (j + 0.5) * cell;
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - z * z)) / cell + 0.5);
    if (half > 0) out.push(box(0, y, z, 2 * half * cell, h, cell, typeof color === 'string' ? color : color(j)));
  }
  return out;
}

/**
 * Pixel art standing in the xy plane, facing +z. `rows` run top to bottom ('.' is empty, other characters look up `colors`);
 * (x, y) is the middle of its bottom edge and z the middle of its depth `d`. Runs of one colour become one box. `edge` adds
 * a dark outline behind it, one box per row.
 */
export function pixels(rows: readonly string[], cell: number, x: number, y: number, z: number, d: number, colors: Record<string, string>, glow = false, edge?: string): Box[] {
  const out: Box[] = [];
  const left = x - (rows[0].length * cell) / 2;
  const o = cell * 0.4;
  rows.forEach((row, r) => {
    const by = y + (rows.length - 1 - r) * cell;
    for (let i = 0, start = -1; i <= row.length; i++) {
      const ch = i < row.length ? row[i] : '.';
      if (start >= 0 && ch !== row[start]) {
        out.push(box(left + ((start + i) / 2) * cell, by, z, (i - start) * cell, cell, d, colors[row[start]], glow));
        start = -1;
      }
      if (start < 0 && colors[ch]) start = i;
    }
    const first = row.search(/[^.]/);
    if (edge && first >= 0) {
      const last = row.search(/[^.]\.*$/);
      out.push(box(left + ((first + last + 1) / 2) * cell, by - o, z - d, (last - first + 1) * cell + 2 * o, cell + 2 * o, d, edge, glow));
    }
  });
  return out;
}

// ---- level number -----------------------------------------------------------------------------------------------

const FONT: Record<string, readonly string[]> = {
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '..#', '..#'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
};

/** The level number on a small standing plate (bottom middle at (0, y, z)), in the 3x5 pixel font. */
export function plaque(n: number, cell: number, y: number, z: number, face: string, plate: string): Box[] {
  const rows = FONT['0'].map((_, r) => [...String(n)].map((ch) => FONT[ch][r]).join('.'));
  const m = cell * 0.6;
  return [box(0, y, z, rows[0].length * cell + 2 * m, rows.length * cell + 2 * m, 0.3, plate), ...pixels(rows, cell, 0, y + m, z + 0.2, 0.2, { '#': face })];
}

// ---- padlock ----------------------------------------------------------------------------------------------------

/** A padlock `2.5 * s` blocks tall, facing +z, standing on y. */
export function padlock(y: number, z: number, s: number, body: string, shackle: string): Box[] {
  return [
    box(0, y, z, 2 * s, 1.4 * s, 0.9 * s, body),
    box(0, y + 0.4 * s, z + 0.45 * s, 0.3 * s, 0.7 * s, 0.1 * s, '#241b0c'), // keyhole
    box(-0.6 * s, y + 1.4 * s, z, 0.4 * s, 0.7 * s, 0.5 * s, shackle),
    box(0.6 * s, y + 1.4 * s, z, 0.4 * s, 0.7 * s, 0.5 * s, shackle),
    box(0, y + 2.1 * s, z, 1.6 * s, 0.4 * s, 0.5 * s, shackle),
  ];
}
