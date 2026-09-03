// -------------------------------------------------------------------------------------------
// The Builder's Quarry world — an endless, chunk-streamed voxel world.
//
// Terrain is a *pure function* of (seed, x, y, z) via `baseTileAt`, so any voxel can be read
// without generating anything. `ChunkWorld` caches 16-wide columns as Uint8Arrays purely to
// make re-meshing after an edit cheap, and holds the sparse `diff` map of player edits (the
// only thing that gets persisted alongside the seed).
// -------------------------------------------------------------------------------------------

export const CHUNK = 16;
export const WORLD_Y = 64;

// ---- block ids (0 = air) ---------------------------------------------------------------------
export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const WOOD = 4;
export const LEAVES = 5;
export const RUNE = 6; // math-puzzle block — unbreakable until solved
export const RUNEBLOCK = 7; // "rune brick" reward block
export const BEDROCK = 8;
export const COBBLE = 9;
export const PLANKS = 10;
export const SAND = 11;
export const GRAVEL = 12;
export const GLASS = 13;
export const DEEPSLATE = 14;
export const COAL_ORE = 15;
export const IRON_ORE = 16;
export const GOLD_ORE = 17;
export const REDSTONE_ORE = 18;
export const LAPIS_ORE = 19;
export const DIAMOND_ORE = 20;
export const EMERALD_ORE = 21;
export const GLOWSTONE = 22;
export const CRAFTING_TABLE = 23;
export const FURNACE = 24;
export const TORCH = 25;
export const SNOW = 26;
export const WHEAT_CROP = 27;

export const MAX_BLOCK = 27;

/** Blocks a placement/mesh treats as see-through for neighbour face culling. */
export const TRANSPARENT = new Set<number>([AIR, GLASS, TORCH, WHEAT_CROP]);
/** Blocks the player can walk through. */
export const NON_SOLID = new Set<number>([AIR, TORCH, WHEAT_CROP]);

// ---- integer hash noise -------------------------------------------------------------------
function hash2(seed: number, x: number, y: number): number {
  let h = (seed | 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function hash3(seed: number, x: number, y: number, z: number): number {
  let h = (seed | 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 9), 2654435761);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function valueNoise2(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const n00 = hash2(seed, x0, y0);
  const n10 = hash2(seed, x0 + 1, y0);
  const n01 = hash2(seed, x0, y0 + 1);
  const n11 = hash2(seed, x0 + 1, y0 + 1);
  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
}
function valueNoise3(seed: number, x: number, y: number, z: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const fz = smooth(z - z0);
  const c = (dx: number, dy: number, dz: number) => hash3(seed, x0 + dx, y0 + dy, z0 + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), fx);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), fx);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), fx);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}
function fbm2(seed: number, x: number, y: number, octaves: number, freq: number): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = freq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(seed + i * 1013, x * f, y * f);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

// ---- terrain ----------------------------------------------------------------------------------
export type Biome = 'plains' | 'forest' | 'desert' | 'snowy';

export function biomeAt(seed: number, x: number, z: number): Biome {
  const b = fbm2(seed + 77, x, z, 2, 0.006);
  const t = fbm2(seed + 191, x, z, 2, 0.004);
  if (b < 0.36) return 'desert';
  if (t > 0.62) return 'snowy';
  if (b > 0.64) return 'forest';
  return 'plains';
}

const BASE_HEIGHT = 30;

export function surfaceHeight(seed: number, x: number, z: number): number {
  const rolling = (fbm2(seed, x, z, 4, 0.018) - 0.5) * 18;
  const hills = Math.pow(Math.max(0, fbm2(seed + 5, x, z, 2, 0.05) - 0.5), 1.5) * 26;
  const h = Math.round(BASE_HEIGHT + rolling + hills);
  return Math.max(8, Math.min(WORLD_Y - 12, h));
}

function caveAt(seed: number, x: number, y: number, z: number): boolean {
  if (y < 4 || y > WORLD_Y - 6) return false;
  const n = valueNoise3(seed + 909, x * 0.09, y * 0.13, z * 0.09);
  const n2 = valueNoise3(seed + 313, x * 0.05, y * 0.07, z * 0.05);
  return n > 0.79 || (n > 0.7 && n2 > 0.62);
}

type OreDef = { id: number; minY: number; maxY: number; freq: number; thresh: number; salt: number };
const ORES: OreDef[] = [
  { id: COAL_ORE, minY: 6, maxY: 52, freq: 0.11, thresh: 0.86, salt: 11 },
  { id: IRON_ORE, minY: 4, maxY: 44, freq: 0.13, thresh: 0.9, salt: 22 },
  { id: GOLD_ORE, minY: 3, maxY: 26, freq: 0.15, thresh: 0.9, salt: 33 },
  { id: REDSTONE_ORE, minY: 3, maxY: 22, freq: 0.14, thresh: 0.885, salt: 44 },
  { id: LAPIS_ORE, minY: 3, maxY: 24, freq: 0.16, thresh: 0.9, salt: 55 },
  { id: DIAMOND_ORE, minY: 2, maxY: 15, freq: 0.17, thresh: 0.9, salt: 66 },
  { id: EMERALD_ORE, minY: 2, maxY: 13, freq: 0.2, thresh: 0.915, salt: 77 },
];

function oreAt(seed: number, x: number, y: number, z: number, deep: boolean): number {
  for (const o of ORES) {
    if (y < o.minY || y > o.maxY) continue;
    const n = valueNoise3(seed + o.salt, x * o.freq, y * o.freq, z * o.freq);
    if (n > o.thresh) return o.id;
  }
  // glowstone: rare deep sparkle
  if (deep && y < 18 && hash3(seed + 88, x, y, z) > 0.9975) return GLOWSTONE;
  return 0;
}

/** Deterministic trees: a tree "origin" sits at (tx,tz) when its column hashes below the biome
 * threshold. Trunk is kept ≥3 from a chunk edge and leaves within radius 2, so a tree never
 * straddles a chunk boundary. */
function treeBlockAt(seed: number, x: number, y: number, z: number, biome: Biome): number {
  if (biome === 'desert' || biome === 'snowy') {
    // sparse: no trees in desert; snowy handled as plains-lite below
    if (biome === 'desert') return 0;
  }
  const density = biome === 'forest' ? 0.045 : biome === 'snowy' ? 0.012 : 0.02;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const tx = x + dx;
      const tz = z + dz;
      const lx = ((tx % CHUNK) + CHUNK) % CHUNK;
      const lz = ((tz % CHUNK) + CHUNK) % CHUNK;
      if (lx < 3 || lx > CHUNK - 3 || lz < 3 || lz > CHUNK - 3) continue;
      if (hash2(seed + 404, tx, tz) > density) continue;
      const th = surfaceHeight(seed, tx, tz);
      if (th < 12) continue;
      const trunk = 3 + Math.floor(hash2(seed + 405, tx, tz) * 3); // 3..5
      // trunk
      if (dx === 0 && dz === 0 && y > th && y <= th + trunk) return WOOD;
      // leaves: a blob around th+trunk
      const topY = th + trunk;
      const dy = y - topY;
      if (dy >= -1 && dy <= 1 && Math.abs(dx) + Math.abs(dz) + Math.abs(dy) <= 3) {
        if (!(dx === 0 && dz === 0 && dy <= 0)) return LEAVES;
      }
    }
  }
  return 0;
}

/** The one source of truth for base terrain. Pure — no world state. */
export function baseTileAt(seed: number, x: number, y: number, z: number): number {
  if (y < 0 || y >= WORLD_Y) return AIR;
  if (y === 0) return BEDROCK;
  if (y <= 2 && hash3(seed + 1, x, y, z) < 0.55 - y * 0.18) return BEDROCK;

  const h = surfaceHeight(seed, x, z);
  const biome = biomeAt(seed, x, z);

  if (y > h) {
    const tree = treeBlockAt(seed, x, y, z, biome);
    if (tree) return tree;
    // wheat crop occasionally just above plains grass
    if (y === h + 1 && biome === 'plains' && hash2(seed + 611, x, z) > 0.985) return WHEAT_CROP;
    return AIR;
  }

  // carve caves (but keep a solid crust near the surface)
  if (y < h - 1 && caveAt(seed, x, y, z)) return AIR;

  const deep = y < h - 4;
  if (deep) {
    // math-puzzle rune blocks — sprinkled through the stone, the Quarry's XP hook
    if (y > 3 && y < h - 6 && hash3(seed + 99, x, y, z) > 0.9968) return RUNE;
    const ore = oreAt(seed, x, y, z, y < 20);
    if (ore) return ore;
    return y < 6 ? DEEPSLATE : STONE;
  }

  // surface + subsurface
  const desert = biome === 'desert';
  const snowy = biome === 'snowy';
  if (y === h) {
    if (desert) return SAND;
    if (snowy) return SNOW;
    return GRASS;
  }
  // 1..3 below surface
  if (desert) return SAND;
  return y > h - 3 && hash3(seed + 2, x, y, z) > 0.86 ? GRAVEL : DIRT;
}

// ---- chunk world (render cache + edits) --------------------------------------------------
export type ChunkWorld = {
  seed: number;
  chunks: Map<string, Uint8Array>;
  diff: Map<string, number>;
};

export const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;
export const lidx = (lx: number, y: number, lz: number) => (y * CHUNK + lz) * CHUNK + lx;
export const worldKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
export const chunkCoord = (v: number) => Math.floor(v / CHUNK);

export function makeWorld(seed: number, diff?: Map<string, number>): ChunkWorld {
  return { seed, chunks: new Map(), diff: diff ?? new Map() };
}

/** Cache (generating if needed) the base terrain for a chunk. Diffs are NOT baked in. */
export function ensureChunk(world: ChunkWorld, cx: number, cz: number): Uint8Array {
  const key = chunkKey(cx, cz);
  let c = world.chunks.get(key);
  if (c) return c;
  c = new Uint8Array(CHUNK * WORLD_Y * CHUNK);
  const ox = cx * CHUNK;
  const oz = cz * CHUNK;
  for (let lz = 0; lz < CHUNK; lz++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      const wx = ox + lx;
      const wz = oz + lz;
      for (let y = 0; y < WORLD_Y; y++) {
        c[lidx(lx, y, lz)] = baseTileAt(world.seed, wx, y, wz);
      }
    }
  }
  world.chunks.set(key, c);
  return c;
}

export function dropChunk(world: ChunkWorld, cx: number, cz: number): void {
  world.chunks.delete(chunkKey(cx, cz));
}

/** Read any voxel: a player edit wins, else the pure base terrain (no chunk needed). */
export function getTile(world: ChunkWorld, x: number, y: number, z: number): number {
  if (y < 0) return BEDROCK;
  if (y >= WORLD_Y) return AIR;
  const d = world.diff.get(worldKey(x, y, z));
  if (d !== undefined) return d;
  return baseTileAt(world.seed, x, y, z);
}

/** Write a voxel edit (into the diff and, if the chunk is cached, its array). */
export function setTile(world: ChunkWorld, x: number, y: number, z: number, id: number): void {
  if (y < 1 || y >= WORLD_Y) return;
  world.diff.set(worldKey(x, y, z), id);
  const c = world.chunks.get(chunkKey(chunkCoord(x), chunkCoord(z)));
  if (c) {
    const lx = ((x % CHUNK) + CHUNK) % CHUNK;
    const lz = ((z % CHUNK) + CHUNK) % CHUNK;
    c[lidx(lx, y, lz)] = id;
  }
}

export function isSolidTile(id: number): boolean {
  return id !== undefined && !NON_SOLID.has(id);
}

/** A safe standing spot near world origin (or near x,z). */
export function spawnPoint(world: ChunkWorld, x = 0.5, z = 0.5): { x: number; y: number; z: number } {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  for (let y = WORLD_Y - 2; y > 2; y--) {
    if (getTile(world, bx, y, bz) !== AIR) return { x, y: y + 1.02, z };
  }
  return { x, y: 40, z };
}
