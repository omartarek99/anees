// The motion-template engine's "Helix" (spiral-stream, 3D & Perspective): cards descend a vertical helix, winding round as they fall.
// The shared helpers (core.ts) and the template, verbatim from the tool's export (the engine's minified names; keep the maths, constants
// and draw order). TEMPLATE.render({ ctx, t, width, height, params, images, background }) paints one frame. Host: components/HelixShowcase.tsx.
// @ts-nocheck

// ── Shared helpers — src/lib/motion-templates/core.ts (minified names)
/*
 * Legend:
 *   We  clamp01(x)
 *   xe  remap v from [a,b] to [0,1], clamped
 *   Mt  (t, n) → { index, local }: which of n steps is running and the progress inside it
 *   Ci  cubic-bezier easing (Newton + bisection)
 *   H6  easing table
 *   w5  pick an easing by name (+ custom amount / bezier)
 *   H   numeric param (params, id, default)
 *   he  string param (params, id, default)
 *   Bm  boolean param (params, id, default)
 *   k5  u = min(w, h) / 100 — the '1%' unit every size uses
 *   Xa  rounded-rect path (ctx, x, y, w, h, r)
 *   Y6  object-fit: cover (+ zoom / pan)
 *   as  reusable offscreen scratch canvas by key
 *   M5  card shadow (shadowOffsetX = 1e5 trick: shape drawn off-screen, only its shadow lands)
 *   Ds  draw media cover-fitted inside a rounded clip
 *   Re  draw one card (ctx, img, slot, rect, radius, { alpha, shadow, zoom, panX, panY }) — grey placeholder when img is missing
 *   et  '16:9' / 'auto' → number
 *   He  frame start: clear, paint background, set shadow, offset → { u, content, radius, ease, shadow }
 *   je  images[i % images.length]
 */

function We(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function xe(t, e, n) {
  return n <= e ? (t >= n ? 1 : 0) : We((t - e) / (n - e));
}

function Mt(t, e) {
  const n = We(t) * e;
  let a = Math.floor(n);
  return (a >= e && (a = e - 1), { index: a, local: n - a });
}

const _5 = (t) => t;

const Va = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const D6 = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

const Hm = (t) => 1 + 3.2 * Math.pow(t - 1, 3) + 2.2 * Math.pow(t - 1, 2);

const P6 = (t) => {
  const n = 2.5949095;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((n + 1) * 2 * t - n)) / 2
    : (Math.pow(2 * t - 2, 2) * ((n + 1) * (t * 2 - 2) + n) + 2) / 2;
};

const L6 = (t) =>
  t < 1 / 2.75
    ? 7.5625 * t * t
    : t < 2 / 2.75
      ? 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
      : t < 2.5 / 2.75
        ? 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
        : 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;

const U6 = (t) => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const e = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * e) + 1;
};

function Ci(t, e, n, a) {
  const r = 3 * t,
    o = 3 * (n - t) - r,
    c = 1 - r - o,
    d = 3 * e,
    h = 3 * (a - e) - d,
    f = 1 - d - h,
    p = (y) => ((c * y + o) * y + r) * y,
    m = (y) => ((f * y + h) * y + d) * y,
    b = (y) => (3 * c * y + 2 * o) * y + r;
  return (y) => {
    if (y <= 0) return 0;
    if (y >= 1) return 1;
    let _ = y;
    for (let E = 0; E < 6; E++) {
      const T = p(_) - y;
      if (Math.abs(T) < 1e-5) return m(_);
      const k = b(_);
      if (Math.abs(k) < 1e-6) break;
      _ -= T / k;
    }
    let x = 0,
      w = 1;
    for (_ = y; w - x > 1e-5;) (p(_) < y ? (x = _) : (w = _), (_ = (x + w) / 2));
    return m(_);
  };
}

function I6(t) {
  const e = t.split(",").map(Number);
  return e.length !== 4 || e.some(Number.isNaN)
    ? null
    : [Math.min(1, Math.max(0, e[0])), e[1], Math.min(1, Math.max(0, e[2])), e[3]];
}

const H6 = {
  linear: _5,
  smooth: Va,
  natural: Ci(0.4, 0, 0.2, 1),
  slowdown: Ci(0, 0, 0.35, 1),
  snappy: D6,
  accelerate: Ci(0.55, 0, 0.85, 0.3),
  overshoot: Hm,
  bounce: L6,
  elastic: U6,
  impulse: Ci(0.5, -0.6, 0.3, 1),
  swing: P6,
};

function w5(t, e = 60, n = "") {
  if (t === "custom") {
    const a = I6(n);
    if (a) return Ci(...a);
    const r = Math.max(-100, Math.min(100, e)) / 100;
    if (r === 0) return _5;
    const o = 1 + Math.abs(r) * 4;
    return r > 0 ? (c) => 1 - Math.pow(1 - c, o) : (c) => Math.pow(c, o);
  }
  return H6[t] ?? Va;
}

function H(t, e, n) {
  const a = t[e];
  return typeof a == "number" ? a : n;
}

function he(t, e, n) {
  const a = t[e];
  return typeof a == "string" ? a : n;
}

function Bm(t, e, n) {
  const a = t[e];
  return typeof a == "boolean" ? a : n;
}

function k5(t, e) {
  return Math.min(t, e) / 100;
}

function G6(t, e, n) {
  const a = k5(t, e) * n;
  return { x: a, y: a, w: t - a * 2, h: e - a * 2 };
}

function Fm(t) {
  return "videoWidth" in t ? { w: t.videoWidth, h: t.videoHeight } : { w: t.width, h: t.height };
}

function Xa(t, e, n, a, r, o) {
  const c = Math.max(0, Math.min(o, a / 2, r / 2));
  if ((t.beginPath(), typeof t.roundRect == "function")) {
    t.roundRect(e, n, a, r, c);
    return;
  }
  (t.moveTo(e + c, n),
    t.arcTo(e + a, n, e + a, n + r, c),
    t.arcTo(e + a, n + r, e, n + r, c),
    t.arcTo(e, n + r, e, n, c),
    t.arcTo(e, n, e + a, n, c),
    t.closePath());
}

function Y6(t, e, n, a, r = 1, o = 0, c = 0) {
  const d = Math.max(n / t, a / e) * Math.max(r, 1e-4),
    h = n / d,
    f = a / d,
    p = (t - h) / 2,
    m = (e - f) / 2;
  return {
    sx: p * (1 + Math.max(-1, Math.min(1, o))),
    sy: m * (1 + Math.max(-1, Math.min(1, c))),
    sw: h,
    sh: f,
  };
}

let jc = null;

function W6(t) {
  jc = t;
}

let T5 = !1;

function V6(t) {
  T5 = t;
}

function zh(t, e, n, a) {
  a > 0 && jc && M5(t, e, n, a, jc);
}

const Qx = new Map();

function as(t, e, n = "card") {
  const a = Math.max(2, Math.round(t)),
    r = Math.max(2, Math.round(e));
  let o = Qx.get(n);
  if (!o) {
    let c;
    if (typeof OffscreenCanvas < "u") c = new OffscreenCanvas(a, r);
    else if (typeof document < "u") c = document.createElement("canvas");
    else return null;
    const d = c.getContext("2d");
    if (!d) return null;
    ((o = { canvas: c, ctx: d }), Qx.set(n, o));
  }
  (o.canvas.width !== a && (o.canvas.width = a), o.canvas.height !== r && (o.canvas.height = r));
  try {
    ((o.ctx.imageSmoothingEnabled = !0), (o.ctx.imageSmoothingQuality = "high"));
  } catch {}
  return o;
}

function M5(t, e, n, a, r) {
  const o = r.unit > 0 ? a / r.unit : 1;
  (t.save(), (t.shadowColor = r.color), (t.shadowBlur = r.blur * o));
  let c = 0,
    d = 0,
    h = !1;
  const f = 1e5;
  try {
    const m = t.getTransform(),
      b = m.a * m.d - m.b * m.c;
    b && ((c = (-f * m.d) / b), (d = (f * m.b) / b), (h = !0));
  } catch {}
  ((t.shadowOffsetX = (h ? f : 0) + r.offX), (t.shadowOffsetY = r.offY));
  const p = h ? r.spread : Math.min(r.spread, -1);
  (Xa(t, e.x + c - p, e.y + d - p, Math.max(0, e.w + p * 2), Math.max(0, e.h + p * 2), Math.max(0, n + p)),
    (t.fillStyle = "#000"),
    t.fill(),
    t.restore());
}

function qm(t, e, n, a) {
  (t.save(), Xa(t, e.x, e.y, e.w, e.h, n), t.clip());
  const r = 30 + ((a * 11) % 30);
  ((t.fillStyle = `hsl(230, 6%, ${r}%)`), t.fillRect(e.x, e.y, e.w, e.h), t.restore());
}

function Ds(t, e, n, a, r = {}) {
  if (n.w <= 0 || n.h <= 0) return;
  const o = r.alpha ?? 1;
  if (o <= 0) return;
  const c = e ? Fm(e) : null;
  if (!e || !c || c.w <= 0 || c.h <= 0) {
    (t.save(), (t.globalAlpha *= o), qm(t, n, a, 0), t.restore());
    return;
  }
  const d = Y6(c.w, c.h, n.w, n.h, r.zoom, r.panX, r.panY);
  (t.save(),
    (t.globalAlpha *= o),
    Xa(t, n.x, n.y, n.w, n.h, a),
    t.clip(),
    t.drawImage(e, d.sx, d.sy, d.sw, d.sh, n.x, n.y, n.w, n.h),
    t.restore());
}

function Re(t, e, n, a, r, o = {}) {
  if (a.w <= 0 || a.h <= 0) return;
  const c = o.alpha ?? 1;
  if (c <= 0) return;
  const d = e ? Fm(e) : null,
    h = e && d && d.w > 0 && d.h > 0;
  if (T5 && h) {
    const f = d.w / d.h;
    let p = a.w,
      m = a.h;
    (p / m > f ? (p = m * f) : (m = p / f),
      (a = { x: a.x + (a.w - p) / 2, y: a.y + (a.h - m) / 2, w: p, h: m }));
  }
  (t.save(),
    (t.globalAlpha *= c),
    o.shadow && o.shadow > 0 && jc && M5(t, a, r, o.shadow, jc),
    h ? Ds(t, e, a, r, { zoom: o.zoom, panX: o.panX, panY: o.panY }) : qm(t, a, r, n),
    t.restore());
}

const om = [
  {
    id: "dusk",
    label: "Dusk",
    angle: 135,
    stops: [
      { at: 0, color: "#2b1055" },
      { at: 1, color: "#7597de" },
    ],
  },
  {
    id: "ember",
    label: "Ember",
    angle: 135,
    stops: [
      { at: 0, color: "#f12711" },
      { at: 1, color: "#f5af19" },
    ],
  },
  {
    id: "mint",
    label: "Mint",
    angle: 135,
    stops: [
      { at: 0, color: "#0f2027" },
      { at: 0.5, color: "#203a43" },
      { at: 1, color: "#2c5364" },
    ],
  },
  {
    id: "grape",
    label: "Grape",
    angle: 135,
    stops: [
      { at: 0, color: "#41295a" },
      { at: 1, color: "#2f0743" },
    ],
  },
  {
    id: "peach",
    label: "Peach",
    angle: 135,
    stops: [
      { at: 0, color: "#ee9ca7" },
      { at: 1, color: "#ffdde1" },
    ],
  },
  {
    id: "slate",
    label: "Slate",
    angle: 135,
    stops: [
      { at: 0, color: "#232526" },
      { at: 1, color: "#414345" },
    ],
  },
  {
    id: "halo",
    label: "Halo",
    angle: 0,
    radial: !0,
    stops: [
      { at: 0, color: "#3a3a5a" },
      { at: 1, color: "#0d0d14" },
    ],
  },
];

function X6(t) {
  return om.find((e) => e.id === t);
}

function J6(t) {
  try {
    const e = JSON.parse(t);
    if (!e || !Array.isArray(e.stops) || e.stops.length < 2) return null;
    const n = e.stops
      .filter((a) => a && typeof a.color == "string")
      .map((a) => ({ at: Math.min(1, Math.max(0, Number(a.at) || 0)), color: a.color }));
    return n.length < 2
      ? null
      : { id: "custom", label: "Custom", angle: Number(e.angle) || 0, radial: !!e.radial, stops: n };
  } catch {
    return null;
  }
}

function Z6(t, e, n, a) {
  let r;
  if (a.radial) {
    const o = Math.hypot(e, n) / 2;
    r = t.createRadialGradient(e / 2, n / 2, 0, e / 2, n / 2, o);
  } else {
    const o = (a.angle * Math.PI) / 180,
      c = e / 2,
      d = n / 2,
      h = (Math.abs(Math.cos(o)) * e + Math.abs(Math.sin(o)) * n) / 2,
      f = Math.cos(o) * h,
      p = Math.sin(o) * h;
    r = t.createLinearGradient(c - f, d - p, c + f, d + p);
  }
  for (const o of a.stops) r.addColorStop(o.at, o.color);
  ((t.fillStyle = r), t.fillRect(0, 0, e, n));
}

const nn = [
  {
    type: "number",
    id: "offsetX",
    label: "X",
    default: 0,
    min: -50,
    max: 50,
    step: 1,
    snap: 0,
    unit: "%",
    group: "Position",
  },
  {
    type: "number",
    id: "offsetY",
    label: "Y",
    default: 0,
    min: -50,
    max: 50,
    step: 1,
    snap: 0,
    unit: "%",
    group: "Position",
  },
];

const Q6 = [
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
  { value: "4:5", label: "4:5" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
];

const it = [{ value: "auto", label: "Auto" }, ...Q6];

const ez = 0.25;

const tz = 4;

function nz(t) {
  if (!t) return 1;
  for (const e of t.images) {
    if (!e) continue;
    const { w: n, h: a } = Fm(e);
    if (n > 0 && a > 0) return Math.min(Math.max(n / a, ez), tz);
  }
  return 1;
}

function et(t, e) {
  if (t === "auto") return nz(e);
  switch (t) {
    case "4:3":
      return 4 / 3;
    case "3:4":
      return 3 / 4;
    case "16:9":
      return 16 / 9;
    case "9:16":
      return 9 / 16;
    case "4:5":
      return 4 / 5;
    case "5:4":
      return 5 / 4;
    case "1:1":
    default:
      return 1;
  }
}

function sz(t, e) {
  const n = /^#?([0-9a-f]{6})$/i.exec(t.trim());
  if (!n) return `rgba(0,0,0,${e})`;
  const a = parseInt(n[1], 16);
  return `rgba(${(a >> 16) & 255},${(a >> 8) & 255},${a & 255},${e})`;
}

function He(t) {
  const { ctx: e, width: n, height: a, params: r } = t;
  try {
    ((e.imageSmoothingEnabled = !0), (e.imageSmoothingQuality = "high"));
  } catch {}
  (e.setTransform(1, 0, 0, 1, 0, 0),
    e.clearRect(0, 0, n, a),
    (e.fillStyle = he(r, "background", "#101014")),
    e.fillRect(0, 0, n, a));
  const o = he(r, "backgroundType", "color");
  if (o === "gradient") {
    const p = he(r, "backgroundGradient", ""),
      m = p === "custom" ? J6(he(r, "backgroundGradientCustom", "")) : X6(p);
    m && Z6(e, n, a, m);
  } else
    (o === "image" || o === "preset") && t.background && Ds(e, t.background, { x: 0, y: 0, w: n, h: a }, 0);
  const c = k5(n, a),
    d = Bm(r, "shadowEnabled", !1);
  (W6(
    d
      ? {
          offX: c * H(r, "shadowX", 0),
          offY: c * H(r, "shadowY", 1),
          blur: c * H(r, "shadowBlur", 1.5),
          spread: c * H(r, "shadowSpread", -0.25),
          color: sz(he(r, "shadowColor", "#000000"), H(r, "shadowOpacity", 40) / 100),
          unit: c,
        }
      : null,
  ),
    V6(he(r, "cardAspect", "") === "auto"));
  const h = c * H(r, "offsetX", 0),
    f = c * H(r, "offsetY", 0);
  return (
    (h || f) && e.translate(h, f),
    {
      u: c,
      content: G6(n, a, H(r, "padding", 6)),
      radius: c * H(r, "cornerRadius", 3),
      easeName: he(r, "easing", "smooth"),
      ease: w5(he(r, "easing", "smooth"), H(r, "easeAmount", 60), he(r, "easeBezier", "")),
      shadow: d ? c : 0,
    }
  );
}

function je(t, e) {
  return t.images[e % t.images.length] ?? null;
}

// ── The template — src/lib/motion-templates/presets/01-3d-and-perspective/spiral-stream.ts

const Hz = 12;

const Bz = {
  id: "spiral-stream",
  name: "Helix",
  description: "Cards descend a vertical helix, winding round as they fall.",
  slotCount: Hz,
  slotRange: { min: 6, max: 20 },
  defaultDuration: 28,
  params: [
    { type: "number", id: "turns", label: "Spiral turns", default: 3.75, min: 1, max: 6, step: 0.25 },
    { type: "number", id: "cardCount", label: "Card count", default: 24, min: 8, max: 48, step: 1 },
    {
      type: "select",
      id: "direction",
      label: "Direction",
      default: "down",
      options: [
        { value: "down", label: "Downward" },
        { value: "up", label: "Upward" },
      ],
    },
    {
      type: "select",
      id: "motion",
      label: "Motion",
      default: "flow",
      options: [
        { value: "flow", label: "Continuous" },
        { value: "pulse", label: "Fast–slow–fast" },
        { value: "steps", label: "Step per card" },
      ],
    },
    {
      type: "number",
      id: "pulse",
      label: "Pulse strength",
      default: 60,
      min: 10,
      max: 90,
      step: 5,
      unit: "%",
      visibleIf: { id: "motion", values: ["pulse"] },
    },
    {
      type: "number",
      id: "ringSize",
      label: "Spiral size",
      default: 62,
      min: 35,
      max: 90,
      step: 1,
      unit: "%",
    },
    { type: "number", id: "taper", label: "Taper", default: 0, min: -90, max: 90, step: 5, unit: "%" },
    {
      type: "number",
      id: "cardSize",
      label: "Card size",
      default: 33,
      min: 12,
      max: 36,
      step: 1,
      unit: "%",
    },
    { type: "select", id: "cardAspect", label: "Card ratio", default: "1:1", options: it },
    {
      type: "select",
      id: "cardStyle",
      label: "Card style",
      default: "curved",
      options: [
        { value: "curved", label: "Curved (3D bend)" },
        { value: "upright", label: "Upright (flat)" },
      ],
    },
    {
      type: "number",
      id: "backFade",
      label: "Back fade",
      default: 55,
      min: 10,
      max: 95,
      step: 5,
      unit: "%",
    },
    {
      type: "number",
      id: "perspective",
      label: "Perspective",
      default: 20,
      min: 0,
      max: 40,
      step: 2,
      unit: "%",
    },
    { type: "number", id: "tilt", label: "Ring tilt", default: 0, min: -45, max: 45, step: 1, unit: "°" },
    { type: "number", id: "gap", label: "Card gap", default: 28, min: 0, max: 50, step: 2, unit: "%" },
    {
      type: "number",
      id: "scalePulse",
      label: "Scale pulse",
      default: 0,
      min: 0,
      max: 60,
      step: 5,
      unit: "%",
    },
    ...nn,
  ],
  render(t) {
    const { ctx: e, t: n, width: a, height: r, params: o } = t,
      c = He(t),
      d = Math.round(H(o, "cardCount", 24)),
      h = H(o, "turns", 1.75),
      f = he(o, "direction", "down") === "down" ? 1 : -1,
      p = (c.content.w / 2) * (H(o, "ringSize", 62) / 100),
      m = c.u * H(o, "cardSize", 24),
      b = m / et(he(o, "cardAspect", "1:1"), t),
      y = 1 - H(o, "backFade", 55) / 100,
      _ = H(o, "perspective", 20) / 100,
      x = he(o, "cardStyle", "curved") === "upright",
      w = (H(o, "tilt", 0) * Math.PI) / 180,
      E = Math.cos(w),
      T = Math.sin(w),
      k = 1 - H(o, "gap", 0) / 100,
      A = H(o, "scalePulse", 0) / 100,
      C = c.radius * 1.2,
      I = he(o, "motion", "flow");
    let z = n;
    if (I === "pulse") {
      const V = H(o, "pulse", 60) / 100;
      z = n + (V / (2 * Math.PI)) * Math.sin(2 * Math.PI * n);
    } else if (I === "steps") {
      const { index: V, local: K } = Mt(n, d);
      z = (V + c.ease(xe(K, 0, 0.55))) / d;
    }
    const B = a / 2,
      O = r / 2,
      $ = Math.max(1, (Math.abs(a * T) + Math.abs(r * E) + 2 * b) / Math.max(0.2, 1 - _)),
      L = $ / (2 * Math.PI * h * Math.max(1, p)),
      X = H(o, "taper", 0) / 100,
      Y = (V) => {
        const K = We(V / $ + 0.5);
        return p * (1 - (X > 0 ? X * (1 - K) : -X * K));
      },
      F = (V, K) => {
        const M = Math.cos(V),
          U = 1 + _ * M;
        return { sx: Y(K) * Math.sin(V), sy: K, tanX: Math.cos(V), tanY: L, dNorm: M, p: U };
      },
      Q = (V) => {
        (e.translate(B + V.sx * V.p, O + V.sy * V.p), e.transform(V.tanX * V.p, V.tanY * V.p, 0, V.p, 0, 0));
      },
      P = Array.from({ length: d }, (V, K) => {
        const M = (((K / d + f * z) % 1) + 1) % 1,
          U = 2 * Math.PI * h * (M - 0.5),
          N = (M - 0.5) * $;
        return { k: K, s: M, phi: U, y: N, center: F(U, N) };
      }).sort((V, K) => V.center.dNorm - K.center.dNorm),
      q = (Math.abs(a * T) + Math.abs(r * E)) / 2 + b,
      W = as(m, b);
    (e.save(), !x && w !== 0 && (e.translate(B, O), e.rotate(w), e.translate(-B, -O)));
    for (const V of P) {
      if (Math.abs(V.y) * (1 - _) > q) continue;
      const K = je(t, V.k),
        M = y + (1 - y) * We((V.center.dNorm + 0.3) / 0.6),
        U = V.center.p,
        N = k * (1 + A * We(V.center.dNorm)) * (Y(V.y) / Math.max(1, p)),
        j = m * N,
        Z = b * N,
        ne = { x: -j / 2, y: -Z / 2, w: j, h: Z };
      if (V.center.dNorm > 0.35 && c.shadow > 0) {
        if ((e.save(), x)) {
          const be = V.center.sx * U,
            Ee = V.center.sy * U;
          (e.translate(B + be * E - Ee * T, O + be * T + Ee * E), e.scale(U, U));
        } else Q(V.center);
        (zh(e, ne, C, c.shadow * 2 * (V.center.dNorm - 0.35)), e.restore());
      }
      if (x) {
        const be = j * U,
          Ee = Z * U,
          ye = V.center.sx * U,
          ke = V.center.sy * U,
          Te = B + ye * E - ke * T,
          Se = O + ye * T + ke * E;
        Re(e, K, V.k, { x: Te - be / 2, y: Se - Ee / 2, w: be, h: Ee }, C, { alpha: M });
        continue;
      }
      if (!W) {
        (e.save(), (e.globalAlpha *= M), Q(V.center), Re(e, K, V.k, ne, C, {}), e.restore());
        continue;
      }
      const le = W.canvas.width,
        te = W.canvas.height;
      (W.ctx.clearRect(0, 0, le, te),
        Re(W.ctx, K, V.k, { x: 0, y: 0, w: le, h: te }, C),
        M < 0.999 &&
          (W.ctx.save(),
          (W.ctx.globalCompositeOperation = "source-atop"),
          (W.ctx.fillStyle = `rgba(0,0,0,${1 - M})`),
          W.ctx.fillRect(0, 0, le, te),
          W.ctx.restore()));
      const se = Math.min(60, Math.max(12, Math.round(j / 4))),
        re = Z / 2,
        fe = Math.max(1, Y(V.y)),
        ge = (be) => {
          const Ee = F(V.phi + be / fe, V.y + be * L);
          return { x: B + Ee.sx * Ee.p, y: O + Ee.sy * Ee.p, p: Ee.p };
        };
      let _e = ge(-j / 2);
      for (let be = 0; be < se; be++) {
        const Ee = ge(-j / 2 + ((be + 1) * j) / se),
          ye = _e.x,
          ke = _e.y - re * _e.p,
          Te = _e.y + re * _e.p,
          Se = Ee.x,
          $e = Ee.y - re * Ee.p;
        _e = Ee;
        const Fe = (le * be) / se,
          Ge = le / se,
          Ze = Ge * 0.75;
        (e.save(),
          e.transform((Se - ye) / Ge, ($e - ke) / Ge, 0, (Te - ke) / te, ye, ke),
          e.drawImage(W.canvas, Fe, 0, Ge + Ze, te, 0, 0, Ge + Ze, te),
          e.restore());
      }
    }
    e.restore();
  },
};

export default Bz;
