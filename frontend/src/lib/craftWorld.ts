export const WORLD_X = 56;
export const WORLD_Y = 26;
export const WORLD_Z = 56;

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const WOOD = 4;
export const LEAVES = 5;
export const RUNE = 6;
export const RUNEBLOCK = 7;
export const BEDROCK = 8;
// A tool, not a world block — never appears in generated terrain or the placeable instancing
// list. It only ever lives in inventory/hotbar slots.
export const AXE = 9;

export const TILE_INFO: Record<number, { mineMs: number; nameKey: string }> = {
  [GRASS]: { mineMs: 180, nameKey: 'craft.tileGrass' },
  [DIRT]: { mineMs: 170, nameKey: 'craft.tileDirt' },
  [STONE]: { mineMs: 520, nameKey: 'craft.tileStone' },
  [WOOD]: { mineMs: 260, nameKey: 'craft.tileWood' },
  [LEAVES]: { mineMs: 110, nameKey: 'craft.tileLeaves' },
  [RUNE]: { mineMs: 700, nameKey: 'craft.tileRune' },
  [RUNEBLOCK]: { mineMs: 200, nameKey: 'craft.tileRuneBrick' },
  [BEDROCK]: { mineMs: Infinity, nameKey: 'craft.tileBedrock' },
  [AXE]: { mineMs: Infinity, nameKey: 'craft.tileAxe' },
};

/** How much faster wood/leaves mine while the axe is the selected hotbar slot (and the
 * player owns at least one). 0.4 = 60% faster, i.e. takes 40% of the normal time. */
export const AXE_CHOP_MULTIPLIER = 0.4;
/** Wood cost to craft one axe. */
export const AXE_RECIPE_WOOD_COST = 3;

/** Placeable inventory tiles plus the axe tool, in hotbar order. */
export const HOTBAR_ORDER = [GRASS, DIRT, STONE, WOOD, LEAVES, RUNEBLOCK, AXE];

function mulberry32(seed: number) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type CraftWorld = { tiles: Uint8Array; heightMap: Int16Array };

export function idx(x: number, y: number, z: number): number {
  return (y * WORLD_Z + z) * WORLD_X + x;
}

/** Any out-of-bounds coordinate reads as air — callers apply their own boundary rules on top. */
export function getTile(world: CraftWorld, x: number, y: number, z: number): number {
  if (x < 0 || x >= WORLD_X || y < 0 || y >= WORLD_Y || z < 0 || z >= WORLD_Z) return AIR;
  return world.tiles[idx(x, y, z)];
}
function setTile(world: CraftWorld, x: number, y: number, z: number, v: number) {
  if (x < 0 || x >= WORLD_X || y < 0 || y >= WORLD_Y || z < 0 || z >= WORLD_Z) return;
  world.tiles[idx(x, y, z)] = v;
}

export function genWorld(seed: number): CraftWorld {
  const rng = mulberry32(seed);
  const tiles = new Uint8Array(WORLD_X * WORLD_Y * WORLD_Z);
  const heightMap = new Int16Array(WORLD_X * WORLD_Z);
  const world: CraftWorld = { tiles, heightMap };
  const base = 13;

  const octaves = Array.from({ length: 4 }, () => ({
    amp: 1.5 + rng() * 2.5,
    fx: 0.02 + rng() * 0.05,
    fz: 0.02 + rng() * 0.05,
    px: rng() * 1000,
    pz: rng() * 1000,
  }));
  function heightAt(x: number, z: number): number {
    let h = base;
    for (const o of octaves) h += o.amp * Math.sin(x * o.fx + o.px) * Math.sin(z * o.fz + o.pz);
    return Math.max(6, Math.min(WORLD_Y - 10, Math.round(h)));
  }

  for (let z = 0; z < WORLD_Z; z++) {
    for (let x = 0; x < WORLD_X; x++) {
      const h = heightAt(x, z);
      heightMap[z * WORLD_X + x] = h;
      for (let y = 0; y < WORLD_Y; y++) {
        let id: number;
        if (y === 0) id = BEDROCK;
        else if (y < h - 4) id = STONE;
        else if (y < h) id = DIRT;
        else if (y === h) id = GRASS;
        else id = AIR;
        tiles[idx(x, y, z)] = id;
      }
    }
  }

  const caveCount = Math.floor((WORLD_X * WORLD_Z) / 260);
  for (let c = 0; c < caveCount; c++) {
    let cx = 3 + Math.floor(rng() * (WORLD_X - 6));
    let cz = 3 + Math.floor(rng() * (WORLD_Z - 6));
    let cy = 2 + Math.floor(rng() * (heightMap[cz * WORLD_X + cx] - 5));
    const steps = 25 + Math.floor(rng() * 45);
    for (let s = 0; s < steps; s++) {
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++)
          for (let dy = -1; dy <= 1; dy++) {
            if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 2) setTile(world, cx + dx, cy + dy, cz + dz, AIR);
          }
      const dir = Math.floor(rng() * 6);
      if (dir === 0) cx++;
      else if (dir === 1) cx--;
      else if (dir === 2) cz++;
      else if (dir === 3) cz--;
      else if (dir === 4) cy++;
      else cy--;
      cx = Math.max(2, Math.min(WORLD_X - 3, cx));
      cz = Math.max(2, Math.min(WORLD_Z - 3, cz));
      cy = Math.max(2, Math.min(heightMap[cz * WORLD_X + cx] - 3, cy));
    }
  }

  for (let z = 0; z < WORLD_Z; z++) {
    for (let x = 0; x < WORLD_X; x++) {
      const h = heightMap[z * WORLD_X + x];
      for (let y = 1; y < h - 6; y++) {
        if (tiles[idx(x, y, z)] === STONE && rng() < 0.004) tiles[idx(x, y, z)] = RUNE;
      }
    }
  }

  let lastTreeX = -99;
  let lastTreeZ = -99;
  for (let z = 2; z < WORLD_Z - 2; z++) {
    for (let x = 2; x < WORLD_X - 2; x++) {
      const dist2 = (x - lastTreeX) ** 2 + (z - lastTreeZ) ** 2;
      const h = heightMap[z * WORLD_X + x];
      if (dist2 > 25 && rng() < 0.01 && tiles[idx(x, h, z)] === GRASS) {
        const trunk = 3 + Math.floor(rng() * 3);
        for (let ty = 1; ty <= trunk; ty++) setTile(world, x, h + ty, z, WOOD);
        const topY = h + trunk;
        for (let dx = -2; dx <= 2; dx++)
          for (let dz = -2; dz <= 2; dz++)
            for (let dy = -1; dy <= 1; dy++) {
              if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 3 && getTile(world, x + dx, topY + dy, z + dz) === AIR) {
                setTile(world, x + dx, topY + dy, z + dz, LEAVES);
              }
            }
        lastTreeX = x;
        lastTreeZ = z;
      }
    }
  }

  return world;
}

export function spawnPoint(world: CraftWorld): { x: number; y: number; z: number } {
  const sx = Math.floor(WORLD_X / 2);
  const sz = Math.floor(WORLD_Z / 2);
  return { x: sx + 0.5, y: world.heightMap[sz * WORLD_X + sx] + 3, z: sz + 0.5 };
}
