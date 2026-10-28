import type { Face, FaceSel, Paint } from './types';

// Face rectangles of a box unwrap, relative to the unwrap's top-left corner (the classic
// cross layout): the whole unwrap is (2d + 2w) wide and (d + h) tall.
//
//        +--------+--------+
//        |  top   | bottom |            top:    w x d      image-up = back (-z),  image-right = +x
//        +----+---+----+---+----+       bottom: w x d      image-up = front (+z), image-right = +x
//        | nx | front | px | back |      front:  w x h      image-right = +x  (the animal's left)
//        +----+--------+----+------+     back:   w x h      image-right = -x
//                                        nx:     d x h      image-right = +z  (towards the head)
//                                        px:     d x h      image-right = -z  (towards the tail)
//
// Every side face has image-up = +y. So on a flank the head is at the right of the nx image and at
// the left of the px image - paint "as you see it from outside".
export function faceRect(face: Face, w: number, h: number, d: number): { x: number; y: number; w: number; h: number } {
  switch (face) {
    case 'nx':
      return { x: 0, y: d, w: d, h };
    case 'front':
      return { x: d, y: d, w, h };
    case 'px':
      return { x: d + w, y: d, w: d, h };
    case 'back':
      return { x: 2 * d + w, y: d, w, h };
    case 'top':
      return { x: d, y: 0, w, h: d };
    case 'bottom':
      return { x: d + w, y: 0, w, h: d };
  }
}

const SIDES: readonly Face[] = ['nx', 'front', 'px', 'back'];
const ALL: readonly Face[] = ['nx', 'front', 'px', 'back', 'top', 'bottom'];

function facesOf(sel: FaceSel): readonly Face[] {
  if (sel === 'all') return ALL;
  if (sel === 'sides') return SIDES;
  if (typeof sel === 'string') return [sel];
  return sel;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Painter for one part: draws into the atlas canvas at the part's unwrap origin (ox, oy). */
export function createPaint(ctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number, d: number, variant: number, seed: number): Paint {
  const rand = rng(seed);
  const rect = (face: Face) => {
    const r = faceRect(face, w, h, d);
    return { x: ox + r.x, y: oy + r.y, w: r.w, h: r.h };
  };
  const paint: Paint = {
    w,
    h,
    d,
    variant,
    rand,
    size: (face) => {
      const r = faceRect(face, w, h, d);
      return { w: r.w, h: r.h };
    },
    fill(faces, color) {
      ctx.fillStyle = color;
      for (const f of facesOf(faces)) {
        const r = rect(f);
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    },
    rect(face, x, y, rw, rh, color) {
      const r = rect(face);
      const x0 = Math.max(0, x);
      const y0 = Math.max(0, y);
      const x1 = Math.min(r.w, x + rw);
      const y1 = Math.min(r.h, y + rh);
      if (x1 <= x0 || y1 <= y0) return;
      ctx.fillStyle = color;
      ctx.fillRect(r.x + x0, r.y + y0, x1 - x0, y1 - y0);
    },
    px(face, x, y, color) {
      paint.rect(face, x, y, 1, 1, color);
    },
    speckle(faces, palette) {
      for (const f of facesOf(faces)) {
        const r = rect(f);
        for (let yy = 0; yy < r.h; yy++) {
          for (let xx = 0; xx < r.w; xx++) {
            ctx.fillStyle = palette[(rand() * palette.length) | 0];
            ctx.fillRect(r.x + xx, r.y + yy, 1, 1);
          }
        }
      }
    },
    grain(faces, colors, amount) {
      const list = typeof colors === 'string' ? [colors] : colors;
      for (const f of facesOf(faces)) {
        const r = rect(f);
        const n = Math.round(r.w * r.h * amount);
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = list[(rand() * list.length) | 0];
          ctx.fillRect(r.x + ((rand() * r.w) | 0), r.y + ((rand() * r.h) | 0), 1, 1);
        }
      }
    },
    band(faces, y0, y1, color) {
      for (const f of facesOf(faces)) {
        const r = rect(f);
        paint.rect(f, 0, y0, r.w, y1 - y0, color);
      }
    },
    blob(face, cx, cy, radius, color) {
      const r = rect(face);
      ctx.fillStyle = color;
      const R = Math.ceil(radius);
      for (let yy = -R; yy <= R; yy++) {
        for (let xx = -R; xx <= R; xx++) {
          if (xx * xx + yy * yy > radius * radius + 0.25) continue;
          const x = cx + xx;
          const y = cy + yy;
          if (x < 0 || y < 0 || x >= r.w || y >= r.h) continue;
          ctx.fillRect(r.x + x, r.y + y, 1, 1);
        }
      }
    },
  };
  return paint;
}

// ---- colour helpers for species authors ---------------------------------------------------------
function toRgb(hex: string): [number, number, number] {
  const s = hex.replace('#', '');
  const v = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clamp8 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((c) => clamp8(c).toString(16).padStart(2, '0')).join('');

/** Lighter (f > 0) or darker (f < 0) version of a colour; f in about -1 .. 1. */
export function shade(hex: string, f: number): string {
  const [r, g, b] = toRgb(hex);
  return f >= 0 ? toHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f) : toHex(r * (1 + f), g * (1 + f), b * (1 + f));
}
/** Blend a toward b by t (0..1). */
export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = toRgb(a);
  const [r2, g2, b2] = toRgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
/** A speckle palette of `n` close shades of one colour (spread ~0.06 = subtle, 0.14 = strong). */
export function tones(hex: string, spread = 0.08, n = 5): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(shade(hex, (i / (n - 1) - 0.5) * 2 * spread));
  return out;
}
