// Fish of the Builder's Quarry ponds: cod, salmon, pufferfish and the six-coat tropical fish.
//
// Every fish is a row of box segments along +z. The body segments carry 'tail' joints about the y axis, each
// pivoting at its front edge with a growing amplitude and a lagging phase, which makes the body ripple when it
// swims. Fins are 1 px thick boxes whose silhouette is cut out of the paint (unpainted pixels are transparent).
// Skins are painted in WORLD coordinates (paintWorld), so a band, a gradient or a mottle lines up across the
// head, the body segments and the fins even though each is a separate box with its own unwrap.
import type { Face, JointSpec, Paint, PartSpec, SkinFn, SpeciesSpec, Vec3 } from '../types';
import { shade, tones } from './kit';

type Px = string | null | undefined;
const ALL6: readonly Face[] = ['nx', 'front', 'px', 'back', 'top', 'bottom'];

const pick = (g: Paint, pal: readonly string[]): string => pal[(g.rand() * pal.length) | 0];
/** deterministic 0..1 noise from two coordinates (so patterns are the same on every segment) */
const hash = (a: number, b: number, s = 0): number => {
  const v = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

/** world position of a part's front face (zF) and top (yT), px */
interface Frame {
  zF: number;
  yT: number;
}

/** Paints every pixel of the given faces with `fn(x, y, z, face)` = the colour at that pixel's world position (px). */
function paintWorld(g: Paint, f: Frame, cx: number, fn: (x: number, y: number, z: number, face: Face) => Px, faces: readonly Face[] = ALL6): void {
  const { w, h, d } = g;
  for (const face of faces) {
    const s = g.size(face);
    for (let v = 0; v < s.h; v++) {
      for (let u = 0; u < s.w; u++) {
        let x = cx;
        let y = f.yT - v - 0.5;
        let z = f.zF;
        switch (face) {
          case 'px':
            x = cx + w / 2;
            z = f.zF - u - 0.5;
            break;
          case 'nx':
            x = cx - w / 2;
            z = f.zF - d + u + 0.5;
            break;
          case 'front':
            x = cx - w / 2 + u + 0.5;
            break;
          case 'back':
            x = cx + w / 2 - u - 0.5;
            z = f.zF - d;
            break;
          case 'top':
            x = cx - w / 2 + u + 0.5;
            y = f.yT;
            z = f.zF - d + v + 0.5;
            break;
          case 'bottom':
            x = cx - w / 2 + u + 0.5;
            y = f.yT - h;
            z = f.zF - v - 0.5;
            break;
        }
        const c = fn(x, y, z, face);
        if (c) g.px(face, u, v, c);
      }
    }
  }
}

type Anchor = 'bottom' | 'top' | 'mid';

/** A fin: only the pixels inside the profile are painted (the rest stays transparent = cut out).
 *  profile[i] = height in px of column i (0 = the front edge) measured from the anchor; `cut` removes extra pixels (a fork). */
function finSkin(
  f: Frame,
  anchor: Anchor,
  profile: readonly number[],
  col: (g: Paint, z: number, y: number, i: number, edge: boolean) => string,
  cut?: (i: number, y: number) => boolean
): SkinFn {
  return (g) => {
    const { w, h, d } = g;
    const base = (i: number, y: number): boolean => {
      const n = profile[Math.min(i, profile.length - 1)];
      if (anchor === 'bottom') return y >= h - n;
      if (anchor === 'top') return y < n;
      const y0 = Math.floor((h - n) / 2);
      return y >= y0 && y < y0 + n;
    };
    const inside = (i: number, y: number): boolean => i >= 0 && i < d && y >= 0 && y < h && base(i, y) && !(cut && cut(i, y));
    const edgeOf = (i: number, y: number): boolean => (anchor === 'bottom' && !inside(i, y - 1)) || (anchor === 'top' && !inside(i, y + 1)) || !inside(i + 1, y);
    const put = (face: Face, u: number, v: number, i: number, y: number): void => {
      if (inside(i, y)) g.px(face, u, v, col(g, f.zF - i - 0.5, f.yT - y - 0.5, i, edgeOf(i, y)));
    };
    for (let v = 0; v < h; v++) {
      for (let u = 0; u < d; u++) {
        put('px', u, v, u, v);
        put('nx', u, v, d - 1 - u, v);
      }
      for (let u = 0; u < w; u++) {
        put('front', u, v, 0, v);
        put('back', u, v, d - 1, v);
      }
    }
    for (let v = 0; v < d; v++) {
      for (let u = 0; u < w; u++) {
        put('top', u, v, d - 1 - v, 0);
        put('bottom', u, v, v, h - 1);
      }
    }
  };
}

/** s x s eye on both flanks of a head, `fx` px behind the front edge, `y` rows from the top. */
function eye(g: Paint, fx: number, y: number, s = 2, pupil = '#101016', glint = '#f4f4ee'): void {
  for (const face of ['px', 'nx'] as const) {
    const x0 = face === 'px' ? fx : g.d - fx - s;
    g.rect(face, x0, y, s, s, pupil);
    g.px(face, face === 'px' ? x0 + s - 1 : x0, y, glint);
  }
}

/** Shelf packer for the atlas: hands out unwrap origins left to right, row by row (validateSpecies checks the result). */
function packer(W: number, H: number): (size: Vec3) => [number, number] {
  let x = 0;
  let y = 0;
  let rowH = 0;
  return (size) => {
    const w = 2 * size[2] + 2 * size[0];
    const h = size[2] + size[1];
    if (x + w > W) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    const at: [number, number] = [x, y];
    x += w;
    rowH = Math.max(rowH, h);
    if (y + h > H) return [W, H]; // out of room: validateSpecies reports it
    return at;
  };
}

/** One box part. The skin factory is handed the part's world frame (front face z, top y). */
function part(at: Vec3, size: Vec3, uv: [number, number], skin: (f: Frame) => SkinFn, joint?: JointSpec, rot?: Vec3): PartSpec {
  const p: PartSpec = { at, size, uv, skin: skin({ zF: at[2] + size[2] / 2, yT: at[1] + size[1] / 2 }) };
  if (joint) p.joint = joint;
  if (rot) p.rot = rot;
  return p;
}

/** Swimming-wave joint for a body segment: pivots about y at the segment's front edge. */
const seg = (yc: number, zFront: number, amp: number, phase: number): JointSpec => ({ chan: 'tail', axis: 'y', amp, phase, pivot: [0, yc, zFront] });

/** A pair of small side fins; flutters gently. `lift` = rotation about z (droop), `sweep` = about y (swept back). */
function sideFins(o: { at: [number, number, number]; size: Vec3; uv: [number, number]; skin: SkinFn; sweep: number; droop: number; amp: number; axis?: 'y' | 'z' }): PartSpec[] {
  const [x, y, z] = o.at;
  const w = o.size[0];
  const axis = o.axis ?? 'z';
  return ([1, -1] as const).map(
    (s): PartSpec => ({
      at: [s * x, y, z],
      size: o.size,
      uv: o.uv,
      skin: o.skin,
      rot: [0, -s * o.sweep, -s * o.droop],
      joint: { chan: 'idle', axis, amp: (axis === 'z' ? s : -s) * o.amp, phase: s > 0 ? 0 : 0.4, pivot: [s * (x - w / 2), y, axis === 'y' ? z + o.size[2] / 2 : z] },
    })
  );
}

// ============================================================================================
// COD  (tan-brown mottled, darker back, pale belly, squarish tail)
// ============================================================================================
const CODC = {
  back: tones('#97754a', 0.07),
  flank: tones('#c4a275', 0.07),
  belly: tones('#ebdfc2', 0.04),
  dark: '#6c5036',
  light: '#e2cf9f',
};

const codBody =
  (f: Frame): SkinFn =>
  (g) =>
    paintWorld(g, f, 0, (x, y, z, face) => {
      if (face === 'top') return hash(z, x, 1) < 0.2 ? CODC.dark : pick(g, CODC.back);
      if (face === 'bottom') return pick(g, CODC.belly);
      if (y < 2.3) return pick(g, CODC.belly);
      if (y > 4.7) return hash(z, y, 2) < 0.22 ? CODC.dark : pick(g, CODC.back);
      if (Math.abs(y - 3.5) < 0.6) return g.rand() < 0.7 ? CODC.light : pick(g, CODC.flank);
      return hash(Math.floor(z * 0.7), Math.floor(y * 0.7), 3) < 0.28 && g.rand() < 0.85 ? CODC.dark : pick(g, CODC.flank);
    });

const codFinCol =
  (a: string, b: string, edge: string) =>
  (g: Paint, _z: number, _y: number, i: number, isEdge: boolean): string =>
    isEdge ? edge : (i % 2 ? pick(g, tones(a, 0.05)) : pick(g, tones(b, 0.05)));

function makeCod(): SpeciesSpec {
  const yc = 3.5;
  const uv = packer(64, 32);
  const jA = seg(yc, 4, 0.07, -0.3);
  const jB = seg(yc, 0, 0.15, -1.0);
  const jP = seg(yc, -3, 0.25, -1.7);
  const jT = seg(yc, -5, 0.4, -2.4);
  const dorsal = codFinCol('#b08c5c', '#9a7848', '#6c5036');
  const anal = codFinCol('#d3b484', '#c09c6c', '#8a6a44');
  const pecUV = uv([2, 1, 2]);
  return {
    kind: 'cod',
    name: { en: 'Cod', ar: 'سمك القد' },
    emoji: '🐟',
    tex: [64, 32],
    move: 'swim',
    speed: 1.5,
    hp: 3,
    minWater: 1,
    depth: [0.5, 2.5],
    habitat: { weight: 1.0, herd: [2, 4] },
    parts: [
      // snout with a pale chin barbel (cod have one) and the mouth line
      part([0, 3, 8.5], [2, 3, 1], uv([2, 3, 1]), (f) => (g) => {
        codBody(f)(g);
        g.rect('front', 0, 2, 2, 1, CODC.dark);
        g.rect('px', 0, 2, 1, 1, CODC.dark);
        g.rect('nx', 0, 2, 1, 1, CODC.dark);
      }),
      part([0, 1, 8.5], [1, 1, 1], uv([1, 1, 1]), () => (g) => g.fill('all', '#c9ad7c')),
      // head: eyes + gill slit
      part([0, 3.5, 6], [3, 5, 4], uv([3, 5, 4]), (f) => (g) => {
        codBody(f)(g);
        eye(g, 1, 1);
        g.rect('px', 3, 1, 1, 4, '#6f5236');
        g.rect('nx', 0, 1, 1, 4, '#6f5236');
        g.rect('front', 0, 4, 3, 1, CODC.light);
      }),
      part([0, 3.5, 2], [3, 5, 4], uv([3, 5, 4]), codBody, jA),
      part([0, 7.3, 2], [1, 3, 4], uv([1, 3, 4]), (f) => finSkin(f, 'bottom', [3, 3, 2, 1], dorsal), jA),
      part([0, 3.5, -1.5], [3, 4, 3], uv([3, 4, 3]), codBody, jB),
      part([0, 6.3, -1.5], [1, 2, 3], uv([1, 2, 3]), (f) => finSkin(f, 'bottom', [2, 2, 1], dorsal), jB),
      part([0, 1, -1.5], [1, 1, 3], uv([1, 1, 3]), (f) => finSkin(f, 'top', [1, 1, 1], anal), jB),
      part([0, 3.5, -4.5], [2, 3, 3], uv([2, 3, 3]), codBody, jP),
      part([0, 3.5, -7], [1, 6, 4], uv([1, 6, 4]), (f) => finSkin(f, 'mid', [2, 4, 6, 4], dorsal), jT),
      ...sideFins({
        at: [2.6, 2.5, 4.5],
        size: [2, 1, 2],
        uv: pecUV,
        skin: (g) => {
          g.speckle('all', tones('#c9a878', 0.07));
          g.rect('top', 0, 0, 2, 1, '#e3cfa6');
        },
        sweep: 0.55,
        droop: 0.35,
        amp: 0.3,
      }),
    ],
  };
}

// ============================================================================================
// SALMON  (long and slim: olive-gray back, silvery-pink flank and belly, red-orange tinge, forked tail)
// ============================================================================================
const SAL = {
  back: tones('#68745e', 0.07),
  upper: tones('#9ba692', 0.05),
  flank: tones('#d8c2b9', 0.05),
  belly: tones('#f6e6dc', 0.03),
  spot: '#2d3228',
  tinge: '#e0805c',
};

const salmonBody =
  (f: Frame): SkinFn =>
  (g) =>
    paintWorld(g, f, 0, (x, y, z, face) => {
      if (face === 'top') return hash(z, x, 4) < 0.22 ? SAL.spot : pick(g, SAL.back);
      if (face === 'bottom') return pick(g, SAL.belly);
      if (y < 2.9) return pick(g, SAL.belly);
      if (y > 5.4) return hash(z, y, 5) < 0.2 ? SAL.spot : pick(g, SAL.back);
      if (y > 4.4) return hash(z, y, 6) < 0.1 ? SAL.spot : pick(g, SAL.upper);
      // flank: silvery pink, with a red-orange tinge that gets stronger towards the tail
      const tinge = Math.min(0.6, Math.max(0.1, 0.18 + (3 - z) * 0.03)) * (y > 3.5 ? 1.5 : 0.8);
      return g.rand() < tinge ? SAL.tinge : pick(g, SAL.flank);
    });

const salFinCol =
  (a: string, b: string, edge: string) =>
  (g: Paint, _z: number, _y: number, i: number, isEdge: boolean): string =>
    isEdge ? edge : (i % 2 ? pick(g, tones(a, 0.05)) : pick(g, tones(b, 0.05)));

function makeSalmon(): SpeciesSpec {
  const yc = 4;
  const uv = packer(64, 32);
  const jA = seg(yc, 7, 0.05, -0.2);
  const jB = seg(yc, 2, 0.11, -0.8);
  const jC = seg(yc, -3, 0.18, -1.5);
  const jP = seg(yc, -7, 0.28, -2.2);
  const jT = seg(yc, -9, 0.42, -3.0);
  const tailCol = salFinCol('#e0734d', '#c8573b', '#8c3424');
  const dorsalCol = salFinCol('#80705f', '#6a5c4c', '#4a3d32');
  const lowCol = salFinCol('#e8946e', '#d97c56', '#a44f36');
  const pecUV = uv([2, 1, 3]);
  return {
    kind: 'salmon',
    scale: 0.85, // a real Minecraft salmon is ~1.6 blocks long: a little smaller reads better in a pond
    name: { en: 'Salmon', ar: 'سلمون' },
    emoji: '🐟',
    tex: [64, 32],
    move: 'swim',
    speed: 1.8,
    hp: 3,
    minWater: 1,
    depth: [0.5, 2.5],
    habitat: { weight: 0.8, herd: [2, 3] },
    parts: [
      // snout, a little pink on the jaw
      part([0, 3.8, 12], [2, 2, 2], uv([2, 2, 2]), (f) => (g) => {
        salmonBody(f)(g);
        g.rect('front', 0, 1, 2, 1, '#3a2a28');
        g.rect('px', 0, 1, 2, 1, '#3a2a28');
        g.rect('nx', 0, 1, 2, 1, '#3a2a28');
      }),
      part([0, 4, 9], [3, 4, 4], uv([3, 4, 4]), (f) => (g) => {
        salmonBody(f)(g);
        eye(g, 1, 1);
        g.rect('px', 3, 1, 1, 3, '#a98f86');
        g.rect('nx', 0, 1, 1, 3, '#a98f86');
      }),
      part([0, 4, 4.5], [3, 5, 5], uv([3, 5, 5]), salmonBody, jA),
      part([0, 7.5, 4.5], [1, 3, 3], uv([1, 3, 3]), (f) => finSkin(f, 'bottom', [3, 2, 1], dorsalCol), jA),
      part([0, 4, -0.5], [3, 5, 5], uv([3, 5, 5]), salmonBody, jB),
      part([0, 1, 0.5], [1, 2, 2], uv([1, 2, 2]), (f) => finSkin(f, 'top', [2, 2], lowCol), jB),
      part([0, 4, -5], [3, 4, 4], uv([3, 4, 4]), salmonBody, jC),
      part([0, 6.4, -4.5], [1, 1, 2], uv([1, 1, 2]), (f) => finSkin(f, 'bottom', [1, 1], dorsalCol), jC),
      part([0, 1.2, -5], [1, 2, 3], uv([1, 2, 3]), (f) => finSkin(f, 'top', [2, 1, 1], lowCol), jC),
      part([0, 4, -8.5], [2, 3, 3], uv([2, 3, 3]), salmonBody, jP),
      part([0, 4, -11], [1, 6, 4], uv([1, 6, 4]), (f) => finSkin(f, 'mid', [2, 4, 6, 6], tailCol, (i, y) => i >= 3 && y >= 2 && y <= 3), jT),
      ...sideFins({
        at: [2.6, 2.7, 6.5],
        size: [2, 1, 3],
        uv: pecUV,
        skin: (g) => {
          g.speckle('all', tones('#d9805f', 0.07));
          g.rect('top', 0, 0, 2, 1, '#f0b69a');
        },
        sweep: 0.6,
        droop: 0.35,
        amp: 0.3,
      }),
    ],
  };
}

// ============================================================================================
// PUFFERFISH  (a puffed-up round yellow body built from four interlocking boxes, orange fins, spikes, big eyes)
// ============================================================================================
const PUFF = {
  back: tones('#c8aa40', 0.06),
  side: tones('#eed264', 0.06),
  belly: tones('#f4ecbc', 0.03),
  spot: '#8f6c26',
  bump: '#cfa73c',
};

const puffBody =
  (f: Frame): SkinFn =>
  (g) =>
    paintWorld(g, f, 0, (x, y, z, face) => {
      let c: string;
      if (y < 3.4 || face === 'bottom') c = pick(g, PUFF.belly);
      else if (y > 6.6 || face === 'top') c = hash(x + z, y, 7) < 0.16 ? PUFF.spot : pick(g, PUFF.back);
      else c = hash(Math.floor(x * 0.8) + Math.floor(z * 0.8), Math.floor(y * 0.8), 8) < 0.1 ? shade(PUFF.side[2], -0.16) : pick(g, PUFF.side);
      // little spine bases on a regular lattice
      if (face !== 'bottom' && (Math.floor(x * 2) + Math.floor(z * 2) * 3 + Math.floor(y * 2) * 5) % 7 === 0 && y > 3.6) c = PUFF.bump;
      return c;
    });

const pufFin = (g: Paint, _z: number, _y: number, i: number, edge: boolean): string => (edge ? '#b4651c' : pick(g, tones(i % 2 ? '#f09a30' : '#e0841f', 0.04)));

function makePuffer(): SpeciesSpec {
  const yc = 5;
  const uv = packer(64, 32);
  const jT: JointSpec = { chan: 'tail', axis: 'y', amp: 0.45, phase: 0, pivot: [0, yc, -3.5] };
  const uvA = uv([8, 6, 6]);
  const uvB = uv([6, 4, 8]);
  const uvEye = uv([1, 3, 3]);
  const uvD = uv([7, 7, 7]);
  const uvC = uv([4, 8, 5]);
  const uvTail = uv([1, 5, 4]);
  const uvPec = uv([1, 3, 3]);
  const uvLips = uv([2, 2, 1]);
  const uvSpike = uv([1, 1, 1]);
  const spike = (at: Vec3): PartSpec => ({
    at,
    size: [1, 1, 1],
    uv: uvSpike,
    skin: (g) => {
      g.fill('all', '#f0d983');
      g.px('top', 0, 0, '#a8782a');
    },
  });
  const spikes: Vec3[] = [];
  for (const sx of [1, -1]) for (const sz of [1, -1]) spikes.push([sx, 9.5, sz], [sx, 0.5, sz]);
  for (const s of [1, -1]) spikes.push([s * 4.5, 7.5, -1.5], [s * 2, 6.2, -4.5]);
  const pecSkin: SkinFn = finSkin({ zF: 0, yT: 0 }, 'mid', [1, 2, 3], pufFin);
  return {
    kind: 'pufferfish',
    name: { en: 'Pufferfish', ar: 'سمكة منتفخة' },
    emoji: '🐡',
    tex: [64, 32],
    move: 'swim',
    speed: 0.9,
    hp: 4,
    minWater: 1,
    depth: [0.5, 2.5],
    habitat: { weight: 0.5, herd: [1, 1] },
    parts: [
      part([0, yc, 0], [8, 6, 6], uvA, puffBody),
      part([0, yc, 0], [6, 4, 8], uvB, puffBody),
      part([0, yc, 0], [7, 7, 7], uvD, puffBody),
      part([0, yc, 0], [4, 8, 5], uvC, puffBody),
      // big eyes: a white disc with a black pupil looking forward, poking out of each flank
      ...([1, -1] as const).map(
        (s): PartSpec => ({
          at: [s * 4.5, 6, 1.5],
          size: [1, 3, 3],
          uv: uvEye,
          skin: (g) => {
            g.fill('all', '#e9d36a');
            g.rect('px', 0, 0, 3, 3, '#f6f3e4');
            g.rect('nx', 0, 0, 3, 3, '#f6f3e4');
            g.rect('px', 0, 1, 2, 2, '#101016');
            g.rect('nx', 1, 1, 2, 2, '#101016');
            g.px('px', 0, 1, '#f6f3e4');
            g.px('nx', 2, 1, '#f6f3e4');
          },
        })
      ),
      // pouty lips
      {
        at: [0, 4.2, 4.5],
        size: [2, 2, 1],
        uv: uvLips,
        skin: (g) => {
          g.fill('all', '#e8a548');
          g.rect('front', 0, 1, 2, 1, '#6b3a1d');
        },
      },
      ...([1, -1] as const).map(
        (s): PartSpec => ({
          at: [s * 4.5, 4.2, -1.6],
          size: [1, 3, 3],
          uv: uvPec,
          skin: pecSkin,
          joint: { chan: 'idle', axis: 'y', amp: -s * 0.5, phase: s > 0 ? 0 : 0.5, pivot: [s * 4.5, 4.2, -0.1] },
        })
      ),
      part([0, yc, -5.5], [1, 5, 4], uvTail, (f) => finSkin(f, 'mid', [2, 3, 4, 5], pufFin), jT),
      ...spikes.map(spike),
    ],
  };
}

// ============================================================================================
// TROPICAL FISH  (small, flat-sided, tall dorsal + ventral fins, fan tail; six colour coats)
// ============================================================================================
const BLACK = '#17121a';

/** colour of the body at a world position for coat v (0 clownfish, 1 blue tang, 2 angelfish, 3 pink, 4 purple-gold, 5 green-yellow) */
function tropBody(g: Paint, v: number, _x: number, y: number, z: number, face: Face): string {
  const belly = y < 4.0 || face === 'bottom';
  const top = y > 7.0 || face === 'top';
  switch (v) {
    case 0: {
      // clownfish: orange with three white bands edged in black
      const bands: [number, number][] = [[3, 4.4], [-0.2, 1.2], [-4.6, -3.6]];
      let dist = 9;
      for (const [a, b] of bands) dist = Math.min(dist, z < a ? a - z : z > b ? z - b : 0);
      if (dist === 0) return pick(g, tones('#f6f3ea', 0.03));
      if (dist <= 0.8) return BLACK;
      return pick(g, tones(belly ? '#ffa854' : '#ff8a22', 0.05));
    }
    case 1: {
      // blue tang: royal blue, black palette stripe, yellow tail
      if (z < -3.2) return pick(g, tones('#ffd51e', 0.04));
      const stripe = 5.2 + (3 - z) * 0.13;
      if (z > -3.2 && z < 5.4 && Math.abs(y - stripe) < 0.7) return BLACK;
      if (z > 5.0 && z < 6.2 && y > 6.4 && y < 8) return BLACK;
      return pick(g, tones(belly ? '#6aa6ff' : top ? '#1f58d8' : '#2f7bff', 0.05));
    }
    case 2: {
      // yellow and black angelfish
      const band = (z > 2.4 && z < 3.9) || (z > -1.7 && z < -0.2);
      if (band && z < 4.5) return BLACK;
      return pick(g, tones(belly ? '#fff09a' : '#f7df45', 0.04));
    }
    case 3: {
      // pink with a pale stripe and freckles
      if (Math.abs(y - 5.3) < 0.55 && z > -4 && z < 6.5) return pick(g, tones('#ffe3ef', 0.03));
      if (g.rand() < 0.08) return '#ffb0cf';
      return pick(g, tones(belly ? '#ffc6dc' : top ? '#e8509a' : '#ff6fb0', 0.05));
    }
    case 4: {
      // purple in front, golden behind (dithered where they meet)
      const cut = 0.4 + (hash(z, y, 9) - 0.5) * 3.2;
      if (z < cut) return pick(g, tones(belly ? '#ffdc5a' : '#ffc81f', 0.05));
      return pick(g, tones(belly ? '#b57cf2' : top ? '#7438c8' : '#8a48e0', 0.05));
    }
    default: {
      // green above, yellow below, a dark green line between and thin stripes
      const edge = 6.1 + Math.sin(z * 0.9) * 0.45;
      if (Math.abs(y - edge) < 0.45) return '#1d7a34';
      if (y > edge) return hash(z, y, 10) < 0.12 ? '#5fd06a' : pick(g, tones(top ? '#31ad48' : '#3dc255', 0.05));
      if (z > -3.5 && z < 6 && Math.abs(((z + 20) % 3) - 1) < 0.5 && y > 3.2) return '#8fc43a';
      return pick(g, tones(belly ? '#fbe86a' : '#f4dc3a', 0.04));
    }
  }
}

const TROP_FIN: { dorsal: string; ventral: string; tail: string; pec: string; edge: string }[] = [
  { dorsal: '#ff8a22', ventral: '#ff8a22', tail: '#ff9a30', pec: '#ffa854', edge: BLACK },
  { dorsal: '#1e3fb8', ventral: '#1e3fb8', tail: '#ffd51e', pec: '#ffd51e', edge: '#0c1233' },
  { dorsal: '#f6d83c', ventral: '#f0cf30', tail: '#f9f3c4', pec: '#fff09a', edge: BLACK },
  { dorsal: '#c82a82', ventral: '#f78bb8', tail: '#ff7db8', pec: '#ffd3e6', edge: '#ff9fcb' },
  { dorsal: '#9a46d6', ventral: '#8a45d6', tail: '#ffd23a', pec: '#ffe27a', edge: '#6a32b8' },
  { dorsal: '#2a9a40', ventral: '#f4dc3a', tail: '#35b04a', pec: '#fbe86a', edge: '#e8d83a' },
];

function tropFin(kind: 'dorsal' | 'ventral' | 'tail'): (f: Frame) => SkinFn {
  const profiles = { dorsal: [4, 4, 3, 2] as number[], ventral: [3, 3, 2, 1] as number[], tail: [2, 4, 5, 6] as number[] };
  return (f) => (g) => {
    const v = g.variant;
    const pal = TROP_FIN[v];
    const base = pal[kind];
    finSkin(f, kind === 'dorsal' ? 'bottom' : kind === 'ventral' ? 'top' : 'mid', profiles[kind], (gg, z, _y, i, edge) => {
      if (v === 4 && kind === 'dorsal') return edge ? '#f7bf1c' : z > 0.4 ? pick(gg, tones('#9a46d6', 0.06)) : pick(gg, tones('#f7bf1c', 0.06));
      if (v === 4 && kind === 'ventral') return edge ? '#f7bf1c' : z > 0.4 ? pick(gg, tones('#8a45d6', 0.06)) : pick(gg, tones('#ffd24a', 0.06));
      if (edge) return pal.edge;
      return pick(gg, tones(i % 2 ? shade(base, 0.08) : shade(base, -0.06), 0.03));
    })(g);
  };
}

function makeTropical(): SpeciesSpec {
  const yc = 5.5;
  const uv = packer(64, 32);
  const jA = seg(yc, 4, 0.06, -0.3);
  const jB = seg(yc, 0, 0.14, -1.0);
  const jP = seg(yc, -3, 0.24, -1.7);
  const jT = seg(yc, -5, 0.4, -2.4);
  const body =
    (f: Frame): SkinFn =>
    (g) =>
      paintWorld(g, f, 0, (x, y, z, face) => tropBody(g, g.variant, x, y, z, face));
  const pecUV = uv([1, 2, 2]);
  return {
    kind: 'tropical_fish',
    scale: 0.8, // smaller than the cod, as in Minecraft
    name: { en: 'Tropical Fish', ar: 'سمكة استوائية' },
    emoji: '🐠',
    tex: [64, 32],
    variants: 6,
    move: 'swim',
    speed: 1.7,
    hp: 2,
    minWater: 1,
    depth: [0.5, 2.5],
    habitat: { weight: 0.9, herd: [2, 4] },
    parts: [
      part([0, 5, 7.5], [2, 3, 1], uv([2, 3, 1]), (f) => (g) => {
        body(f)(g);
        g.px('front', 0, 2, BLACK);
      }),
      part([0, 5.5, 5.5], [2, 4, 3], uv([2, 4, 3]), (f) => (g) => {
        body(f)(g);
        eye(g, 1, 1);
      }),
      part([0, 5.5, 2], [2, 5, 4], uv([2, 5, 4]), body, jA),
      part([0, 9.7, 2], [1, 4, 4], uv([1, 4, 4]), tropFin('dorsal'), jA),
      part([0, 1.8, 2], [1, 3, 4], uv([1, 3, 4]), tropFin('ventral'), jA),
      part([0, 5.5, -1.5], [2, 4, 3], uv([2, 4, 3]), body, jB),
      part([0, 8.7, -1.5], [1, 3, 3], uv([1, 3, 3]), tropFin('dorsal'), jB),
      part([0, 2.6, -1.5], [1, 2, 3], uv([1, 2, 3]), tropFin('ventral'), jB),
      part([0, 5.5, -4.5], [2, 2, 3], uv([2, 2, 3]), body, jP),
      part([0, 5.5, -7], [1, 6, 4], uv([1, 6, 4]), tropFin('tail'), jT),
      ...sideFins({
        at: [1.6, 4.7, 3.3],
        size: [1, 2, 2],
        uv: pecUV,
        skin: (g) => {
          const c = TROP_FIN[g.variant].pec;
          g.fill('all', c);
        },
        sweep: 0.4,
        droop: 0,
        amp: 0.3,
        axis: 'y',
      }),
    ],
  };
}

export const SPECIES: SpeciesSpec[] = [makeCod(), makeSalmon(), makePuffer(), makeTropical()];
