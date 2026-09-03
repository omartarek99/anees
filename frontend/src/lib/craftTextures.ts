import * as THREE from 'three';
import { GRASS, DIRT, STONE, WOOD, LEAVES, RUNE, RUNEBLOCK, BEDROCK } from './craftWorld';

// Procedurally-drawn 16x16 pixel-art block textures — the low resolution + nearest-neighbour
// magnification is what gives the quarry its blocky, Minecraft-like surface instead of the
// old flat single-colour faces. Everything is generated once on a canvas at load time; no
// image files ship with the app.

const TEX = 16;

/** Deterministic PRNG so every world/session draws identical textures. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Draw = (ctx: CanvasRenderingContext2D, rand: () => number) => void;

function makeTexture(seed: number, draw: Draw): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX;
  canvas.height = TEX;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, rng(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter; // crisp pixels up close
  tex.minFilter = THREE.NearestMipmapNearestFilter; // blocky but stable in the distance
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const px = (ctx: CanvasRenderingContext2D, x: number, y: number, c: string) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 1, 1);
};

/** Fill every pixel from a palette — the classic speckled dirt/stone look. */
function speckle(ctx: CanvasRenderingContext2D, rand: () => number, palette: string[]) {
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) px(ctx, x, y, palette[(rand() * palette.length) | 0]);
  }
}

/** Scatter n single-pixel grains from a palette on top. */
function grains(ctx: CanvasRenderingContext2D, rand: () => number, palette: string[], n: number) {
  for (let i = 0; i < n; i++) px(ctx, (rand() * TEX) | 0, (rand() * TEX) | 0, palette[(rand() * palette.length) | 0]);
}

const DIRT_PAL = ['#8a6244', '#7d5739', '#714d32', '#87603f', '#6c4a30'];

const drawDirt: Draw = (ctx, rand) => {
  speckle(ctx, rand, DIRT_PAL);
  grains(ctx, rand, ['#5c3f28', '#9c774f', '#523725'], 22);
};

const drawGrassTop: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#5f9e3b', '#6aab43', '#579237', '#74b64f', '#528b34']);
  grains(ctx, rand, ['#4c8230', '#83c35c', '#417026'], 26);
};

const drawGrassSide: Draw = (ctx, rand) => {
  speckle(ctx, rand, DIRT_PAL);
  const green = ['#5f9e3b', '#6aab43', '#579237', '#528b34'];
  for (let x = 0; x < TEX; x++) {
    const edge = 3 + (rand() < 0.5 ? 1 : 0) + (rand() < 0.25 ? 1 : 0); // 3..5 rows of turf
    for (let y = 0; y < edge; y++) px(ctx, x, y, green[(rand() * green.length) | 0]);
    if (rand() < 0.4) px(ctx, x, edge, green[(rand() * green.length) | 0]); // a blade hanging lower
  }
  grains(ctx, rand, ['#417026', '#83c35c'], 8);
};

const drawStone: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#8d8d8d', '#828282', '#949494', '#7b7b7b', '#888888']);
  grains(ctx, rand, ['#6b6b6b', '#616161', '#9d9d9d'], 20);
  // a couple of short cracks
  for (let c = 0; c < 2; c++) {
    let x = (rand() * TEX) | 0;
    let y = (rand() * TEX) | 0;
    for (let s = 0; s < 4 + ((rand() * 4) | 0); s++) {
      px(ctx, x, y, '#5b5b5b');
      x = Math.max(0, Math.min(TEX - 1, x + ((rand() * 3) | 0) - 1));
      y = Math.max(0, Math.min(TEX - 1, y + ((rand() * 2) | 0)));
    }
  }
};

const drawWoodSide: Draw = (ctx, rand) => {
  // vertical bark grain: each column gets a tone, with occasional darker streaks + knots
  const tones = ['#6d5030', '#61462a', '#775a37', '#584026'];
  for (let x = 0; x < TEX; x++) {
    const base = tones[(rand() * tones.length) | 0];
    for (let y = 0; y < TEX; y++) px(ctx, x, y, rand() < 0.16 ? '#49341f' : base);
  }
  for (let k = 0; k < 3; k++) {
    const kx = 1 + ((rand() * (TEX - 2)) | 0);
    const ky = 2 + ((rand() * (TEX - 6)) | 0);
    for (let d = 0; d < 3; d++) px(ctx, kx, ky + d, '#3f2c19');
  }
};

const drawWoodTop: Draw = (ctx, rand) => {
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); // chebyshev rings
      const ring = Math.round(d);
      let c = ring % 2 === 0 ? '#a67f4c' : '#8b6238';
      if (d < 1.5) c = '#6c4a28'; // pith
      if (rand() < 0.12) c = '#7a5836';
      px(ctx, x, y, c);
    }
  }
  for (let i = 0; i < TEX; i++) {
    px(ctx, i, 0, '#5e4529');
    px(ctx, i, TEX - 1, '#5e4529');
    px(ctx, 0, i, '#5e4529');
    px(ctx, TEX - 1, i, '#5e4529');
  }
};

const drawLeaves: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#3f7f33', '#4a9540', '#357029', '#54a349', '#2f6624', '#438a37']);
  grains(ctx, rand, ['#264f20', '#1f3f19', '#5cb050'], 40); // dark gaps + bright highlights = bushy
};

const drawRune: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#5a49c4', '#6455d6', '#4f3fb0', '#5648bd', '#4636a4']);
  grains(ctx, rand, ['#3b2d86', '#7c6ee8'], 14);
  // glowing diamond glyph
  const glow = '#d7ccff';
  const glow2 = '#b3a3f5';
  for (let i = 0; i < 7; i++) {
    px(ctx, 8 + i - 3, 1 + i, i === 3 ? glow : glow2); // top-left -> center
    px(ctx, 8 - i + 3, 1 + i, i === 3 ? glow : glow2); // top-right -> center
    px(ctx, 8 + i - 3, 14 - i, i === 3 ? glow : glow2);
    px(ctx, 8 - i + 3, 14 - i, i === 3 ? glow : glow2);
  }
  px(ctx, 8, 7, glow);
  px(ctx, 7, 8, glow);
  px(ctx, 8, 8, glow);
};

const drawRuneBrick: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#e0982f', '#e6a338', '#d8902a', '#eaad45', '#d68a26']);
  const mortar = '#a9741f';
  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const row = Math.floor(y / 4);
      const offset = row % 2 === 0 ? 0 : 4; // running-bond brick pattern
      if (y % 4 === 0 || (x + offset) % 8 === 0) px(ctx, x, y, mortar);
    }
  }
  // faint carved rune in the middle
  for (const [x, y] of [[7, 5], [8, 5], [7, 6], [7, 7], [8, 7], [7, 8], [7, 9], [8, 9], [9, 9]] as const) {
    px(ctx, x, y, '#7c5313');
  }
};

const drawBedrock: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#2b2930', '#232128', '#39363f', '#1a181e', '#302d37', '#211f26']);
  grains(ctx, rand, ['#0f0e12', '#454150'], 26);
};

export type BlockMaterials = {
  materials: Record<number, THREE.Material | THREE.Material[]>;
  dispose: () => void;
};

/** Build the per-block-type material set. BoxGeometry face-group order is +x, -x, +y, -y, +z, -z. */
export function buildBlockMaterials(): BlockMaterials {
  const textures: THREE.Texture[] = [];
  const tex = (seed: number, draw: Draw) => {
    const x = makeTexture(seed, draw);
    textures.push(x);
    return x;
  };

  const grassSideTex = tex(103, drawGrassSide);
  const grassTopTex = tex(102, drawGrassTop);
  const dirtTex = tex(101, drawDirt);
  const stoneTex = tex(104, drawStone);
  const woodSideTex = tex(105, drawWoodSide);
  const woodTopTex = tex(106, drawWoodTop);
  const leavesTex = tex(107, drawLeaves);
  const runeTex = tex(108, drawRune);
  const runeBrickTex = tex(109, drawRuneBrick);
  const bedrockTex = tex(110, drawBedrock);

  const mats: THREE.Material[] = [];
  const lambert = (opts: THREE.MeshLambertMaterialParameters) => {
    const m = new THREE.MeshLambertMaterial(opts);
    mats.push(m);
    return m;
  };

  const grassSide = lambert({ map: grassSideTex });
  const grassTop = lambert({ map: grassTopTex });
  const dirt = lambert({ map: dirtTex });
  const woodSide = lambert({ map: woodSideTex });
  const woodTop = lambert({ map: woodTopTex });

  const materials: Record<number, THREE.Material | THREE.Material[]> = {
    [GRASS]: [grassSide, grassSide, grassTop, dirt, grassSide, grassSide],
    [DIRT]: dirt,
    [STONE]: lambert({ map: stoneTex }),
    [WOOD]: [woodSide, woodSide, woodTop, woodTop, woodSide, woodSide],
    [LEAVES]: lambert({ map: leavesTex }),
    [RUNE]: lambert({ map: runeTex, emissive: 0x2d1f66, emissiveIntensity: 0.7 }),
    [RUNEBLOCK]: lambert({ map: runeBrickTex, emissive: 0x5c3d10, emissiveIntensity: 0.45 }),
    [BEDROCK]: lambert({ map: bedrockTex }),
  };

  return {
    materials,
    dispose: () => {
      mats.forEach((m) => m.dispose());
      textures.forEach((x) => x.dispose());
    },
  };
}
