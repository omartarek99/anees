import * as THREE from 'three';

// Small helpers for the story scenes (story3d/): every animation is a pure function of the time since the window opened, so a
// scene can be drawn at any moment and a reduced-motion visitor simply gets its last frame.

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0 before `a`, 1 after `b`, a straight ramp in between. */
export const seg = (t: number, a: number, b: number) => (Number.isFinite(a) && Number.isFinite(b) ? clamp01((t - a) / (b - a)) : 0); // an event that has not happened yet (a = Infinity) is 0, never NaN
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
export const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
export const easeOutBounce = (x: number) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};
/** A flash that is 1 at `at` and fades to 0 over `len` seconds. */
export const flash = (t: number, at: number, len = 0.35) => (t < at ? 0 : Math.max(0, 1 - (t - at) / len));

/** The same numbers every time: small deterministic random generator (so confetti looks the same on every render). */
export function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A point on the quadratic curve a -> c -> b. */
export function bezier(out: THREE.Vector3, a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, x: number) {
  const u = 1 - x;
  return out.set(u * u * a.x + 2 * u * x * c.x + x * x * b.x, u * u * a.y + 2 * u * x * c.y + x * x * b.y, u * u * a.z + 2 * u * x * c.z + x * x * b.z);
}
