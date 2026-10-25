import { clamp, fbm, lerp, smoothstep, valueNoise } from '../math';
import { seamFade } from '../ground';
import { ZONES } from '../layout';
import { nearestOnPath } from '../pathLine';

// The Desert Oasis landscape: long sand dunes that lean diagonally like the artwork's, a flat oasis with a pond at the top
// left, a flat patch for the adobe village at the top right, and a road that runs along the valley floor.

const ZONE = ZONES[0];
const SEED = 17;

/** The oasis (north-west): flat sand with palms round a pond. */
const OASIS = { x: -12.6, z: 8, r: 7 };
export const POND = { x: -12.8, z: 9.8, rx: 5.2, rz: 3.4, rot: 0.4 };
/** The adobe village (north-east). */
export const VILLAGE = { x: 14.8, z: 10.5, r: 8 };

const OASIS_LEVEL = 0.5;
const VILLAGE_LEVEL = 1;
const POND_FLOOR = -1;

/** < 1 inside the pond: an ellipse with a ragged edge. */
function pondE(x: number, z: number) {
  const dx = x - POND.x;
  const dz = z - POND.z;
  const c = Math.cos(POND.rot);
  const s = Math.sin(POND.rot);
  const u = (dx * c + dz * s) / POND.rx;
  const v = (-dx * s + dz * c) / POND.rz;
  return u * u + v * v + (valueNoise(x, z, 3, SEED + 3) - 0.5) * 0.4;
}
export const inPond = (x: number, z: number) => pondE(x, z) < 1;

// Dune ridges run along (SIN, COS): noise is stretched three times as long along them as across.
const COS = 0.82;
const SIN = 0.57;

/** Dune mass at a point: a few broad, smooth ridges (two octaves, no fine bumps: fewer terraces), low beside the road. */
function dunes(x: number, z: number, d: number) {
  const across = x * COS - z * SIN;
  const along = x * SIN + z * COS;
  const ridge = 0.25 + 0.75 * smoothstep(0.1, 0.9, fbm(across, along * 0.25, 40, SEED, 2));
  const away = smoothstep(4.5, 18, d); // the dunes rise on the far side of each bend, as in the artwork
  return ridge * 4.8 * (0.1 + 0.9 * away);
}

const flat = (x: number, z: number, cx: number, cz: number, r: number, blend: number) => 1 - smoothstep(r, r + blend, Math.hypot(x - cx, z - cz));

export function baseHeight(x: number, z: number) {
  if (inPond(x, z)) return POND_FLOOR;
  // the road follows the valley floor: dunes only rise properly some blocks away from it
  const d = nearestOnPath(x, z).d;
  let h = dunes(x, z, d) * seamFade(ZONE, z, 12);
  h = lerp(h, OASIS_LEVEL, flat(x, z, OASIS.x, OASIS.z, OASIS.r, 10));
  h = lerp(h, VILLAGE_LEVEL, flat(x, z, VILLAGE.x, VILLAGE.z, VILLAGE.r, 8));
  return h;
}

/** The road rolls gently (it only depends on z, so it stays smooth) and settles to 0 at the zone's far edge. */
export function pathLevel(_x: number, z: number) {
  return seamFade(ZONE, z, 14) * (0.4 + 1.5 * valueNoise(0, z, 34, SEED + 5));
}

type RGB = readonly [number, number, number];
const DEEP: RGB = [0xea, 0xb4, 0x66]; // valley floors: orange-tan
const MID: RGB = [0xf2, 0xca, 0x7e];
const SHADE: RGB = [0xc4, 0x86, 0x48]; // slopes turned away from the sun
const LIGHT: RGB = [0xfc, 0xe9, 0xb4]; // slopes and crests facing it: pale gold
const GRASS: RGB = [0xa9, 0xb2, 0x4e];
const WET: RGB = [0xb5, 0x83, 0x4a];

const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const hex = (c: RGB) => `#${[0, 1, 2].map((i) => Math.round(clamp(c[i], 0, 255)).toString(16).padStart(2, '0')).join('')}`;

/** Sand colour of a column. The terrain's tops are flat, so the slope shading (sun up-left-front) has to be baked in here. */
export function sandTop(x: number, z: number, h: number): string {
  // slope from the smooth landscape (the stepped ground would make the shading flicker); flat next to the road
  const near = smoothstep(3, 8, nearestOnPath(x, z).d);
  const gx = ((baseHeight(x + 1.5, z) - baseHeight(x - 1.5, z)) / 3) * near;
  const gz = ((baseHeight(x, z + 1.5) - baseHeight(x, z - 1.5)) / 3) * near;
  const lit = clamp(0.5 + 2.1 * (0.4 * gx - 0.45 * gz), 0, 1);
  let c = mix(DEEP, MID, smoothstep(0, 2.4, h));
  c = lit < 0.5 ? mix(c, SHADE, (0.5 - lit) * 2) : mix(c, LIGHT, (lit - 0.5) * 2);
  c = mix(c, LIGHT, 0.4 * smoothstep(2.4, 4.2, h)); // pale crests
  // fine ripples, drifting across the dunes
  const ripple = Math.sin((x * 0.62 + z * 0.29) * 2.7 + valueNoise(x, z, 5, SEED + 1) * 6);
  c = mix(c, [c[0] * 0.9, c[1] * 0.88, c[2] * 0.85], smoothstep(0.6, 1, ripple) * 0.55);
  // the oasis: greener sand, damp round the water
  const oz = (z - OASIS.z) * 1.15;
  const green = (1 - smoothstep(3, 10, Math.hypot(x - OASIS.x, oz))) * (0.45 + 0.55 * valueNoise(x, z, 4, SEED + 11));
  c = mix(c, GRASS, green * 0.55);
  c = mix(c, WET, 1 - smoothstep(1, 1.7, pondE(x, z)));
  return hex(c);
}

const parse = (hexColor: string): RGB => [parseInt(hexColor.slice(1, 3), 16), parseInt(hexColor.slice(3, 5), 16), parseInt(hexColor.slice(5, 7), 16)];

/** The faces below a column's top: the same sand, a little deeper in tone (the default goes brown too quickly). */
export function sandSide(_x: number, _z: number, depth: number, topHex: string): string {
  const k = depth < 0.5 ? 0.94 : Math.max(0.72, 0.86 - depth * 0.03);
  const c = parse(topHex);
  return hex(mix([c[0] * k, c[1] * k, c[2] * k], SHADE, 0.14));
}
