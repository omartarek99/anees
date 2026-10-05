// The student's 3D character: what can be chosen, the colour of every choice, and the two
// browser checks that decide whether to render it at all. No three.js import here -- this file
// is loaded eagerly (by ProfileAvatar3D) while the 3D code itself is lazy-loaded.
//
// The ids below are what gets stored (users.avatar3d) and must match avatar3dSchema in
// backend/src/lib/schemas.ts -- the server rejects anything that isn't one of these.

export const SKIN_TONES = {
  porcelain: '#f9dcc4',
  fair: '#f1c6a0',
  wheat: '#e0ac7e',
  olive: '#c68e5f',
  tan: '#b07a4c',
  caramel: '#8d5a36',
  brown: '#6b4226',
  deep: '#4a2c1a',
} as const;

export const THOBE_COLORS = { summer: '#f7f5ef', navy: '#223a63', brown: '#5a3d2b' } as const;

// Shared by T-shirt / hoodie colour and cap colour.
export const PALETTE = {
  white: '#f4f4f0',
  black: '#23262b',
  maroon: '#8a1538',
  red: '#d64045',
  yellow: '#f2c230',
  green: '#2f9e6d',
  blue: '#3b6fd4',
  gray: '#8a929e',
} as const;

export const BOTTOM_COLORS = { jeans: '#3a5a8c', 'black-jeans': '#2a2d33', khaki: '#b8a07a', gray: '#6f7783' } as const;

export const OUTFITS = ['thobe', 'casual'] as const;
export const TOPS = ['tshirt', 'hoodie'] as const;
export const HEADWEAR = ['none', 'ghutra', 'cap'] as const;
export const ACCESSORIES = ['none', 'reading', 'sunglasses'] as const;

export type SkinId = keyof typeof SKIN_TONES;
export type ThobeId = keyof typeof THOBE_COLORS;
export type PaletteId = keyof typeof PALETTE;
export type BottomId = keyof typeof BOTTOM_COLORS;

export type AvatarConfig = {
  skin: SkinId;
  outfit: (typeof OUTFITS)[number];
  thobe: ThobeId;
  top: (typeof TOPS)[number];
  topColor: PaletteId;
  bottom: BottomId;
  headwear: (typeof HEADWEAR)[number];
  capColor: PaletteId;
  accessory: (typeof ACCESSORIES)[number];
};

export const DEFAULT_AVATAR: AvatarConfig = {
  skin: 'fair',
  outfit: 'thobe',
  thobe: 'summer',
  top: 'tshirt',
  topColor: 'blue',
  bottom: 'jeans',
  headwear: 'ghutra',
  capColor: 'blue',
  accessory: 'none',
};

export function sameAvatar(a: AvatarConfig, b: AvatarConfig): boolean {
  return (Object.keys(a) as (keyof AvatarConfig)[]).every((k) => a[k] === b[k]);
}

// Browsers cap live WebGL contexts (~8-16 per page; the oldest is silently killed past that),
// so the 3D character is only ever drawn in one or two places at a time and the probe context
// used here is released straight away. Cached: it never changes during a page's life.
let webglSupported: boolean | undefined;
export function canUseWebGL(): boolean {
  if (webglSupported === undefined) {
    try {
      const canvas = document.createElement('canvas');
      const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
      webglSupported = !!gl;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      webglSupported = false;
    }
  }
  return webglSupported;
}

// Cheap hint for phones / low-end laptops: fewer pixels and a smaller shadow map.
export function isLowPower(): boolean {
  const cores = navigator.hardwareConcurrency ?? 8;
  return cores <= 4 || window.matchMedia('(max-width: 640px)').matches;
}
