import * as THREE from 'three';
import {
  GRASS,
  DIRT,
  STONE,
  WOOD,
  LEAVES,
  RUNE,
  RUNEBLOCK,
  BEDROCK,
  COBBLE,
  PLANKS,
  SAND,
  GRAVEL,
  GLASS,
  DEEPSLATE,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  REDSTONE_ORE,
  LAPIS_ORE,
  DIAMOND_ORE,
  EMERALD_ORE,
  GLOWSTONE,
  CRAFTING_TABLE,
  FURNACE,
  TORCH,
  SNOW,
  WHEAT_CROP,
} from './craftWorld';

// Procedurally-drawn 16x16 pixel-art block textures — the low resolution + nearest-neighbour
// magnification is what gives the quarry its blocky, Minecraft-like surface.

const TEX = 16;

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

function makeTexture(seed: number, draw: Draw, opts?: { transparent?: boolean }): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX;
  canvas.height = TEX;
  const ctx = canvas.getContext('2d')!;
  if (opts?.transparent) ctx.clearRect(0, 0, TEX, TEX);
  draw(ctx, rng(seed));
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapNearestFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const px = (ctx: CanvasRenderingContext2D, x: number, y: number, c: string) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 1, 1);
};
function speckle(ctx: CanvasRenderingContext2D, rand: () => number, palette: string[]) {
  for (let y = 0; y < TEX; y++) for (let x = 0; x < TEX; x++) px(ctx, x, y, palette[(rand() * palette.length) | 0]);
}
function grains(ctx: CanvasRenderingContext2D, rand: () => number, palette: string[], n: number) {
  for (let i = 0; i < n; i++) px(ctx, (rand() * TEX) | 0, (rand() * TEX) | 0, palette[(rand() * palette.length) | 0]);
}

const DIRT_PAL = ['#8a6244', '#7d5739', '#714d32', '#87603f', '#6c4a30'];
const STONE_PAL = ['#8d8d8d', '#828282', '#949494', '#7b7b7b', '#888888'];
const DEEP_PAL = ['#4d4d54', '#45454c', '#565660', '#3e3e45', '#4a4a52'];
const SAND_PAL = ['#e3d6a8', '#dccd9c', '#e8dcb2', '#d3c491', '#ded0a0'];

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
    const edge = 3 + (rand() < 0.5 ? 1 : 0) + (rand() < 0.25 ? 1 : 0);
    for (let y = 0; y < edge; y++) px(ctx, x, y, green[(rand() * green.length) | 0]);
    if (rand() < 0.4) px(ctx, x, edge, green[(rand() * green.length) | 0]);
  }
};
const drawSnowSide: Draw = (ctx, rand) => {
  speckle(ctx, rand, DIRT_PAL);
  for (let x = 0; x < TEX; x++) {
    const edge = 4 + (rand() < 0.5 ? 1 : 0);
    for (let y = 0; y < edge; y++) px(ctx, x, y, rand() < 0.15 ? '#dfe7ef' : '#f4f8fb');
  }
};
const drawSnowTop: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#f6f9fc', '#eef3f8', '#ffffff', '#e8eef4']);
  grains(ctx, rand, ['#dbe4ec', '#ffffff'], 10);
};
const drawStone: Draw = (ctx, rand) => {
  speckle(ctx, rand, STONE_PAL);
  grains(ctx, rand, ['#6b6b6b', '#616161', '#9d9d9d'], 20);
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
const drawDeepslate: Draw = (ctx, rand) => {
  speckle(ctx, rand, DEEP_PAL);
  grains(ctx, rand, ['#33333a', '#2b2b31', '#61616b'], 18);
  for (let i = 0; i < TEX; i += 4) for (let x = 0; x < TEX; x++) if (rand() < 0.5) px(ctx, x, i, '#33333a');
};
const drawCobble: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#5f5f66', '#6f6f77']);
  // rounded stones
  for (let i = 0; i < 5; i++) {
    const cx = (rand() * TEX) | 0;
    const cy = (rand() * TEX) | 0;
    const r = 2 + ((rand() * 2) | 0);
    const tone = STONE_PAL[(rand() * STONE_PAL.length) | 0];
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= r * r) px(ctx, (cx + x + TEX) % TEX, (cy + y + TEX) % TEX, tone);
  }
  grains(ctx, rand, ['#4a4a50', '#a0a0a6'], 14);
};
const drawSand: Draw = (ctx, rand) => {
  speckle(ctx, rand, SAND_PAL);
  grains(ctx, rand, ['#c7b788', '#f0e6c4'], 16);
};
const drawGravel: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#8b8683', '#7a756f', '#9a938c', '#6f6a64']);
  grains(ctx, rand, ['#57534e', '#b3aca4', '#4a4640'], 30);
};
const drawGlass: Draw = (ctx, rand) => {
  ctx.clearRect(0, 0, TEX, TEX);
  ctx.fillStyle = 'rgba(200,232,242,0.12)';
  ctx.fillRect(0, 0, TEX, TEX);
  ctx.strokeStyle = 'rgba(220,242,250,0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, TEX - 1, TEX - 1);
  for (let i = 0; i < 4; i++) px(ctx, 1 + ((rand() * (TEX - 2)) | 0), 1 + ((rand() * (TEX - 2)) | 0), 'rgba(255,255,255,0.7)');
};
const drawWoodSide: Draw = (ctx, rand) => {
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
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const ring = Math.round(d);
      let c = ring % 2 === 0 ? '#a67f4c' : '#8b6238';
      if (d < 1.5) c = '#6c4a28';
      if (rand() < 0.12) c = '#7a5836';
      px(ctx, x, y, c);
    }
  for (let i = 0; i < TEX; i++) {
    px(ctx, i, 0, '#5e4529');
    px(ctx, i, TEX - 1, '#5e4529');
    px(ctx, 0, i, '#5e4529');
    px(ctx, TEX - 1, i, '#5e4529');
  }
};
const drawPlanks: Draw = (ctx, rand) => {
  const tones = ['#b98a52', '#ad7f49', '#c2915a', '#a5763f'];
  for (let y = 0; y < TEX; y++) {
    const band = Math.floor(y / 4);
    const base = tones[band % tones.length];
    for (let x = 0; x < TEX; x++) px(ctx, x, y, rand() < 0.14 ? '#8a5f35' : base);
    if (y % 4 === 0) for (let x = 0; x < TEX; x++) px(ctx, x, y, '#6e4a28');
  }
  for (let b = 0; b < 4; b++) px(ctx, 3 + b * 4, 1 + ((rand() * 3) | 0) + b, '#6e4a28');
};
const drawLeaves: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#3f7f33', '#4a9540', '#357029', '#54a349', '#2f6624', '#438a37']);
  grains(ctx, rand, ['#264f20', '#1f3f19', '#5cb050'], 40);
};
const drawRune: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#5a49c4', '#6455d6', '#4f3fb0', '#5648bd', '#4636a4']);
  grains(ctx, rand, ['#3b2d86', '#7c6ee8'], 14);
  const glow = '#d7ccff';
  const glow2 = '#b3a3f5';
  for (let i = 0; i < 7; i++) {
    px(ctx, 8 + i - 3, 1 + i, i === 3 ? glow : glow2);
    px(ctx, 8 - i + 3, 1 + i, i === 3 ? glow : glow2);
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
  for (let y = 0; y < TEX; y++)
    for (let x = 0; x < TEX; x++) {
      const row = Math.floor(y / 4);
      const offset = row % 2 === 0 ? 0 : 4;
      if (y % 4 === 0 || (x + offset) % 8 === 0) px(ctx, x, y, mortar);
    }
  for (const [x, y] of [[7, 5], [8, 5], [7, 6], [7, 7], [8, 7], [7, 8], [7, 9], [8, 9], [9, 9]] as const) px(ctx, x, y, '#7c5313');
};
const drawBedrock: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#2b2930', '#232128', '#39363f', '#1a181e', '#302d37', '#211f26']);
  grains(ctx, rand, ['#0f0e12', '#454150'], 26);
};

function oreDraw(base: Draw, blobColors: string[]): Draw {
  return (ctx, rand) => {
    base(ctx, rand);
    for (let i = 0; i < 4; i++) {
      const cx = 2 + ((rand() * (TEX - 4)) | 0);
      const cy = 2 + ((rand() * (TEX - 4)) | 0);
      const r = 1 + ((rand() * 2) | 0);
      for (let y = -r; y <= r; y++)
        for (let x = -r; x <= r; x++)
          if (x * x + y * y <= r * r + 1) {
            const c = blobColors[(rand() * blobColors.length) | 0];
            px(ctx, cx + x, cy + y, c);
          }
    }
  };
}
const drawGlowstone: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#e7c15b', '#f0cf70', '#d8ac47', '#f6dd8c']);
  grains(ctx, rand, ['#c99c3a', '#fff0c0'], 22);
  for (let i = 0; i < 6; i++) px(ctx, 1 + ((rand() * (TEX - 2)) | 0), 1 + ((rand() * (TEX - 2)) | 0), '#fff6da');
};
const drawCraftingSide: Draw = (ctx, rand) => {
  drawPlanks(ctx, rand);
  // tool silhouette
  ctx.fillStyle = '#4a3218';
  ctx.fillRect(4, 3, 8, 2);
  ctx.fillRect(7, 3, 2, 9);
};
const drawCraftingTop: Draw = (ctx, rand) => {
  drawPlanks(ctx, rand);
  ctx.strokeStyle = '#4a3218';
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo((i * TEX) / 3, 0);
    ctx.lineTo((i * TEX) / 3, TEX);
    ctx.moveTo(0, (i * TEX) / 3);
    ctx.lineTo(TEX, (i * TEX) / 3);
    ctx.stroke();
  }
};
const drawFurnaceSide: Draw = (ctx, rand) => {
  speckle(ctx, rand, ['#6e6e76', '#636369', '#79797f']);
  grains(ctx, rand, ['#4a4a50', '#8a8a90'], 16);
};
const drawFurnaceFront: Draw = (ctx, rand) => {
  drawFurnaceSide(ctx, rand);
  ctx.fillStyle = '#2b2b30';
  ctx.fillRect(4, 6, 8, 7);
  ctx.fillStyle = '#e2762b';
  ctx.fillRect(5, 9, 6, 3);
  ctx.fillStyle = '#f7c04a';
  ctx.fillRect(6, 10, 4, 2);
};
const drawTorch: Draw = (ctx, rand) => {
  ctx.clearRect(0, 0, TEX, TEX);
  ctx.fillStyle = '#6d4a24';
  ctx.fillRect(7, 6, 2, 9);
  ctx.fillStyle = '#f7c04a';
  ctx.fillRect(6, 2, 4, 4);
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(7, 3, 2, 2);
  grains(ctx, rand, ['#ff9d3a', '#ffd66b'], 4);
};
const drawWheat: Draw = (ctx, rand) => {
  ctx.clearRect(0, 0, TEX, TEX);
  for (let x = 1; x < TEX; x += 3) {
    const h = 6 + ((rand() * 6) | 0);
    for (let y = TEX - 1; y > TEX - 1 - h; y--) px(ctx, x, y, y < TEX - h + 2 ? '#e8cf6a' : '#7fae4a');
    px(ctx, x, TEX - 1 - h, '#f2df8c');
  }
};

export type BlockMaterials = {
  materials: Record<number, THREE.Material | THREE.Material[]>;
  dispose: () => void;
};

export function buildBlockMaterials(): BlockMaterials {
  const textures: THREE.Texture[] = [];
  const mats: THREE.Material[] = [];
  const tex = (seed: number, d: Draw, o?: { transparent?: boolean }) => {
    const x = makeTexture(seed, d, o);
    textures.push(x);
    return x;
  };
  const lam = (opts: THREE.MeshLambertMaterialParameters) => {
    const m = new THREE.MeshLambertMaterial(opts);
    mats.push(m);
    return m;
  };

  const grassSide = lam({ map: tex(103, drawGrassSide) });
  const grassTop = lam({ map: tex(102, drawGrassTop) });
  const dirt = lam({ map: tex(101, drawDirt) });
  const woodSide = lam({ map: tex(105, drawWoodSide) });
  const woodTop = lam({ map: tex(106, drawWoodTop) });
  const snowSide = lam({ map: tex(140, drawSnowSide) });
  const snowTop = lam({ map: tex(141, drawSnowTop) });
  const planks = lam({ map: tex(110, drawPlanks) });
  const stoneTex = tex(104, drawStone);
  const deepTex = tex(114, drawDeepslate);
  const craftSide = lam({ map: tex(123, drawCraftingSide) });
  const craftTop = lam({ map: tex(124, drawCraftingTop) });
  const furSide = lam({ map: tex(125, drawFurnaceSide) });
  const furFront = lam({ map: tex(126, drawFurnaceFront) });

  const materials: Record<number, THREE.Material | THREE.Material[]> = {
    [GRASS]: [grassSide, grassSide, grassTop, dirt, grassSide, grassSide],
    [DIRT]: dirt,
    [STONE]: lam({ map: stoneTex }),
    [WOOD]: [woodSide, woodSide, woodTop, woodTop, woodSide, woodSide],
    [LEAVES]: lam({ map: tex(107, drawLeaves) }),
    [RUNE]: lam({ map: tex(108, drawRune), emissive: 0x2d1f66, emissiveIntensity: 0.7 }),
    [RUNEBLOCK]: lam({ map: tex(109, drawRuneBrick), emissive: 0x5c3d10, emissiveIntensity: 0.4 }),
    [BEDROCK]: lam({ map: tex(100, drawBedrock) }),
    [COBBLE]: lam({ map: tex(120, drawCobble) }),
    [PLANKS]: planks,
    [SAND]: lam({ map: tex(111, drawSand) }),
    [GRAVEL]: lam({ map: tex(112, drawGravel) }),
    [GLASS]: lam({ map: tex(113, drawGlass, { transparent: true }), transparent: true, opacity: 0.55 }),
    [DEEPSLATE]: lam({ map: deepTex }),
    [COAL_ORE]: lam({ map: tex(115, oreDraw(drawStone, ['#2b2b2f', '#1c1c1f', '#3a3a40'])) }),
    [IRON_ORE]: lam({ map: tex(116, oreDraw(drawStone, ['#c9a992', '#d8b7a0', '#b7997f'])) }),
    [GOLD_ORE]: lam({ map: tex(117, oreDraw(drawStone, ['#efc659', '#f2c94c', '#d9a93a'])) }),
    [REDSTONE_ORE]: lam({ map: tex(118, oreDraw(drawStone, ['#d23b3b', '#a52222', '#e85a5a'])) }),
    [LAPIS_ORE]: lam({ map: tex(119, oreDraw(drawStone, ['#2f5fbf', '#3f74d6', '#254a95'])) }),
    [DIAMOND_ORE]: lam({ map: tex(121, oreDraw(drawStone, ['#4fe0d0', '#7ff0e4', '#37bdb0'])) }),
    [EMERALD_ORE]: lam({ map: tex(122, oreDraw(drawDeepslate, ['#2ecc71', '#57e08f', '#1f9d55'])) }),
    [GLOWSTONE]: lam({ map: tex(127, drawGlowstone), emissive: 0xffcf6b, emissiveIntensity: 0.75 }),
    [CRAFTING_TABLE]: [craftSide, craftSide, craftTop, planks, craftSide, craftSide],
    [FURNACE]: [furSide, furSide, furSide, furSide, furFront, furSide],
    [TORCH]: lam({ map: tex(128, drawTorch, { transparent: true }), transparent: true, emissive: 0xff9a3a, emissiveIntensity: 0.9 }),
    [SNOW]: [snowSide, snowSide, snowTop, dirt, snowSide, snowSide],
    [WHEAT_CROP]: lam({ map: tex(129, drawWheat, { transparent: true }), transparent: true, alphaTest: 0.4 }),
  };

  return {
    materials,
    dispose: () => {
      mats.forEach((m) => m.dispose());
      textures.forEach((x) => x.dispose());
    },
  };
}
