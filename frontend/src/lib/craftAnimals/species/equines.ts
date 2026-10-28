// Equines and camelids: horse, donkey, mule, llama, trader llama, camel.
// The three horse-likes share one builder (a body, a neck tilted forward, a head with a muzzle, ears, a mane,
// a tail and four three-piece legs with hooves); llamas and the camel are laid out by hand.
import type { Face, Paint, PartSpec, SkinFn, SpeciesSpec, Vec3 } from '../types';
import { headDip, shade, tailWag, tones } from './kit';

// ---- helpers ------------------------------------------------------------------------------------

/** Sprinkle `c` (a colour or a palette) over the pixel rectangle [x0,x1) x [y0,y1) of one face with probability p. */
function scatter(g: Paint, face: Face, x0: number, y0: number, x1: number, y1: number, c: string | readonly string[], p: number): void {
  const list = typeof c === 'string' ? [c] : c;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (g.rand() < p) g.px(face, x, y, list[(g.rand() * list.length) | 0]);
}

/** Group-local -> world: a group pivoting at `p`, tipped forward by `th` (positive = the front goes down, like rot x). */
const frame =
  (p: Vec3, th: number) =>
  (x: number, y: number, z: number): Vec3 => {
    const c = Math.cos(th);
    const s = Math.sin(th);
    return [p[0] + x, p[1] + y * c - z * s, p[2] + y * s + z * c];
  };

/** First-fit pack of the unwraps (largest first) into a W x H atlas: returns each key's uv. validateSpecies catches an overflow. */
function packAll<K extends string>(sizes: Record<K, Vec3>, W: number, H: number): Record<K, [number, number]> {
  const out = {} as Record<K, [number, number]>;
  const placed: { x: number; y: number; w: number; h: number }[] = [];
  const area = ([w, h, d]: Vec3) => 2 * (d + w) * (d + h);
  const entries = (Object.entries(sizes) as [K, Vec3][]).sort((a, b) => area(b[1]) - area(a[1]));
  for (const [k, [w, h, d]] of entries) {
    const uw = 2 * (d + w);
    const uh = d + h;
    let spot: [number, number] | null = null;
    for (let y = 0; y + uh <= H && !spot; y++) {
      for (let x = 0; x + uw <= W && !spot; x++) {
        if (!placed.some((r) => x < r.x + r.w && r.x < x + uw && y < r.y + r.h && r.y < y + uh)) spot = [x, y];
      }
    }
    spot ??= [0, 0]; // does not fit: validateSpecies reports the overlap
    placed.push({ x: spot[0], y: spot[1], w: uw, h: uh });
    out[k] = spot;
  }
  return out;
}

const hairTones = (c: string) => tones(c, 0.14);
/** A small dark eye with a highlight pixel. */
const eye = (g: Paint, f: Face, x: number, y: number, hi = x) => {
  g.rect(f, x, y, 2, 2, '#150e0a');
  g.px(f, hi, y, '#6b5646');
};
const SOCK = '#efe9df';

// ---- the horse / donkey / mule builder ----------------------------------------------------------

interface Look {
  coat: string;
  hair: string;
  belly: string;
  nose: string;
  /** the muzzle is wholly the nose colour (donkey: pale, mule: dark) */
  noseFull?: boolean;
  blaze?: boolean;
  star?: boolean;
  socks?: boolean;
  dapple?: boolean;
  /** donkey: dark stripe along the back and across the shoulders, and a clean pale belly */
  stripe?: string;
}

interface EquineO {
  tex: [number, number];
  looks: Look[];
  body: Vec3; // w, h, l
  lh: number; // leg length (feet to body underside)
  neck: Vec3; // w, length, d
  head: Vec3;
  muzzle: Vec3;
  ear: Vec3;
  earTilt: number;
  mane: { h: number; d: number; short?: boolean };
  tail: { w: number; len: number; tuft?: number };
  tilt: number; // neck + head tilt, radians
  legAmp: number;
}

function equine(o: EquineO): PartSpec[] {
  const [bw, bh, bl] = o.body;
  const top = o.lh + bh;
  const P: Vec3 = [0, top - 1, bl / 2 - 0.5]; // base of the neck: front edge of the back
  const dip = headDip(P, 0.5);
  const at = frame(P, o.tilt);
  const rot: Vec3 = [o.tilt, 0, 0];
  const [, nl, nd] = o.neck;
  const [hw, hh, hd] = o.head;
  const [, mh, md] = o.muzzle;
  const [ew, eh, ed] = o.ear;
  const y0 = -4;
  const hTop = y0 + nl + 1.5;
  const L = (g: Paint): Look => o.looks[g.variant];

  const uh = Math.ceil((o.lh - 2) * 0.6);
  const ch = o.lh - 2 - uh;
  const maneH = o.mane.h;
  const tw = o.tail.w;
  const sizes: Record<string, Vec3> = {
    body: o.body,
    neck: o.neck,
    head: o.head,
    muzzle: o.muzzle,
    ear: o.ear,
    mane: [2, maneH, o.mane.d],
    upper: [4, uh + 1, 4],
    cannon: [3, ch, 3],
    hoof: [4, 2, 4],
    tailUp: [tw, tw, 5],
    tailLow: [tw, o.tail.len, tw],
  };
  if (o.tail.tuft) sizes.tuft = [tw + 1, o.tail.tuft, tw + 1];
  const uv = packAll(sizes, o.tex[0], o.tex[1]);

  // ---- skins
  const bodySkin: SkinFn = (g) => {
    const l = L(g);
    g.speckle('all', tones(l.coat, 0.06));
    g.speckle('top', tones(shade(l.coat, -0.07), 0.05));
    g.speckle('bottom', tones(l.belly, 0.04));
    for (const f of ['nx', 'px'] as const) {
      const { w, h } = g.size(f);
      scatter(g, f, 0, h - 3, w, h, l.belly, l.stripe ? 0.4 : 0.25);
      scatter(g, f, 0, h - 2, w, h, l.belly, l.stripe ? 0.9 : 0.35);
      scatter(g, f, 0, h - 1, w, h, l.belly, l.stripe ? 1 : 0.6);
      scatter(g, f, 0, 0, w, 2, shade(l.coat, -0.12), 0.25);
      if (l.dapple) {
        for (let i = 0; i < 7; i++) g.blob(f, 2 + ((g.rand() * (w - 4)) | 0), 2 + ((g.rand() * (h - 5)) | 0), 1.4, shade(l.coat, g.rand() < 0.5 ? 0.13 : -0.12));
      }
    }
    g.grain('all', shade(l.coat, 0.1), 0.04);
    if (l.stripe) {
      const t = g.size('top');
      const d = g.size('nx').w;
      g.rect('top', (t.w >> 1) - 1, 0, 2, t.h, l.stripe);
      g.rect('top', 0, t.h - 9, t.w, 3, l.stripe);
      g.rect('nx', d - 9, 0, 3, 5, l.stripe);
      g.rect('px', 6, 0, 3, 5, l.stripe);
    }
  };
  const neckSkin: SkinFn = (g) => {
    const l = L(g);
    g.speckle('all', tones(l.coat, 0.06));
    scatter(g, 'front', 0, g.h - 5, g.w, g.h, l.belly, 0.3);
    scatter(g, 'nx', 0, 0, g.d, 3, shade(l.coat, -0.1), 0.2);
    scatter(g, 'px', 0, 0, g.d, 3, shade(l.coat, -0.1), 0.2);
  };
  const headSkin: SkinFn = (g) => {
    const l = L(g);
    g.speckle('all', tones(l.coat, 0.05));
    scatter(g, 'nx', 0, g.h - 2, g.d, g.h, shade(l.coat, -0.12), 0.35);
    scatter(g, 'px', 0, g.h - 2, g.d, g.h, shade(l.coat, -0.12), 0.35);
    if (l.blaze) {
      g.rect('front', (g.w - 2) >> 1, 0, 2, g.h, SOCK);
      g.rect('top', (g.w - 2) >> 1, 0, 2, g.d, SOCK);
    }
    if (l.star) g.rect('front', (g.w - 2) >> 1, 1, 2, 2, SOCK);
    // eyes wrap round the corners of the face so they read from the front and the side
    eye(g, 'nx', g.d - 2, 1, g.d - 2);
    eye(g, 'px', 0, 1, 1);
    g.rect('front', 0, 1, 1, 2, '#150e0a');
    g.rect('front', g.w - 1, 1, 1, 2, '#150e0a');
  };
  const muzzleSkin: SkinFn = (g) => {
    const l = L(g);
    const nose = tones(l.nose, 0.05);
    g.speckle('all', l.noseFull ? nose : tones(l.coat, 0.05));
    if (!l.noseFull) {
      scatter(g, 'nx', 0, g.h - 3, g.d, g.h, nose, 0.9);
      scatter(g, 'px', 0, g.h - 3, g.d, g.h, nose, 0.9);
      scatter(g, 'front', 0, 0, g.w, g.h, nose, 1);
      scatter(g, 'bottom', 0, 0, g.w, g.d, nose, 1);
    }
    if (l.blaze) {
      g.rect('top', 1, 0, 2, g.d, SOCK);
      g.rect('front', 1, 0, 2, 3, SOCK);
    }
    g.px('front', 0, 1, '#1b110d');
    g.px('front', g.w - 1, 1, '#1b110d');
    g.rect('front', 0, g.h - 1, g.w, 1, shade(l.nose, -0.35));
  };
  const earSkin: SkinFn = (g) => {
    const l = L(g);
    g.speckle('all', tones(shade(l.coat, -0.06), 0.04));
    g.speckle('front', tones(shade(l.belly, 0.08), 0.04));
    g.rect('top', 0, 0, g.w, g.d, shade(l.coat, -0.35));
  };
  const maneSkin: SkinFn = (g) => {
    const l = L(g);
    g.speckle('all', hairTones(l.hair));
    g.grain('all', shade(l.hair, 0.22), 0.1);
    g.grain('all', shade(l.hair, -0.3), 0.08);
  };
  const tuftSkin: SkinFn = (g) => {
    const l = L(g);
    g.speckle('all', hairTones(shade(l.hair, -0.1)));
    g.grain('all', shade(l.hair, 0.15), 0.1);
  };
  const upperSkin: SkinFn = (g) => {
    const l = L(g);
    g.speckle('all', tones(l.coat, 0.06));
    scatter(g, 'front', 0, 0, g.w, 2, shade(l.coat, -0.1), 0.3);
  };
  const cannonSkin: SkinFn = (g) => {
    const l = L(g);
    g.speckle('all', l.socks ? tones(SOCK, 0.03) : tones(shade(l.coat, -0.08), 0.05));
  };
  const hoofSkin: SkinFn = (g) => g.speckle('all', ['#2c2622', '#38302a', '#241f1b']);

  // ---- parts
  const parts: PartSpec[] = [];
  parts.push({ at: [0, o.lh + bh / 2, 0], size: o.body, uv: uv.body, skin: bodySkin });
  parts.push({ at: at(0, y0 + nl / 2, (4 - nd) / 2), size: o.neck, uv: uv.neck, rot, joint: dip, skin: neckSkin });
  parts.push({ at: at(0, hTop - hh / 2, (4 - hd) / 2), size: o.head, uv: uv.head, rot, joint: dip, skin: headSkin });
  parts.push({ at: at(0, hTop - mh / 2 - 0.5, 2 + md / 2), size: o.muzzle, uv: uv.muzzle, rot, joint: dip, skin: muzzleSkin });
  for (const s of [1, -1]) {
    parts.push({
      at: at(s * (hw / 2 - ew / 2 - 0.2), hTop + eh / 2 - 0.5, -(hd - 2) + ed / 2 + 0.5),
      size: o.ear,
      uv: uv.ear,
      rot: [o.tilt, 0, -s * o.earTilt],
      joint: dip,
      skin: earSkin,
    });
  }
  const maneZ = -(nd - 2) - o.mane.d / 2 + 1;
  parts.push({
    at: at(0, o.mane.short ? hTop - maneH / 2 : y0 + maneH / 2, maneZ),
    size: [2, maneH, o.mane.d],
    uv: uv.mane,
    rot,
    joint: dip,
    skin: maneSkin,
  });

  // tail: a short stub angled back and down, then a hanging switch
  const B: Vec3 = [0, top - 2, -bl / 2 + 1];
  const tj = tailWag(B, 0.3);
  const tailAt = frame(B, -0.5);
  parts.push({ at: tailAt(0, 0, -2.5), size: [tw, tw, 5], uv: uv.tailUp, rot: [-0.5, 0, 0], joint: tj, skin: maneSkin });
  const end = tailAt(0, 0, -5);
  const lean = 0.2;
  const lowAt = frame(end, lean);
  parts.push({ at: lowAt(0, -o.tail.len / 2 + 1, 0), size: [tw, o.tail.len, tw], uv: uv.tailLow, rot: [lean, 0, 0], joint: tj, skin: maneSkin });
  if (o.tail.tuft) {
    parts.push({ at: lowAt(0, -o.tail.len - o.tail.tuft / 2 + 1.5, 0), size: [tw + 1, o.tail.tuft, tw + 1], uv: uv.tuft, rot: [lean, 0, 0], joint: tj, skin: tuftSkin });
  }

  // legs: thigh, cannon, hoof, all swinging about the hip
  const lx = bw / 2 - 2;
  const zF = bl / 2 - 3.5;
  const legs: [number, number, number][] = [
    [1, zF, 0],
    [-1, zF, Math.PI],
    [1, -zF, Math.PI],
    [-1, -zF, 0],
  ];
  for (const [sx, z, phase] of legs) {
    const x = sx * lx;
    const joint = { chan: 'walk' as const, axis: 'x' as const, amp: o.legAmp, phase, pivot: [x, o.lh, z] as Vec3 };
    parts.push({ at: [x, o.lh - uh / 2 + 0.5, z], size: [4, uh + 1, 4], uv: uv.upper, joint, skin: upperSkin });
    parts.push({ at: [x, o.lh - uh - ch / 2, z], size: [3, ch, 3], uv: uv.cannon, joint, skin: cannonSkin });
    parts.push({ at: [x, 1, z], size: [4, 2, 4], uv: uv.hoof, joint, skin: hoofSkin });
  }
  return parts;
}

// ---- Horse --------------------------------------------------------------------------------------
const HORSE_LOOKS: Look[] = [
  { coat: '#a35a2b', hair: '#4e2a14', belly: '#b87038', nose: '#6e4331', blaze: true, socks: true }, // chestnut
  { coat: '#2b292f', hair: '#131215', belly: '#3d3a41', nose: '#4a4048', star: true }, // black
  { coat: '#eeece6', hair: '#d6d2c8', belly: '#dfdcd3', nose: '#d9a8a2' }, // white
  { coat: '#dcc38f', hair: '#f3e8c9', belly: '#ebd9ad', nose: '#c79b86' }, // creamy
  { coat: '#5b3a22', hair: '#24150c', belly: '#6c4a30', nose: '#3b2b23', blaze: true }, // dark brown
  { coat: '#8e9298', hair: '#4a4c52', belly: '#a8abb0', nose: '#6c6b71', dapple: true }, // gray
];
const horse: SpeciesSpec = {
  kind: 'horse',
  name: { en: 'Horse', ar: 'حصان' },
  emoji: '🐴',
  tex: [128, 64],
  variants: 6,
  move: 'walk',
  speed: 2.2,
  hp: 15,
  graze: true,
  habitat: { biomes: ['plains'], weight: 0.6, herd: [1, 2] },
  parts: equine({
    tex: [128, 64],
    looks: HORSE_LOOKS,
    body: [11, 10, 26],
    lh: 14,
    neck: [5, 14, 8],
    head: [6, 6, 7],
    muzzle: [4, 5, 6],
    ear: [2, 3, 1],
    earTilt: 0.12,
    mane: { h: 16, d: 3 },
    tail: { w: 3, len: 11 },
    tilt: 0.55,
    legAmp: 0.65,
  }),
};

// ---- Donkey -------------------------------------------------------------------------------------
const DONKEY_LOOKS: Look[] = [
  { coat: '#8c7a69', hair: '#4b3f36', belly: '#d8cdbf', nose: '#dccfbd', noseFull: true, stripe: '#54453a' },
  { coat: '#60493a', hair: '#2d211a', belly: '#c7b39c', nose: '#cdb89d', noseFull: true, stripe: '#38291f' },
];
const donkey: SpeciesSpec = {
  kind: 'donkey',
  name: { en: 'Donkey', ar: 'حمار' },
  emoji: '🐴',
  tex: [128, 64],
  variants: 2,
  move: 'walk',
  speed: 1.8,
  hp: 12,
  graze: true,
  habitat: { biomes: ['plains'], weight: 0.4, herd: [1, 2] },
  parts: equine({
    tex: [128, 64],
    looks: DONKEY_LOOKS,
    body: [10, 10, 22],
    lh: 11,
    neck: [5, 11, 7],
    head: [6, 6, 8],
    muzzle: [4, 5, 5],
    ear: [2, 7, 1],
    earTilt: 0.32,
    mane: { h: 8, d: 4, short: true },
    tail: { w: 2, len: 8, tuft: 4 },
    tilt: 0.5,
    legAmp: 0.7,
  }),
};

// ---- Mule ---------------------------------------------------------------------------------------
const MULE_LOOKS: Look[] = [
  { coat: '#775439', hair: '#3b2518', belly: '#8d6847', nose: '#3d2d25', noseFull: true },
  { coat: '#4a3222', hair: '#20140d', belly: '#5e4431', nose: '#2b201a', noseFull: true },
];
const mule: SpeciesSpec = {
  kind: 'mule',
  name: { en: 'Mule', ar: 'بغل' },
  emoji: '🐴',
  tex: [128, 64],
  variants: 2,
  move: 'walk',
  speed: 2.0,
  hp: 14,
  graze: true,
  habitat: { biomes: ['plains'], weight: 0.25, herd: [1, 1] },
  parts: equine({
    tex: [128, 64],
    looks: MULE_LOOKS,
    body: [10, 11, 24],
    lh: 12,
    neck: [5, 12, 7],
    head: [6, 6, 7],
    muzzle: [4, 5, 6],
    ear: [2, 6, 1],
    earTilt: 0.25,
    mane: { h: 9, d: 3, short: true },
    tail: { w: 3, len: 9 },
    tilt: 0.52,
    legAmp: 0.7,
  }),
};

// ---- Llama and trader llama ---------------------------------------------------------------------
interface LlamaLook {
  wool: string;
  face: string;
  foot: string;
  inner: string;
}
const LLAMA_LOOKS: LlamaLook[] = [
  { wool: '#f1e5c6', face: '#cdb590', foot: '#8a7458', inner: '#e6b9a8' }, // cream-white
  { wool: '#7b5336', face: '#5a3b27', foot: '#2f2018', inner: '#c98f7c' }, // brown
  { wool: '#a4a4a8', face: '#6e6e74', foot: '#3a3a40', inner: '#d3a8a0' }, // gray
  { wool: '#f6f4ef', face: '#d9d2c4', foot: '#a1968a', inner: '#eab9b0' }, // white
];
const BLUE = '#2d4c9e';
const BLUE2 = '#5b82d6';
const WHITE = '#f3f1ea';

function blanketSkin(g: Paint): void {
  g.speckle('all', tones(BLUE, 0.06));
  for (const f of ['nx', 'px'] as const) {
    const { w, h } = g.size(f);
    g.rect(f, 0, 0, w, 1, WHITE);
    g.rect(f, 0, h - 1, w, 1, WHITE);
    for (let x = 0; x < w; x++) {
      const m = x % 4;
      if (m === 1 || m === 2) {
        g.px(f, x, 2, WHITE);
        g.px(f, x, 4, WHITE);
        g.px(f, x, 3, BLUE2);
      } else g.px(f, x, 3, WHITE);
    }
  }
  for (const f of ['front', 'back'] as const) {
    const { w, h } = g.size(f);
    g.rect(f, 0, 0, w, 1, WHITE);
    g.rect(f, 0, h - 1, w, 1, WHITE);
  }
  // top: a white frame around a diamond lattice
  const t = g.size('top');
  g.rect('top', 0, 0, t.w, 1, WHITE);
  g.rect('top', 0, t.h - 1, t.w, 1, WHITE);
  g.rect('top', 0, 0, 1, t.h, WHITE);
  g.rect('top', t.w - 1, 0, 1, t.h, WHITE);
  for (let y = 1; y < t.h - 1; y++) {
    for (let x = 1; x < t.w - 1; x++) {
      const d = Math.abs(x - (t.w - 1) / 2) + Math.abs(y - (t.h - 1) / 2);
      if (d < 1.6) g.px('top', x, y, BLUE2);
      else if (d < 7.6 && Math.round(d) % 3 === 0) g.px('top', x, y, WHITE);
    }
  }
}

/** Tassels: every other column is painted, the rest stays cut out. */
function fringeSkin(g: Paint): void {
  g.fill(['front', 'back', 'top', 'bottom'], BLUE);
  const { w, h } = g.size('px');
  for (const f of ['px', 'nx'] as const) {
    for (let x = 0; x < w; x += 2) g.rect(f, x, 0, 1, h, (x >> 1) % 2 ? WHITE : BLUE2);
  }
}

function llama(kind: string, trader: boolean): SpeciesSpec {
  const looks = trader ? [LLAMA_LOOKS[0]] : LLAMA_LOOKS;
  const L = (g: Paint): LlamaLook => looks[g.variant];
  const sizes: Record<string, Vec3> = {
    body: [12, 10, 18],
    neck: [8, 20, 6],
    ruff: [10, 6, 8],
    snout: [4, 4, 9],
    ear: [3, 4, 2],
    upper: [4, 10, 4],
    lower: [3, 5, 3],
    tail: [3, 3, 2],
  };
  if (trader) {
    sizes.blanket = [14, 7, 13];
    sizes.fringe = [1, 3, 13];
  }
  const uv = packAll(sizes, 128, 64);
  const wool = (g: Paint, faces: Parameters<Paint['speckle']>[0]) => {
    g.speckle(faces, tones(L(g).wool, 0.06));
    g.grain(faces, shade(L(g).wool, 0.14), 0.07);
    g.grain(faces, shade(L(g).wool, -0.14), 0.06);
  };

  const parts: PartSpec[] = [];
  parts.push({
    at: [0, 17, 0],
    size: sizes.body,
    uv: uv.body,
    skin: (g) => {
      const l = L(g);
      wool(g, 'all');
      g.speckle('bottom', tones(shade(l.wool, -0.06), 0.05));
      for (const f of ['nx', 'px'] as const) {
        const { w, h } = g.size(f);
        scatter(g, f, 0, h - 2, w, h, shade(l.wool, -0.18), 0.3);
        if (g.variant === 1) for (let i = 0; i < 3; i++) g.blob(f, 3 + ((g.rand() * (w - 6)) | 0), 2 + ((g.rand() * 5) | 0), 2.2, shade(l.wool, 0.16));
        if (g.variant === 2) for (let i = 0; i < 3; i++) g.blob(f, 3 + ((g.rand() * (w - 6)) | 0), 2 + ((g.rand() * 5) | 0), 2.2, shade(l.wool, -0.2));
      }
    },
  });
  // woolly neck column with the face at its top
  parts.push({
    at: [0, 25, 10],
    size: sizes.neck,
    uv: uv.neck,
    skin: (g) => {
      const l = L(g);
      wool(g, 'all');
      const face = tones(l.face, 0.05);
      scatter(g, 'front', 0, 0, g.w, 9, face, 1);
      scatter(g, 'nx', 0, 0, g.d, 7, face, 1);
      scatter(g, 'px', 0, 0, g.d, 7, face, 1);
      scatter(g, 'top', 0, 0, g.w, g.d, face, 0.5);
      // eyes wrap round the corners of the face
      for (const x of [0, g.w - 1]) {
        g.rect('front', x, 1, 1, 2, '#14100d');
        g.px('front', x, 0, shade(l.face, -0.25));
      }
      for (const [f, x] of [['nx', g.d - 1], ['px', 0]] as const) g.rect(f, x, 1, 1, 2, '#14100d');
    },
  });
  parts.push({
    at: [0, 19, 10],
    size: sizes.ruff,
    uv: uv.ruff,
    skin: (g) => {
      wool(g, 'all');
      scatter(g, 'front', 0, g.h - 2, g.w, g.h, shade(L(g).wool, -0.18), 0.3);
    },
  });
  parts.push({
    at: [0, 30, 12.5],
    size: sizes.snout,
    uv: uv.snout,
    skin: (g) => {
      const l = L(g);
      g.speckle('all', tones(shade(l.face, 0.06), 0.05));
      g.px('front', 1, 1, '#1d1410');
      g.px('front', 2, 1, '#1d1410');
      g.rect('front', 0, 3, 4, 1, shade(l.face, -0.4));
      g.rect('bottom', 0, 0, 4, 9, shade(l.face, -0.15));
    },
  });
  for (const s of [1, -1]) {
    parts.push({
      at: [s * 3, 37, 10.5],
      size: sizes.ear,
      uv: uv.ear,
      rot: [-0.22, 0, -s * 0.24],
      joint: { chan: 'idle', axis: 'z', amp: 0.16, phase: s > 0 ? 0 : 1.9, pivot: [s * 3, 35, 10.5] },
      skin: (g) => {
        const l = L(g);
        g.speckle('all', tones(l.wool, 0.05));
        g.rect('front', 1, 0, 1, 3, l.inner);
        g.rect('top', 0, 0, g.w, g.d, shade(l.face, -0.2));
      },
    });
  }
  // legs: wool above, a thin dark-footed leg below
  for (const [sx, z, phase] of [
    [1, 5.5, 0],
    [-1, 5.5, Math.PI],
    [1, -5.5, Math.PI],
    [-1, -5.5, 0],
  ] as const) {
    const x = sx * 4;
    const joint = { chan: 'walk' as const, axis: 'x' as const, amp: 0.7, phase, pivot: [x, 14, z] as Vec3 };
    parts.push({ at: [x, 10, z], size: sizes.upper, uv: uv.upper, joint, skin: (g) => wool(g, 'all') });
    parts.push({
      at: [x, 2.5, z],
      size: sizes.lower,
      uv: uv.lower,
      joint,
      skin: (g) => {
        const l = L(g);
        g.speckle('all', tones(shade(l.wool, -0.12), 0.06));
        for (const f of ['front', 'back', 'nx', 'px'] as const) g.rect(f, 0, 3, 3, 2, l.foot);
        g.rect('bottom', 0, 0, 3, 3, shade(l.foot, -0.3));
      },
    });
  }
  parts.push({
    at: [0, 20.5, -10],
    size: sizes.tail,
    uv: uv.tail,
    rot: [-0.4, 0, 0],
    joint: tailWag([0, 20.5, -9], 0.3),
    skin: (g) => wool(g, 'all'),
  });
  if (trader) {
    parts.push({ at: [0, 20.5, 0], size: sizes.blanket, uv: uv.blanket, skin: blanketSkin });
    for (const s of [1, -1]) parts.push({ at: [s * 6.5, 15.5, 0], size: sizes.fringe, uv: uv.fringe, skin: fringeSkin });
  }

  return {
    kind,
    name: trader ? { en: 'Trader Llama', ar: 'لاما التاجر' } : { en: 'Llama', ar: 'لاما' },
    emoji: '🦙',
    tex: [128, 64],
    variants: looks.length,
    move: 'walk',
    speed: 1.4,
    hp: 12,
    graze: false,
    habitat: trader ? { biomes: ['plains', 'desert'], weight: 0.12, herd: [1, 1] } : { biomes: ['plains', 'snowy'], weight: 0.5, herd: [2, 3] },
    parts,
  };
}

// ---- Camel --------------------------------------------------------------------------------------
const TAN = '#d0aa6c';
const camel: SpeciesSpec = (() => {
  const shaggy = (g: Paint, faces: Parameters<Paint['speckle']>[0], base = TAN) => {
    g.speckle(faces, tones(base, 0.08));
    g.grain(faces, shade(base, -0.2), 0.045);
    g.grain(faces, shade(base, 0.18), 0.06);
  };
  const sizes: Record<string, Vec3> = {
    body: [15, 12, 26],
    hump: [9, 4, 11],
    hump2: [7, 2, 9],
    chest: [7, 8, 12],
    neck: [7, 13, 6],
    head: [6, 6, 6],
    muzzle: [5, 5, 6],
    ear: [3, 2, 1],
    leg: [5, 19, 5],
    pad: [6, 2, 6],
    tail: [2, 10, 1],
    tuft: [3, 4, 2],
  };
  const uv = packAll(sizes, 128, 64);
  const parts: PartSpec[] = [];
  parts.push({
    at: [0, 26, 0],
    size: sizes.body,
    uv: uv.body,
    skin: (g) => {
      shaggy(g, 'all');
      g.speckle('top', tones(shade(TAN, -0.08), 0.08));
      g.speckle('bottom', tones(shade(TAN, 0.15), 0.06));
      for (const f of ['nx', 'px', 'front', 'back'] as const) {
        const { w, h } = g.size(f);
        scatter(g, f, 0, h - 2, w, h, shade(TAN, 0.22), 0.55);
        scatter(g, f, 0, 0, w, 2, shade(TAN, -0.18), 0.3);
      }
    },
  });
  parts.push({
    at: [0, 34, 1],
    size: sizes.hump,
    uv: uv.hump,
    skin: (g) => {
      shaggy(g, 'all', shade(TAN, -0.05));
      g.grain('sides', shade(TAN, 0.15), 0.08);
    },
  });
  parts.push({
    at: [0, 37, 1],
    size: sizes.hump2,
    uv: uv.hump2,
    skin: (g) => {
      shaggy(g, 'all', shade(TAN, -0.1));
      g.speckle('top', tones(shade(TAN, -0.22), 0.07));
    },
  });
  parts.push({
    at: [0, 26, 15],
    size: sizes.chest,
    uv: uv.chest,
    skin: (g) => {
      shaggy(g, 'all');
      g.speckle('bottom', tones(shade(TAN, 0.15), 0.06));
      scatter(g, 'front', 0, g.h - 3, g.w, g.h, shade(TAN, 0.22), 0.5);
    },
  });
  // neck: a long curve, tipped forward from the chest, with the head tipped down at its top
  const Pn: Vec3 = [0, 28, 16];
  const neckAt = frame(Pn, 0.3);
  parts.push({
    at: neckAt(0, 5.5, 0),
    size: sizes.neck,
    uv: uv.neck,
    rot: [0.3, 0, 0],
    skin: (g) => {
      shaggy(g, 'all');
      scatter(g, 'front', 0, 6, g.w, g.h, shade(TAN, 0.2), 0.4);
      scatter(g, 'back', 0, 0, g.w, g.h, shade(TAN, -0.2), 0.3);
    },
  });
  const Ph = neckAt(0, 11.5, 0);
  const headAt = frame(Ph, 0.45);
  parts.push({
    at: headAt(0, 1, 2),
    size: sizes.head,
    uv: uv.head,
    rot: [0.45, 0, 0],
    skin: (g) => {
      g.speckle('all', tones(shade(TAN, 0.04), 0.07));
      g.grain('all', shade(TAN, -0.22), 0.05);
      for (const [f, ex, hx] of [['nx', g.d - 3, g.d - 3], ['px', 1, 2]] as const) {
        g.rect(f, ex, 1, 2, 2, '#16100b');
        g.px(f, hx, 1, '#8a7a66');
        g.rect(f, ex, 0, 2, 1, '#3a2a1c'); // heavy lashes
      }
    },
  });
  parts.push({
    at: headAt(0, 0.5, 7.5),
    size: sizes.muzzle,
    uv: uv.muzzle,
    rot: [0.45, 0, 0],
    skin: (g) => {
      g.speckle('all', tones(shade(TAN, 0.1), 0.06));
      g.rect('front', 0, 2, 5, 3, shade(TAN, 0.3));
      g.px('front', 0, 1, '#1d130d');
      g.px('front', 4, 1, '#1d130d');
      g.rect('front', 0, 3, 5, 1, shade(TAN, -0.45));
      g.px('front', 2, 4, shade(TAN, -0.3));
      scatter(g, 'top', 0, 0, g.w, g.d, shade(TAN, -0.1), 0.2);
    },
  });
  for (const s of [1, -1]) {
    parts.push({
      at: headAt(s * 4, 3.5, 0),
      size: sizes.ear,
      uv: uv.ear,
      rot: [0.45, 0, -s * 0.3],
      joint: { chan: 'idle', axis: 'z', amp: 0.2, phase: s > 0 ? 0 : 2.3 },
      skin: (g) => g.speckle('all', tones(shade(TAN, -0.2), 0.06)),
    });
  }
  // long legs with a knee callus and a dark padded foot
  const legSkin = (g: Paint) => {
    shaggy(g, 'all', shade(TAN, -0.04));
    for (const f of ['front', 'nx', 'px', 'back'] as const) {
      g.rect(f, 0, 12, g.w, 2, shade(TAN, -0.3));
      scatter(g, f, 0, 14, g.w, g.h, shade(TAN, -0.1), 0.3);
    }
  };
  for (const [sx, z, phase] of [
    [1, 9.5, 0],
    [-1, 9.5, Math.PI],
    [1, -9.5, Math.PI],
    [-1, -9.5, 0],
  ] as const) {
    const x = sx * 5;
    const joint = { chan: 'walk' as const, axis: 'x' as const, amp: 0.55, phase, pivot: [x, 21, z] as Vec3 };
    parts.push({ at: [x, 11.5, z], size: sizes.leg, uv: uv.leg, joint, skin: legSkin });
    parts.push({ at: [x, 1, z], size: sizes.pad, uv: uv.pad, joint, skin: (g) => g.speckle('all', ['#5f4d3b', '#6c5843', '#54432f']) });
  }
  const tj = { chan: 'tail' as const, axis: 'x' as const, amp: 0.2, pivot: [0, 30, -13.5] as Vec3 };
  parts.push({ at: [0, 24.5, -13.5], size: sizes.tail, uv: uv.tail, joint: tj, skin: (g) => shaggy(g, 'all', shade(TAN, -0.1)) });
  parts.push({ at: [0, 18.5, -13.5], size: sizes.tuft, uv: uv.tuft, joint: tj, skin: (g) => g.speckle('all', hairTones('#5a3d22')) });
  return {
    kind: 'camel',
    name: { en: 'Camel', ar: 'جمل' },
    emoji: '🐪',
    tex: [128, 64],
    move: 'walk',
    speed: 1.6,
    hp: 16,
    graze: false,
    habitat: { biomes: ['desert'], weight: 0.9, herd: [1, 2] },
    parts,
  };
})();

export const SPECIES: SpeciesSpec[] = [horse, donkey, mule, llama('llama', false), llama('trader_llama', true), camel];
