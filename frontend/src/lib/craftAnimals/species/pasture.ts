// Pasture animals: sheep, goat, mooshroom and rabbit.
// Each is a list of box parts + painters (see ../README.md and exemplars.ts). Atlas unwraps are placed by
// `pack()` below so the layout can never overlap; parts that share a skin function and a size share one unwrap.
import type { Face, Paint, PartSpec, SkinFn, SpeciesSpec } from '../types';
import { eyes, headDip, legs4, mix, shade, tailWag, tones } from './kit';

type Raw = Omit<PartSpec, 'uv'>;

/** Shelf-packs the unwraps of `raws` into the atlas and returns the finished parts. */
function pack(kind: string, tex: [number, number], raws: Raw[]): PartSpec[] {
  const [TW, TH] = tex;
  const ids = new Map<SkinFn, number>();
  const keyOf = (r: Raw) => {
    if (!ids.has(r.skin)) ids.set(r.skin, ids.size);
    return `${ids.get(r.skin)}|${r.size.join('x')}`;
  };
  const slots = new Map<string, { w: number; h: number; x: number; y: number }>();
  for (const r of raws) {
    const [w, h, d] = r.size;
    if (!slots.has(keyOf(r))) slots.set(keyOf(r), { w: 2 * d + 2 * w, h: d + h, x: 0, y: 0 });
  }
  let x = 0;
  let y = 0;
  let row = 0;
  for (const s of [...slots.values()].sort((a, b) => b.h - a.h || b.w - a.w)) {
    if (x + s.w > TW) {
      x = 0;
      y += row;
      row = 0;
    }
    if (y + s.h > TH) throw new Error(`pasture/${kind}: atlas ${TW}x${TH} is full`);
    s.x = x;
    s.y = y;
    x += s.w;
    row = Math.max(row, s.h);
  }
  return raws.map((r) => {
    const s = slots.get(keyOf(r))!;
    return { ...r, uv: [s.x, s.y] as [number, number] };
  });
}

const ALL: readonly Face[] = ['nx', 'front', 'px', 'back', 'top', 'bottom'];
const SIDES: readonly Face[] = ['nx', 'front', 'px', 'back'];

/** An irregular patch (a disc with two smaller discs hanging off it). */
function splotch(g: Paint, face: Face, cx: number, cy: number, r: number, color: string): void {
  g.blob(face, cx, cy, r, color);
  g.blob(face, cx + Math.round(r * 0.9), cy + 1, r * 0.55, color);
  g.blob(face, cx - Math.round(r * 0.6), cy - 1, r * 0.5, color);
}

// ======================================================================================================
// Sheep: the wool is one fluffy box over the whole body, a smaller one over the back of the head;
// the face and the lower legs stay bare.
// ======================================================================================================
const WOOL = ['#ecece7', '#a9a9a4', '#5c5f63', '#2b2b30', '#86582f', '#ef96b5'];
const WOOL_SPREAD = [0.085, 0.09, 0.14, 0.28, 0.13, 0.08];
const SHEEP_SKIN = '#c8ac8f';

/** Chunky 2x2 wool clumps laid like bricks; the lowest `lowerRows` rows are a little darker. */
function woolPaint(g: Paint, faces: readonly Face[], lowerRows = 0): void {
  const base = WOOL[g.variant];
  const sp = WOOL_SPREAD[g.variant];
  const pal = tones(base, sp);
  const low = tones(shade(base, -0.12), sp);
  for (const f of faces) {
    const { w, h } = g.size(f);
    for (let y = 0, r = 0; y < h; y += 2, r++) {
      const p = lowerRows && y >= h - lowerRows ? low : pal;
      for (let x = -(r & 1); x < w; x += 2) g.rect(f, x, y, 2, 2, p[(g.rand() * p.length) | 0]);
    }
  }
  g.grain(faces, shade(base, 0.22), 0.06);
}

const sheepBody: SkinFn = (g) => {
  woolPaint(g, ALL, 2);
  g.speckle('bottom', tones(shade(WOOL[g.variant], -0.25), WOOL_SPREAD[g.variant] * 0.5));
};
const sheepHeadWool: SkinFn = (g) => woolPaint(g, ALL);
const sheepFace: SkinFn = (g) => {
  g.speckle('all', tones(SHEEP_SKIN, 0.05));
  g.rect('top', 0, 0, 6, 8, shade(SHEEP_SKIN, -0.05));
  // eyes: pale outside, dark inside
  g.px('front', 0, 2, '#f2ecdc');
  g.px('front', 5, 2, '#f2ecdc');
  g.px('front', 1, 2, '#1b1b1f');
  g.px('front', 4, 2, '#1b1b1f');
  // muzzle
  g.rect('front', 1, 4, 4, 2, '#d8c2a6');
  g.px('front', 2, 4, '#8f7560');
  g.px('front', 3, 4, '#8f7560');
  g.rect('front', 2, 5, 2, 1, '#6e5848');
  g.rect('bottom', 0, 4, 6, 4, '#d8c2a6');
};
const sheepEar: SkinFn = (g) => {
  g.speckle('all', tones(shade(SHEEP_SKIN, -0.12), 0.05));
  g.rect('top', 0, 0, 3, 1, '#d9a79b');
};
const sheepLeg: SkinFn = (g) => {
  g.speckle('all', tones(shade(SHEEP_SKIN, -0.08), 0.06));
  for (const f of SIDES) g.rect(f, 0, 9, 4, 1, '#54443a');
  g.fill('bottom', '#4a3c32');
};
const sheepCuff: SkinFn = (g) => {
  woolPaint(g, ALL);
};

const sheepHead = headDip([0, 17.5, 7], 0.55);
const sheep: SpeciesSpec = {
  kind: 'sheep',
  name: { en: 'Sheep', ar: 'خروف' },
  emoji: '🐑',
  tex: [64, 64],
  variants: 6,
  move: 'walk',
  speed: 1.1,
  hp: 8,
  graze: true,
  habitat: { weight: 1.0, biomes: ['plains', 'forest', 'snowy'], herd: [2, 4] },
  parts: pack('sheep', [64, 64], [
    { at: [0, 14, 0], size: [11, 9, 18], skin: sheepBody },
    { at: [0, 18.5, 9.5], size: [6, 6, 8], skin: sheepFace, joint: sheepHead },
    { at: [0, 18.5, 8.5], size: [7, 7, 7], skin: sheepHeadWool, joint: sheepHead },
    ...[1, -1].map(
      (s): Raw => ({ at: [s * 5.2, 19.8, 9.2], size: [3, 2, 1], rot: [0, 0, -s * 0.6], skin: sheepEar, joint: sheepHead })
    ),
    ...legs4({ size: [4, 10, 4], x: 3.5, zFront: 5.5, zBack: -6, uv: [0, 0], skin: sheepLeg, amp: 0.8 }),
    // wool cuffs on the upper legs (same hip pivot as the bare legs, so they swing together)
    ...legs4({ size: [5, 5, 5], x: 3.5, zFront: 5.5, zBack: -6, uv: [0, 0], skin: sheepCuff, amp: 0.8 }).map(
      (p): Raw => ({ ...p, at: [p.at[0], 7.5, p.at[2]] })
    ),
  ]),
};

// ======================================================================================================
// Goat: stocky, short dark legs, a raised neck, a long face with a beard, two swept-back horns.
// ======================================================================================================
const GOAT_BODY = ['#d6d1c6', '#a69280'];
const GOAT_PATCH = ['#aaa498', '#7d6a58'];
const GOAT_LEG = ['#5f5851', '#4a3b2f'];
const GOAT_HEAD = ['#e2ddd2', '#bba995'];
const GOAT_BELLY = ['#ece8de', '#cdbfae'];
const GOAT_HORN = '#d9cfb4';

const goatBody: SkinFn = (g) => {
  const v = g.variant;
  g.speckle('all', tones(GOAT_BODY[v], 0.06));
  g.speckle('top', tones(shade(GOAT_BODY[v], -0.1), 0.06));
  g.speckle('bottom', tones(GOAT_BELLY[v], 0.04));
  // shaggy darker mottling over the shoulders and rump (nx: head on the right, px: head on the left)
  splotch(g, 'px', 3, 2, 2.2, GOAT_PATCH[v]);
  splotch(g, 'px', 10, 5, 1.8, GOAT_PATCH[v]);
  splotch(g, 'nx', 10, 2, 2.2, GOAT_PATCH[v]);
  splotch(g, 'nx', 3, 5, 1.8, GOAT_PATCH[v]);
  splotch(g, 'top', 2, 3, 2, GOAT_PATCH[v]);
  splotch(g, 'top', 5, 10, 1.8, GOAT_PATCH[v]);
  splotch(g, 'front', 3, 3, 2, GOAT_PATCH[v]);
  g.grain(['nx', 'px'], shade(GOAT_BODY[v], 0.18), 0.1);
};
const goatNeck: SkinFn = (g) => {
  g.speckle('all', tones(shade(GOAT_BODY[g.variant], 0.04), 0.06));
  g.grain('sides', GOAT_PATCH[g.variant], 0.12);
};
const goatHeadSkin: SkinFn = (g) => {
  const v = g.variant;
  g.speckle('all', tones(GOAT_HEAD[v], 0.05));
  g.speckle('top', tones(shade(GOAT_HEAD[v], -0.1), 0.05));
  // amber eyes with a dark horizontal pupil (seen from the front and from both sides)
  g.px('front', 0, 2, '#e4b94a');
  g.px('front', 1, 2, '#17120c');
  g.px('front', 4, 2, '#17120c');
  g.px('front', 5, 2, '#e4b94a');
  g.px('nx', 3, 2, '#e4b94a');
  g.px('nx', 4, 2, '#17120c');
  g.px('px', 0, 2, '#17120c');
  g.px('px', 1, 2, '#e4b94a');
  g.rect('front', 1, 0, 4, 1, shade(GOAT_PATCH[v], 0.05));
};
const goatSnout: SkinFn = (g) => {
  const v = g.variant;
  const base = mix(GOAT_HEAD[v], '#efe7da', 0.4);
  g.speckle('all', tones(base, 0.04));
  g.rect('front', 1, 0, 2, 1, '#5d4a40');
  g.rect('front', 1, 2, 2, 1, '#8c776a');
  g.rect('bottom', 0, 3, 4, 2, '#8c776a');
};
const goatBeard: SkinFn = (g) => {
  g.speckle('all', tones('#ece5d6', 0.05));
  g.grain('sides', '#b9ad98', 0.2);
};
const goatHorn: SkinFn = (g) => {
  g.speckle('all', tones(GOAT_HORN, 0.04));
  g.band('sides', 1, 2, '#b3a789');
  g.band('sides', 3, 4, '#b3a789');
  g.rect('top', 0, 0, 2, 2, '#8e8470');
};
const goatEar: SkinFn = (g) => {
  g.speckle('all', tones(GOAT_HEAD[g.variant], 0.06));
  g.rect('top', 0, 0, 3, 2, '#dcaaa0');
};
const goatLeg: SkinFn = (g) => {
  const v = g.variant;
  g.speckle('all', tones(GOAT_BODY[v], 0.06));
  for (const f of SIDES) {
    g.rect(f, 0, 3, 3, 5, GOAT_LEG[v]);
    g.speckle(f, tones(GOAT_LEG[v], 0.1));
    g.rect(f, 0, 0, 3, 3, GOAT_BODY[v]);
    g.rect(f, 0, 6, 3, 1, '#a79b8d');
    g.rect(f, 0, 6, 3, 2, '#2c2622');
  }
  g.speckle('top', tones(GOAT_BODY[v], 0.06));
  g.fill('bottom', '#2a2420');
};
const goatTail: SkinFn = (g) => g.speckle('all', tones(shade(GOAT_BODY[g.variant], -0.05), 0.07));

const goatHeadJoint = headDip([0, 17.5, 6.5], 0.5);
const goat: SpeciesSpec = {
  kind: 'goat',
  name: { en: 'Goat', ar: 'ماعز' },
  emoji: '🐐',
  tex: [64, 64],
  variants: 2,
  move: 'walk',
  speed: 1.5,
  hp: 10,
  graze: true,
  habitat: { weight: 0.6, biomes: ['snowy', 'plains'], herd: [1, 3] },
  parts: pack('goat', [64, 64], [
    { at: [0, 11, -0.5], size: [9, 9, 13], skin: goatBody },
    { at: [0, 16, 5], size: [5, 8, 4], rot: [0.45, 0, 0], skin: goatNeck },
    { at: [0, 19, 8.5], size: [6, 5, 5], skin: goatHeadSkin, joint: goatHeadJoint },
    { at: [0, 17.8, 12.5], size: [4, 3, 5], skin: goatSnout, joint: goatHeadJoint },
    { at: [0, 15.3, 13.5], size: [2, 4, 1], skin: goatBeard, joint: goatHeadJoint },
    ...[1, -1].map(
      (s): Raw => ({ at: [s * 2.1, 23.1, 6.2], size: [2, 4, 2], rot: [-0.7, 0, -s * 0.15], skin: goatHorn, joint: goatHeadJoint })
    ),
    ...[1, -1].map(
      (s): Raw => ({ at: [s * 4.5, 20.3, 7.6], size: [3, 1, 2], rot: [0, 0, -s * 0.3], skin: goatEar, joint: goatHeadJoint })
    ),
    ...legs4({ size: [3, 7, 3], x: 3, zFront: 4, zBack: -4.5, uv: [0, 0], skin: goatLeg, amp: 0.9 }),
    { at: [0, 14.7, -7.4], size: [2, 3, 1], rot: [-0.3, 0, 0], skin: goatTail, joint: tailWag([0, 13.5, -7], 0.5) },
  ]),
};

// ======================================================================================================
// Mooshroom: the cow's frame in red (or brown) with white blotches and mushrooms growing on its back.
// ======================================================================================================
const MOO_HIDE = ['#a9231b', '#7a5130'];
const MOO_SPOT = ['#ece7da', '#d9c8a6'];
const CAP = ['#de3524', '#a2713f'];
const CAP_SPOT = ['#f2ede2', '#cfae7e'];

const mooBody: SkinFn = (g) => {
  const hide = MOO_HIDE[g.variant];
  const spot = MOO_SPOT[g.variant];
  g.speckle('all', tones(hide, 0.09));
  g.speckle('bottom', tones(shade(hide, -0.12), 0.05));
  splotch(g, 'px', 4, 3, 3, spot);
  splotch(g, 'px', 12, 6, 2.4, spot);
  splotch(g, 'nx', 13, 3, 3.2, spot);
  splotch(g, 'nx', 5, 7, 2.6, spot);
  splotch(g, 'top', 3, 4, 3, spot);
  splotch(g, 'top', 8, 11, 3.2, spot);
  splotch(g, 'top', 4, 15, 2, spot);
  splotch(g, 'back', 4, 4, 2.4, spot);
  splotch(g, 'front', 8, 5, 2.2, spot);
};
const mooHead: SkinFn = (g) => {
  const hide = MOO_HIDE[g.variant];
  g.speckle('all', tones(hide, 0.09));
  eyes(g, 'front', 3, 5, '#15151c', true);
  g.blob('top', 2, 3, 1.5, MOO_SPOT[g.variant]);
  g.blob('front', 2, 0, 1.2, MOO_SPOT[g.variant]);
  g.blob('nx', 4, 2, 1.5, MOO_SPOT[g.variant]);
  g.blob('px', 1, 5, 1.5, MOO_SPOT[g.variant]);
};
const mooMuzzle: SkinFn = (g) => {
  g.fill('all', '#ecd0c0');
  g.px('front', 1, 1, '#a8665a');
  g.px('front', 4, 1, '#a8665a');
};
const mooHorn: SkinFn = (g) => g.fill('all', '#e9e2c9');
const mooEar: SkinFn = (g) => g.speckle('all', tones(shade(MOO_HIDE[g.variant], -0.25), 0.06));
const mooLeg: SkinFn = (g) => {
  g.speckle('all', tones(MOO_HIDE[g.variant], 0.08));
  for (const f of SIDES) g.rect(f, 0, 7, 4, 3, '#3a3a3e');
  g.fill('bottom', '#2e2e32');
};
const mooUdder: SkinFn = (g) => g.speckle('all', tones('#e9b3a8', 0.05));
const mooTail: SkinFn = (g) => {
  g.speckle('all', tones(shade(MOO_HIDE[g.variant], -0.3), 0.08));
  g.rect('front', 0, 6, 2, 3, '#1a1a1c');
};
const mushCap: SkinFn = (g) => {
  const v = g.variant;
  const spot = CAP_SPOT[v];
  g.speckle('all', tones(CAP[v], 0.09));
  g.speckle('bottom', tones('#e7dcc0', 0.04));
  const top = g.size('top');
  g.blob('top', 1, 1, 1, spot);
  g.blob('top', top.w - 2, top.h - 2, 1, spot);
  if (top.w > 4) g.blob('top', Math.floor(top.w / 2), Math.floor(top.h / 2) + 1, 0.8, spot);
  g.grain('sides', spot, v === 0 ? 0.12 : 0.05);
};
const mushStem: SkinFn = (g) => {
  g.speckle('all', tones('#e6dcc3', 0.06));
  g.grain('sides', '#bcae90', 0.12);
};

const mooHeadJoint = headDip([0, 17, 9], 0.55);
const mooshroom: SpeciesSpec = {
  kind: 'mooshroom',
  name: { en: 'Mooshroom', ar: 'موشروم' },
  emoji: '🍄',
  tex: [128, 64],
  variants: 2,
  move: 'walk',
  speed: 1.1,
  hp: 10,
  graze: true,
  habitat: { weight: 0.15, biomes: ['forest'], herd: [1, 2] },
  parts: pack('mooshroom', [128, 64], [
    { at: [0, 15, 0], size: [12, 10, 18], skin: mooBody },
    { at: [0, 17, 11.5], size: [8, 8, 6], skin: mooHead, joint: mooHeadJoint },
    { at: [0, 15.2, 14.6], size: [6, 3, 1], skin: mooMuzzle, joint: mooHeadJoint },
    ...[1, -1].map((s): Raw => ({ at: [s * 4.6, 22.2, 10.5], size: [1, 3, 1], skin: mooHorn, joint: mooHeadJoint })),
    ...[1, -1].map((s): Raw => ({ at: [s * 4.8, 18.4, 9.8], size: [2, 1, 3], skin: mooEar, joint: mooHeadJoint })),
    ...legs4({ size: [4, 10, 4], x: 4, zFront: 6.5, zBack: -6.5, uv: [0, 0], skin: mooLeg }),
    { at: [0, 8.6, -4], size: [4, 2, 5], skin: mooUdder },
    { at: [0, 16.5, -10], size: [2, 9, 1], rot: [0.15, 0, 0], skin: mooTail, joint: { chan: 'tail', axis: 'x', amp: 0.25, pivot: [0, 20, -9.5] } },
    // three mushrooms on the back
    { at: [-3, 22, 4], size: [2, 4, 2], skin: mushStem },
    { at: [-3, 25.5, 4], size: [6, 3, 6], skin: mushCap },
    { at: [3.5, 21.5, -1], size: [2, 3, 2], skin: mushStem },
    { at: [3.5, 24, -1], size: [5, 2, 5], skin: mushCap },
    { at: [-2.5, 21, -6.5], size: [2, 2, 2], skin: mushStem },
    { at: [-2.5, 23, -6.5], size: [4, 2, 4], skin: mushCap },
  ]),
};

// ======================================================================================================
// Rabbit: crouched, big hind legs (they kick together when it hops), long ears, a little white scut.
// ======================================================================================================
const COAT = ['#8a6a47', '#ecebe6', '#2c2825', '#c9a257', '#8a8176', '#efeeea'];
const BELLY = ['#d8c6a8', '#fbfaf6', '#4a4440', '#ead9a4', '#cfc8bb', '#fbfaf6'];
const SCUT = ['#f4f2ed', '#ffffff', '#3a3532', '#f1e6c6', '#ebe7de', '#ffffff'];
const SALT_PEPPER = ['#8d857a', '#b0a79a', '#2d2a27', '#d6cfc2', '#6a635a'];
const BLACK_PATCH = '#26221f';
const coatPal = (v: number): string[] => (v === 4 ? SALT_PEPPER : tones(COAT[v], v === 2 ? 0.18 : 0.07));

const rabbitBody: SkinFn = (g) => {
  const v = g.variant;
  g.speckle('all', coatPal(v));
  g.speckle('bottom', tones(BELLY[v], 0.04));
  if (v === 0 || v === 3) g.speckle('top', tones(shade(COAT[v], -0.15), 0.06));
  if (v === 5) {
    splotch(g, 'top', 1, 2, 1.6, BLACK_PATCH);
    splotch(g, 'top', 3, 6, 1.4, BLACK_PATCH);
    splotch(g, 'px', 5, 2, 2, BLACK_PATCH);
    splotch(g, 'px', 2, 0, 1.4, BLACK_PATCH);
    splotch(g, 'nx', 3, 3, 2, BLACK_PATCH);
    splotch(g, 'back', 3, 1, 1.4, BLACK_PATCH);
  }
};
const rabbitHead: SkinFn = (g) => {
  const v = g.variant;
  g.speckle('all', coatPal(v));
  g.rect('front', 1, 2, 3, 2, v === 2 ? '#4a4440' : shade(COAT[v], v === 4 ? 0.25 : 0.38));
  g.px('front', 2, 3, shade(COAT[v], v === 1 || v === 5 ? -0.25 : -0.4));
  // eyes sit on the sides of the head (nx: front on the right, px: front on the left)
  const ring = v === 2 ? '#5d5650' : shade(COAT[v], 0.3);
  g.px('nx', 3, 1, '#0d0d10');
  g.px('px', 1, 1, '#0d0d10');
  g.px('nx', 3, 0, ring);
  g.px('px', 1, 0, ring);
  if (v === 5) {
    splotch(g, 'top', 1, 1, 1.4, BLACK_PATCH);
    g.rect('nx', 0, 0, 3, 3, BLACK_PATCH);
    g.px('nx', 3, 1, '#d8d8d8');
    g.px('nx', 4, 1, '#0d0d10');
  }
};
const rabbitNose: SkinFn = (g) => g.fill('all', '#e59aa2');
const rabbitEar: SkinFn = (g) => {
  const v = g.variant;
  g.speckle('all', v === 5 ? tones(BLACK_PATCH, 0.2) : coatPal(v));
  const inner = v === 2 || v === 5 ? '#6a3f46' : mix(COAT[v], '#e8a7ad', 0.6);
  g.rect('front', 0, 1, 2, 4, inner);
};
const rabbitThigh: SkinFn = (g) => {
  const v = g.variant;
  g.speckle('all', coatPal(v));
  g.speckle('bottom', tones(BELLY[v], 0.04));
  if (v === 5) splotch(g, 'px', 2, 2, 1.8, BLACK_PATCH);
};
const rabbitFoot: SkinFn = (g) => {
  const v = g.variant;
  g.speckle('all', tones(v === 2 ? '#3a3531' : v === 4 ? '#a79e91' : shade(COAT[v], 0.12), 0.06));
};
const rabbitFore: SkinFn = (g) => {
  const v = g.variant;
  g.speckle('all', coatPal(v));
  for (const f of SIDES) g.rect(f, 0, 3, 2, 2, v === 2 ? '#3a3531' : shade(COAT[v], v === 1 || v === 5 ? -0.08 : 0.15));
};
const rabbitScut: SkinFn = (g) => {
  const c = SCUT[g.variant];
  g.speckle('all', [c, shade(c, g.variant === 2 ? 0.08 : -0.05), shade(c, g.variant === 2 ? -0.1 : -0.1)]);
};

const rabbit: SpeciesSpec = {
  kind: 'rabbit',
  name: { en: 'Rabbit', ar: 'أرنب' },
  emoji: '🐰',
  tex: [64, 32],
  variants: 6,
  move: 'hop',
  hop: 5.5,
  speed: 2.2,
  hp: 3,
  habitat: { weight: 0.9, herd: [1, 3] },
  parts: pack('rabbit', [64, 32], [
    { at: [0, 6.5, -0.5], size: [5, 5, 9], rot: [0.2, 0, 0], skin: rabbitBody },
    { at: [0, 6.5, 6], size: [5, 4, 5], skin: rabbitHead },
    { at: [0, 6.6, 9], size: [1, 1, 1], skin: rabbitNose },
    ...[1, -1].map(
      (s): Raw => ({
        at: [s * 1.4, 11.3, 5.2],
        size: [2, 5, 1],
        rot: [-0.1, 0, -s * 0.12],
        skin: rabbitEar,
        joint: { chan: 'idle', axis: 'x', amp: 0.09, phase: s > 0 ? 0 : 2.2, pivot: [s * 1.4, 9, 5.2] },
      })
    ),
    // big hind legs: thigh + long foot swing together about the hip
    ...[1, -1].flatMap((s): Raw[] => [
      { at: [s * 3.2, 3.5, -3], size: [2, 5, 5], skin: rabbitThigh, joint: { chan: 'walk', axis: 'x', amp: 0.7, pivot: [s * 3.2, 6, -3] } },
      { at: [s * 3.2, 0.5, -1.5], size: [2, 1, 6], skin: rabbitFoot, joint: { chan: 'walk', axis: 'x', amp: 0.7, pivot: [s * 3.2, 6, -3] } },
    ]),
    ...[1, -1].map(
      (s): Raw => ({ at: [s * 1.5, 2.5, 3.5], size: [2, 5, 2], skin: rabbitFore, joint: { chan: 'walk', axis: 'x', amp: -0.6 } })
    ),
    { at: [0, 7.3, -5.5], size: [3, 3, 2], skin: rabbitScut },
  ]),
};

export const SPECIES: SpeciesSpec[] = [sheep, goat, mooshroom, rabbit];
