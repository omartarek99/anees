// -------------------------------------------------------------------------------------------
// Data model for the Builder's Quarry animals.
//
// An animal species is *data*: a list of box parts (size / position / texture region / optional
// animated joint) plus a painter for each part's skin and a few behaviour knobs. The engine
// (model.ts / rig.ts / paint.ts) turns that into ONE shared merged geometry + a small pixel-art
// atlas per species, and every individual animal is a single Mesh (one draw call) that shares
// both. Limb / wing / tail motion runs in the vertex shader, so animals cost no extra meshes.
//
// Coordinates: pixels, 16 px = 1 block. Origin = the animal's feet, centred. +Y up, +Z = the way
// the animal faces. +X is the animal's LEFT (so a "left wing" sits at +x).
// -------------------------------------------------------------------------------------------
import type { Biome } from '../craftWorld';

export type Vec3 = [number, number, number];

/** Which face of a part's box. px / nx = the +x / -x side; front = +z (faces forward); back = -z. */
export type Face = 'px' | 'nx' | 'top' | 'bottom' | 'front' | 'back';
/** What a paint call applies to: one face, a list, every face, or the four sides (nx, front, px, back). */
export type FaceSel = Face | readonly Face[] | 'all' | 'sides';

/**
 * Painter handed to a part's `skin` function. Face pixel coordinates start at the top-left corner of
 * the face AS SEEN FROM OUTSIDE (so front: x grows towards the animal's left... see README for the
 * orientation table). Sizes: front/back = w x h, nx/px = d x h, top/bottom = w x d.
 */
export interface Paint {
  /** the part's box size in px */
  readonly w: number;
  readonly h: number;
  readonly d: number;
  /** which skin variant is being painted (0 .. species.variants-1) */
  readonly variant: number;
  /** seeded random in [0,1): deterministic per part + variant, so a species always looks the same */
  rand(): number;
  /** pixel size of a face */
  size(face: Face): { w: number; h: number };
  fill(faces: FaceSel, color: string): void;
  rect(face: Face, x: number, y: number, w: number, h: number, color: string): void;
  px(face: Face, x: number, y: number, color: string): void;
  /** every pixel becomes a random entry of `palette` (the base fur / skin / scale look) */
  speckle(faces: FaceSel, palette: readonly string[]): void;
  /** sprinkles `amount` (0..1) of the pixels with `color` (freckles, grain, highlights) */
  grain(faces: FaceSel, colors: string | readonly string[], amount: number): void;
  /** draws a horizontal band of rows y0 .. y1-1 (e.g. a pale belly stripe) across one or more faces */
  band(faces: FaceSel, y0: number, y1: number, color: string): void;
  /** a solid disc-ish blob of radius r (pixels) centred at (cx, cy): spots, patches */
  blob(face: Face, cx: number, cy: number, r: number, color: string): void;
}

export type SkinFn = (g: Paint) => void;

export type JointChan =
  /** limb swing: gain follows how fast the animal is moving */
  | 'walk'
  /** wing / fin beat: gain follows flapping */
  | 'flap'
  /** always-on gentle sway (ears, tentacles, breathing) */
  | 'idle'
  /** tail wag (always on, a little faster when happy / moving) */
  | 'tail'
  /** head dips towards the ground when the animal is grazing */
  | 'graze';

export interface JointSpec {
  chan: JointChan;
  /** axis the part rotates around */
  axis: 'x' | 'y' | 'z';
  /** amplitude (radians) of the swing; the sign flips the direction */
  amp: number;
  /** phase offset (radians): give diagonal leg pairs 0 and Math.PI */
  phase?: number;
  /** angle when the channel's gain is 0 (e.g. folded wings while walking); default 0 */
  rest?: number;
  /** pivot in px. Default: top-centre of the part for 'walk' (the hip), else the part's centre. */
  pivot?: Vec3;
}

export interface PartSpec {
  /** centre of the part, px */
  at: Vec3;
  /** box size in px: width (x), height (y), depth (z) */
  size: Vec3;
  /** top-left of this part's unwrap in the species atlas, px (the unwrap is (2d+2w) x (d+h)). Parts that
   *  share a uv and a size (left/right legs) share their paint, painted once by the first of them. */
  uv: [number, number];
  skin: SkinFn;
  /** tilt about the part's own centre, radians (order YXZ) - tails, ears, snouts */
  rot?: Vec3;
  joint?: JointSpec;
}

/** How the animal gets around. */
export type MoveKind =
  /** walks on the ground, steps up one block, avoids ledges */
  | 'walk'
  /** hops: short ground leaps (rabbit, frog) */
  | 'hop'
  /** swims inside water blocks only */
  | 'swim'
  /** flies freely above the ground (bat, bee, parrot) */
  | 'fly'
  /** floats slowly high above the ground (happy ghast) */
  | 'float';

export interface Habitat {
  /** biomes it spawns in. Omit = anywhere. */
  biomes?: readonly Biome[];
  /** relative spawn weight within its habitat (1 = common farm animal, 0.2 = rare) */
  weight: number;
  /** herd size on spawn: [min, max] */
  herd?: readonly [number, number];
}

export interface SpeciesSpec {
  kind: string;
  name: { en: string; ar: string };
  emoji: string;
  /** atlas size in px (power-of-two-ish; keep it small: 64x32, 64x64 or 128x64) */
  tex: [number, number];
  parts: PartSpec[];
  /** number of skin variants (coat colours); each is a separate small atlas. Default 1. */
  variants?: number;
  move: MoveKind;
  /** wander speed in blocks / s */
  speed: number;
  hp: number;
  habitat: Habitat;
  /** may the player befriend it by clicking (it then follows). Water animals never follow. Default true. */
  tameable?: boolean;
  /** hop impulse for move 'hop' (blocks/s upward). Default 6. */
  hop?: number;
  /** [min, max] height above the ground it flies / floats at, blocks. Default [2, 6]. */
  altitude?: readonly [number, number];
  /** [min, max] depth below the water surface it swims at, blocks. Default [0.5, 3]. */
  depth?: readonly [number, number];
  /** minimum water depth (blocks) a pond needs before this swimmer spawns in it. Default 1. */
  minWater?: number;
  /** nods its head to the ground now and then while standing (cow, sheep, horse...) */
  graze?: boolean;
  /** self-lit: 0..1 emissive strength (glow squid) */
  glow?: number;
  /** cold land walker that shivers (the strider, out of its lava) */
  shiver?: boolean;
  /** overall size multiplier on top of the px model (rarely needed) */
  scale?: number;
}
