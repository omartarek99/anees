// Small helpers shared by the species modules. Nothing here is required - a species is just a list of
// parts - but these keep legs, wings and the common skins short and consistent.
import type { JointSpec, Paint, PartSpec, SkinFn, Vec3 } from '../types';
import { tones } from '../paint';

export { shade, mix, tones } from '../paint';

/** Four legs; diagonal pairs (front-left + back-right, front-right + back-left) swing together.
 *  `x` = distance of the leg centres from the middle line, `zFront` / `zBack` = their z. The feet stand on y = 0.
 *  All four share one uv + skin (the unwrap is painted once). */
export function legs4(o: { size: Vec3; x: number; zFront: number; zBack: number; uv: [number, number]; skin: SkinFn; amp?: number }): PartSpec[] {
  const h = o.size[1];
  const amp = o.amp ?? 0.8;
  const leg = (sx: number, z: number, phase: number): PartSpec => ({ at: [sx * o.x, h / 2, z], size: o.size, uv: o.uv, skin: o.skin, joint: { chan: 'walk', axis: 'x', amp, phase } });
  return [leg(1, o.zFront, 0), leg(-1, o.zFront, Math.PI), leg(1, o.zBack, Math.PI), leg(-1, o.zBack, 0)];
}

/** Two legs (birds, bipeds): left and right swing in opposition. */
export function legs2(o: { size: Vec3; x: number; z: number; uv: [number, number]; skin: SkinFn; amp?: number; y?: number }): PartSpec[] {
  const h = o.size[1];
  const amp = o.amp ?? 0.9;
  const y = o.y ?? h / 2;
  const leg = (sx: number, phase: number): PartSpec => ({ at: [sx * o.x, y, o.z], size: o.size, uv: o.uv, skin: o.skin, joint: { chan: 'walk', axis: 'x', amp, phase } });
  return [leg(1, 0), leg(-1, Math.PI)];
}

/** A pair of wings that hang out sideways from a shoulder line. `size` is one wing (w = its span outwards).
 *  `shoulder` = where the inner edge of the left wing joins the body ([x, y, z], x > 0). Folded at `fold` radians
 *  (down along the body) when the animal is not flying, beating +-`amp` around the horizontal when it is. */
export function wings(o: { size: Vec3; shoulder: Vec3; uv: [number, number]; skin: SkinFn; amp?: number; fold?: number }): PartSpec[] {
  const [w] = o.size;
  const [sx, sy, sz] = o.shoulder;
  const amp = o.amp ?? 0.9;
  const fold = o.fold ?? 1.2;
  const wing = (side: 1 | -1): PartSpec => ({
    at: [side * (sx + w / 2), sy, sz],
    size: o.size,
    uv: o.uv,
    skin: o.skin,
    joint: { chan: 'flap', axis: 'z', amp: side * amp, rest: -side * fold, pivot: [side * sx, sy, sz] },
  });
  return [wing(1), wing(-1)];
}

/** Joint for the head (and everything glued to it: snout, ears, horns): dips to the ground when grazing. */
export const headDip = (pivot: Vec3, amp = 0.55): JointSpec => ({ chan: 'graze', axis: 'x', amp, pivot });

/** Joint for a tail that wags sideways. */
export const tailWag = (pivot: Vec3, amp = 0.35): JointSpec => ({ chan: 'tail', axis: 'y', amp, pivot });

/** Speckled fur / skin on every face, with an optional lighter underside. */
export function fur(base: string, o: { spread?: number; belly?: string; back?: string } = {}): SkinFn {
  return (g: Paint) => {
    g.speckle('all', tones(base, o.spread ?? 0.07));
    if (o.belly) g.speckle('bottom', tones(o.belly, 0.05));
    if (o.back) g.speckle('top', tones(o.back, 0.06));
  };
}

/** Two eyes on a face: `y` rows from the top, `gap` px between them (centred). */
export function eyes(g: Paint, face: 'front' | 'px' | 'nx', y: number, gap: number, color = '#15151c', white = false): void {
  const { w } = g.size(face);
  const x0 = Math.floor((w - gap) / 2) - 1;
  const x1 = x0 + gap + 1;
  if (white) {
    g.px(face, x0 - 1, y, '#f4f4f4');
    g.px(face, x1 + 1, y, '#f4f4f4');
  }
  g.px(face, x0, y, color);
  g.px(face, x1, y, color);
}
