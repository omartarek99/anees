import * as THREE from 'three';
import { rng } from './anim';

// Procedural surfaces for the story scenes, painted on canvases (no image files to download): wood with grain and knots, scuffed
// gold, and old stained paper. Each comes with a bump map so the light picks out the grain and the creases.

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c: HTMLCanvasElement, srgb: boolean, repeat: [number, number] = [1, 1]) {
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  return tex;
}

/** Wood planks: colour and bump from the same grain. `base` is the plank colour, `repeat` tiles it along the plank. */
export function woodTextures(seed: number, base: string, repeat: [number, number] = [1, 1]) {
  const W = 512;
  const H = 256;
  const color = makeCanvas(W, H);
  const bump = makeCanvas(W, H);
  const c = color.getContext('2d')!;
  const b = bump.getContext('2d')!;
  const r = rng(seed);
  c.fillStyle = base;
  c.fillRect(0, 0, W, H);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, W, H);
  // long wavy grain lines
  for (let i = 0; i < 150; i++) {
    const y0 = r() * H;
    const amp = 1 + r() * 4;
    const f = 0.004 + r() * 0.012;
    const ph = r() * 6;
    const dark = r() < 0.7;
    const a = 0.05 + r() * 0.2;
    const lw = 0.6 + r() * 2.2;
    c.strokeStyle = dark ? `rgba(40,20,5,${a})` : `rgba(255,220,160,${a * 0.6})`;
    b.strokeStyle = dark ? `rgba(0,0,0,${a * 1.6})` : `rgba(255,255,255,${a * 0.8})`;
    c.lineWidth = b.lineWidth = lw;
    c.beginPath();
    b.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const y = y0 + Math.sin(x * f + ph) * amp;
      if (x === 0) {
        c.moveTo(x, y);
        b.moveTo(x, y);
      } else {
        c.lineTo(x, y);
        b.lineTo(x, y);
      }
    }
    c.stroke();
    b.stroke();
  }
  // a couple of knots
  for (let k = 0; k < 2; k++) {
    const kx = 60 + r() * (W - 120);
    const ky = 40 + r() * (H - 80);
    for (let ring = 7; ring > 0; ring--) {
      c.strokeStyle = `rgba(35,16,4,${0.1 + (7 - ring) * 0.035})`;
      b.strokeStyle = `rgba(0,0,0,${0.12 + (7 - ring) * 0.04})`;
      c.lineWidth = b.lineWidth = 1.6;
      c.beginPath();
      c.ellipse(kx, ky, ring * 4.2, ring * 2.2, 0, 0, Math.PI * 2);
      c.stroke();
      b.beginPath();
      b.ellipse(kx, ky, ring * 4.2, ring * 2.2, 0, 0, Math.PI * 2);
      b.stroke();
    }
  }
  // a darker edge top and bottom: where one plank meets the next
  const edge = c.createLinearGradient(0, 0, 0, H);
  edge.addColorStop(0, 'rgba(25,10,0,0.4)');
  edge.addColorStop(0.07, 'rgba(25,10,0,0)');
  edge.addColorStop(0.93, 'rgba(25,10,0,0)');
  edge.addColorStop(1, 'rgba(25,10,0,0.45)');
  c.fillStyle = edge;
  c.fillRect(0, 0, W, H);
  return { map: toTexture(color, true, repeat), bump: toTexture(bump, false, repeat) };
}

/** Fine scratches and wear for gold: used as a roughness map so highlights are not perfect. */
export function scuffTexture(seed = 3) {
  const c = makeCanvas(256, 256);
  const x = c.getContext('2d')!;
  const r = rng(seed);
  x.fillStyle = '#707070';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const g = 90 + Math.floor(r() * 110);
    x.fillStyle = `rgba(${g},${g},${g},0.5)`;
    x.fillRect(r() * 256, r() * 256, 1 + r() * 7, 1);
  }
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(255,255,255,${0.1 + r() * 0.2})`;
    x.lineWidth = 0.8;
    x.beginPath();
    const sx = r() * 256;
    const sy = r() * 256;
    x.moveTo(sx, sy);
    x.lineTo(sx + (r() - 0.5) * 60, sy + (r() - 0.5) * 60);
    x.stroke();
  }
  return toTexture(c, false);
}

/** Paints old parchment into a canvas: fibres, stains, darker worn edges. The caller clips it to its own shape. */
export function paintParchment(x: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  const r = rng(seed);
  const g = x.createRadialGradient(W * 0.45, H * 0.4, 20, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, '#fbefcb');
  g.addColorStop(0.6, '#ecd49a');
  g.addColorStop(1, '#c9a063');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  // stains
  for (let i = 0; i < 9; i++) {
    const sx = r() * W;
    const sy = r() * H;
    const sr = 30 + r() * 90;
    const s = x.createRadialGradient(sx, sy, 0, sx, sy, sr);
    s.addColorStop(0, `rgba(140,90,30,${0.1 + r() * 0.1})`);
    s.addColorStop(1, 'rgba(140,90,30,0)');
    x.fillStyle = s;
    x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  }
  // fibres and specks
  for (let i = 0; i < 420; i++) {
    x.strokeStyle = `rgba(110,70,25,${0.04 + r() * 0.1})`;
    x.lineWidth = 0.6 + r();
    x.beginPath();
    const sx = r() * W;
    const sy = r() * H;
    x.moveTo(sx, sy);
    x.lineTo(sx + (r() - 0.5) * 24, sy + (r() - 0.5) * 24);
    x.stroke();
  }
  for (let i = 0; i < 300; i++) {
    x.fillStyle = `rgba(90,55,20,${0.05 + r() * 0.12})`;
    x.fillRect(r() * W, r() * H, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  // worn, darker edges
  const edge = 46;
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of [
    [0, 0, 0, edge, 0, 0, W, edge],
    [0, H, 0, H - edge, 0, H - edge, W, edge],
    [0, 0, edge, 0, 0, 0, edge, H],
    [W, 0, W - edge, 0, W - edge, 0, edge, H],
  ] as const) {
    const e = x.createLinearGradient(x0, y0, x1, y1);
    e.addColorStop(0, 'rgba(95,55,15,0.5)');
    e.addColorStop(1, 'rgba(95,55,15,0)');
    x.fillStyle = e;
    x.fillRect(rx, ry, rw, rh);
  }
  // creases from folding
  x.strokeStyle = 'rgba(110,70,25,0.3)';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(W / 2, 0);
  x.lineTo(W / 2 + (r() - 0.5) * 6, H);
  x.moveTo(0, H / 2);
  x.lineTo(W, H / 2 + (r() - 0.5) * 6);
  x.stroke();
}

/** A bump map for paper: grain and the creases. */
export function paperBump(W: number, H: number, seed: number) {
  const c = makeCanvas(W, H);
  const x = c.getContext('2d')!;
  const r = rng(seed + 100);
  x.fillStyle = '#808080';
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < 1800; i++) {
    const v = 100 + Math.floor(r() * 60);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 2);
  }
  x.strokeStyle = '#555';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(W / 2, 0);
  x.lineTo(W / 2, H);
  x.moveTo(0, H / 2);
  x.lineTo(W, H / 2);
  x.stroke();
  return toTexture(c, false);
}

/** The parchment as a picture (a data URL), for the flat riddle map to use as its paper. */
export function parchmentDataUrl(W = 680, H = 560, seed = 21): string {
  const c = makeCanvas(W, H);
  paintParchment(c.getContext('2d')!, W, H, seed);
  return c.toDataURL('image/jpeg', 0.88);
}

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Gift wrapping: deep red paper with faint diagonal stripes and small gold stars, for the key-gift box. */
export function giftPaperTexture() {
  const W = 256;
  const c = makeCanvas(W, W);
  const x = c.getContext('2d')!;
  const r = rng(31);
  const g = x.createLinearGradient(0, 0, W, W);
  g.addColorStop(0, '#b0142f');
  g.addColorStop(1, '#8a0f26');
  x.fillStyle = g;
  x.fillRect(0, 0, W, W);
  x.strokeStyle = 'rgba(255,255,255,0.07)';
  x.lineWidth = 10;
  for (let i = -W; i < W * 2; i += 36) {
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + W, W);
    x.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const sx = r() * W;
    const sy = r() * W;
    const s = 4 + r() * 4;
    x.fillStyle = `rgba(247,201,72,${0.55 + r() * 0.35})`;
    x.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = k % 2 ? s * 0.45 : s;
      x.lineTo(sx + Math.cos(a) * rad, sy + Math.sin(a) * rad);
    }
    x.closePath();
    x.fill();
  }
  const tex = toTexture(c, true, [2, 2]);
  return tex;
}

/** Text drawn on a canvas, for labels and number plaques in the scenes: `bg` (optional) paints a rounded plaque behind it. */
export function textTexture(text: string, w: number, h: number, font: string, fill: string, opts: { stroke?: string; bg?: string; border?: string } = {}) {
  return canvasTexture(w, h, (x) => {
    if (opts.bg) {
      const r = h * 0.32;
      x.beginPath();
      x.roundRect(4, 4, w - 8, h - 8, r);
      x.fillStyle = opts.bg;
      x.fill();
      if (opts.border) {
        x.lineWidth = 5;
        x.strokeStyle = opts.border;
        x.stroke();
      }
    }
    x.font = font;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    if (opts.stroke) {
      x.lineWidth = 9;
      x.lineJoin = 'round';
      x.strokeStyle = opts.stroke;
      x.strokeText(text, w / 2, h / 2 + 2);
    }
    x.fillStyle = fill;
    x.fillText(text, w / 2, h / 2 + 2);
  });
}

/** Red and cream stripes for a souq tent. */
export function stripeTexture(a = '#b5332c', b = '#f3e3c3', n = 8) {
  const c = makeCanvas(256, 64);
  const x = c.getContext('2d')!;
  for (let i = 0; i < n; i++) {
    x.fillStyle = i % 2 ? b : a;
    x.fillRect((i * 256) / n, 0, 256 / n + 1, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** The riddle map's painted surface: old paper with dotted roads from the middle to the four places, a compass rose and a seam. */
export function riddleMapTexture(W: number, H: number, starts: { x: number; y: number }, ends: { x: number; y: number }[]) {
  return canvasTexture(W, H, (x) => {
    const m = 14;
    x.beginPath();
    x.roundRect(m, m, W - 2 * m, H - 2 * m, 28);
    x.save();
    x.clip();
    paintParchment(x, W, H, 21);
    // the seam where the two halves were joined
    x.strokeStyle = 'rgba(120,80,30,0.4)';
    x.lineWidth = 3;
    x.setLineDash([10, 12]);
    x.beginPath();
    x.moveTo(W / 2, m);
    for (let i = 1; i <= 10; i++) x.lineTo(W / 2 + (i % 2 ? -8 : 8), m + ((H - 2 * m) * i) / 10);
    x.stroke();
    x.setLineDash([]);
    // dotted roads
    x.strokeStyle = 'rgba(91,53,19,0.75)';
    x.lineWidth = 6;
    x.lineCap = 'round';
    x.setLineDash([2, 16]);
    for (const e of ends) {
      x.beginPath();
      x.moveTo(starts.x, starts.y);
      x.lineTo(e.x, e.y);
      x.stroke();
    }
    x.setLineDash([]);
    // a compass rose in the corner
    x.save();
    x.translate(120, 120);
    x.strokeStyle = '#5b3513';
    x.lineWidth = 4;
    x.beginPath();
    x.arc(0, 0, 58, 0, Math.PI * 2);
    x.stroke();
    x.lineWidth = 1.5;
    x.beginPath();
    x.arc(0, 0, 46, 0, Math.PI * 2);
    x.stroke();
    x.fillStyle = '#5b3513';
    for (let k = 0; k < 4; k++) {
      x.save();
      x.rotate((k * Math.PI) / 2);
      x.beginPath();
      x.moveTo(0, -84);
      x.lineTo(10, 0);
      x.lineTo(-10, 0);
      x.fill();
      x.restore();
    }
    x.fillStyle = '#b3261e';
    x.beginPath();
    x.moveTo(0, -84);
    x.lineTo(10, 0);
    x.lineTo(-10, 0);
    x.fill();
    x.restore();
    x.restore();
    x.strokeStyle = 'rgba(100,60,20,0.9)';
    x.lineWidth = 7;
    x.stroke();
  });
}
