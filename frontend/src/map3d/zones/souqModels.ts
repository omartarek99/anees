import { box, defineModel, disc, type Box } from '../voxel';

// The Souq Quarter's few landmarks: market stalls with striped awnings, lanterns, clay pots, palms, rugs and the entrance
// arch. Each is a handful of bold boxes (a stall is ~35, a pot ~14). Origin is the centre of the footprint on the ground;
// "front" is +z (the side that faces the road).

const COL = {
  wood: '#a5703d',
  woodD: '#7d5230',
  woodL: '#cf9a5e',
  red: '#d9444a',
  white: '#f7eee6',
  blue: '#3a6fc6',
  metal: '#45434c',
  metalL: '#6d6a76',
  flame: '#ffcf63',
  terra: '#c8734b',
  terraD: '#a3552f',
  terraL: '#dc8c60',
  sand: '#ead2aa',
  sandD: '#b98b63',
  gold: '#e5a93a',
  teal: '#2f9d90',
  cream: '#f1dcb8',
  carpetD: '#7e1f1f',
};

/** A chunky round slab: a full-width band between two narrower strips, so the corners are cut (a pot's belly). */
function oct(w: number, y: number, h: number, c: string): Box[] {
  const k = w * 0.7;
  const e = (w - k) / 2;
  const z = (k + e) / 2;
  return [box(0, y, 0, w, h, k, c), box(0, y, z, k, h, e, c), box(0, y, -z, k, h, e, c)];
}

// --- market stalls ---------------------------------------------------------------------------------------------------

/** A stall 6.4 wide and 4.4 deep: four posts, a back wall, a counter with three crates of goods and a striped sloping awning. */
function stall(stripe: string, goods: readonly string[]): Box[] {
  const out: Box[] = [box(0, 0, 0, 6.4, 0.3, 4.4, COL.woodL)];
  for (const sx of [-2.9, 2.9]) out.push(box(sx, 0.3, 1.9, 0.5, 3.3, 0.5, COL.woodD), box(sx, 0.3, -1.9, 0.5, 4.1, 0.5, COL.woodD));
  out.push(box(0, 0.3, -2.0, 5.3, 4.0, 0.3, COL.wood));
  out.push(box(0, 0.3, 0.8, 5.4, 1.4, 1.3, COL.wood), box(0, 1.7, 0.8, 5.8, 0.2, 1.6, COL.woodL));
  goods.forEach((c, i) => out.push(box(-1.7 + i * 1.7, 1.9, 0.8, 1.3, 0.4, 1.0, COL.woodD), box(-1.7 + i * 1.7, 2.3, 0.8, 1.1, 0.5, 0.8, c)));
  // the awning steps down from the high back to the low front; the stripes run front to back, and a scalloped valance hangs off it
  for (let i = 0; i < 5; i++) {
    const c = i % 2 ? COL.white : stripe;
    const x = (i - 2) * 1.3;
    const v = i % 2 ? 0.5 : 0.8;
    out.push(box(x, 4.4, -1.5, 1.3, 0.4, 1.5, c), box(x, 4.0, 0, 1.3, 0.4, 1.5, c), box(x, 3.6, 1.5, 1.3, 0.4, 1.5, c), box(x, 3.6 - v, 2.35, 1.3, v, 0.2, c));
  }
  return out;
}

export const STALL_RED = defineModel(() => stall(COL.red, ['#f28a1e', '#d63a2f', '#f3d33b']));
export const STALL_BLUE = defineModel(() => stall(COL.blue, ['#4fae4f', '#e8b23a', '#d63a2f']));

// --- lanterns --------------------------------------------------------------------------------------------------------

/** A tall metal lantern on a post, its flame a glowing block in a four-bar cage. About 6.5 blocks high. */
export const LANTERN = defineModel(() => {
  const out: Box[] = [
    box(0, 0, 0, 1.6, 0.5, 1.6, COL.metal),
    box(0, 0.5, 0, 0.6, 2.7, 0.6, COL.metal),
    box(0, 3.2, 0, 2.0, 0.3, 2.0, COL.metalL),
    box(0, 3.5, 0, 1.3, 1.8, 1.3, COL.flame, true),
    box(0, 5.3, 0, 2.0, 0.3, 2.0, COL.metalL),
    box(0, 5.6, 0, 1.3, 0.4, 1.3, COL.metal),
    box(0, 6.0, 0, 0.6, 0.5, 0.6, COL.metalL),
  ];
  for (const sx of [-0.75, 0.75]) for (const sz of [-0.75, 0.75]) out.push(box(sx, 3.5, sz, 0.25, 1.8, 0.25, COL.metal));
  return out;
});

/** The warm patch of light a lantern throws on the plaza: one lighter pink disc, flat on the ground. */
export const POOL = defineModel(() => disc(0, 0, 0, 2.6, 0.06, '#f2bba6'), 0);

// --- clay pots -------------------------------------------------------------------------------------------------------

/** A terracotta amphora with two handles, about 3.9 blocks high; place smaller copies with a scale. */
export const POT = defineModel(() => {
  const out: Box[] = [box(0, 0, 0, 1.4, 0.4, 1.4, COL.terraD)];
  out.push(...oct(2.0, 0.4, 0.5, COL.terra), ...oct(2.6, 0.9, 0.9, COL.terra), ...oct(2.0, 1.8, 0.5, COL.terraL));
  out.push(box(0, 2.3, 0, 1.3, 0.8, 1.3, COL.terra), box(0, 3.1, 0, 1.8, 0.3, 1.8, COL.terraL));
  for (const s of [-1, 1]) out.push(box(s * 0.95, 2.4, 0, 0.4, 1.0, 0.5, COL.terraD));
  return out;
});

// --- palms -----------------------------------------------------------------------------------------------------------

/** A banded trunk leaning towards +x, topped with eight fronds that arch out and droop. About 9 blocks high and 12 across. */
export const PALM = defineModel(() => {
  const lean = (k: number) => 0.05 * k * k;
  const out: Box[] = [];
  for (let k = 0; k < 7; k++) {
    const w = 1.5 - 0.09 * k;
    out.push(box(lean(k), k, 0, w, 1, w, k % 2 ? '#a06b3a' : '#8a5a31'));
  }
  const cx = lean(6);
  out.push(box(cx, 7, 0, 2.2, 0.9, 2.2, '#2f7d3a'), box(cx, 7.9, 0, 1.4, 0.8, 1.4, '#3a9a43'));
  // each frond is a few overlapping boxes that droop towards a lighter tip; the z and diagonal fronds sit a little lower than the
  // x ones, so no two fronds share a top face
  const green = ['#2f8a3e', '#46a74a', '#5cb94e', '#7acb5c'];
  for (const s of [-1, 1]) {
    [[1.5, 7.6, 1.8, 1.5], [3.0, 7.4, 1.5, 1.3], [4.3, 6.9, 1.3, 1.1], [5.3, 6.1, 1.1, 0.9]].forEach(([d, y, len, w], i) => {
      out.push(box(cx + s * d, y, 0, len, 0.6, w, green[i]), box(cx, y - 0.1, s * d, w, 0.6, len, green[i]));
    });
    for (const t of [-1, 1]) {
      [[1.7, 7.3, 1.8], [3.1, 6.7, 1.5], [4.2, 5.9, 1.2]].forEach(([d, y, w], i) => out.push(box(cx + s * d, y, t * d, w, 0.6, w, green[i + 1])));
    }
  }
  return out;
});

// --- rugs ------------------------------------------------------------------------------------------------------------

/** A rug laid flat on the plaza, 4.6 x 6.6: a border, a field, a cream band and a gold medallion, each a hair higher. */
const rug = (field: string, border: string) =>
  defineModel(() => {
    const w = 4.6;
    const d = 6.6;
    return [
      box(0, 0, 0, w, 0.07, d, border),
      box(0, 0, 0, w - 0.8, 0.1, d - 0.8, field),
      box(0, 0, 0, w - 1.6, 0.13, d - 1.6, COL.cream),
      box(0, 0, 0, w - 2.1, 0.16, d - 2.1, field),
      box(0, 0, 0, w * 0.4, 0.19, d * 0.25, COL.gold),
    ];
  }, 0);

export const RUG_RED = rug(COL.red, COL.carpetD);
export const RUG_BLUE = rug(COL.blue, COL.carpetD);

// --- the entrance arch -----------------------------------------------------------------------------------------------

/** A corbelled archway across the road with teal and gold inlay: opens along z, 5.5 wide between its pillars, 9 high. */
export const GATE = defineModel(() => {
  const out: Box[] = [];
  for (const s of [-1, 1]) {
    out.push(box(s * 3.5, 0, 0, 2.0, 0.6, 2.0, COL.sandD), box(s * 3.5, 0.6, 0, 1.5, 5.0, 1.5, COL.sand));
    out.push(box(s * 3.5, 2.6, 0, 1.8, 0.5, 1.8, COL.gold), box(s * 3.5, 4.2, 0, 1.2, 0.9, 1.7, COL.teal));
    out.push(box(s * 3.0, 5.6, 0, 2.2, 0.8, 1.5, COL.terra), box(s * 1.9, 6.4, 0, 2.4, 0.8, 1.5, COL.terraL));
  }
  out.push(box(0, 7.2, 0, 2.2, 0.8, 1.5, COL.terra), box(0, 8.0, 0, 1.0, 0.6, 1.0, COL.sand), box(0, 8.6, 0, 0.7, 0.7, 0.7, COL.gold));
  return out;
});
