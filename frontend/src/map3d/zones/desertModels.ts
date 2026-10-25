import { box, defineModel, type Box } from '../voxel';
import { inPond, POND } from './desertGround';

// Every desert structure as a short list of coloured boxes (see voxel.tsx). Origin = the ground under the object's centre;
// parts that stand on uneven sand reach a little below y = 0 so nothing ever floats. Few, bold blocks: the whole zone is baked
// into one mesh, so every box here is a cost paid by every visitor.

const shift = (bs: Box[], dx: number, dy: number, dz: number): Box[] => bs.map((b) => ({ ...b, x: b.x + dx, y: b.y + dy, z: b.z + dz }));

// ---- palms --------------------------------------------------------------------------------------------------------------

/** A trunk of stacked blocks that bends towards its crown in half-block steps. `top` is the crown's sideways offset. */
function trunk(h: number, lean: number) {
  const boxes: Box[] = [];
  let top = 0;
  for (let i = 0; i < h; i++) {
    top = Math.round(lean * (i / h) ** 2 * 2) / 2;
    const w = i === 0 ? 1.8 : i >= h - 2 ? 1 : 1.2;
    boxes.push(box(top, i === 0 ? -0.5 : i, 0, w, i === 0 ? 1.5 : 1.02, w, i % 2 ? '#9a6a3b' : '#7f5430'));
  }
  return { boxes, top };
}

const FROND = ['#2f8a3c', '#4aae53', '#74c95e']; // dark by the hub, light at the tips
const DROOP = [0.5, 0.15, -0.7];

/** The crown, with its origin at the top of the trunk: a hub, two coconuts and eight drooping fronds of three blocks. */
function crown(twist: number): Box[] {
  const out: Box[] = [
    box(0, -0.5, 0, 1.8, 1.4, 1.8, '#2f7f38'),
    box(0, 0.8, 0, 0.8, 1, 0.8, '#62c058'),
    box(0.55, -1.2, 0.35, 0.8, 0.8, 0.8, '#6a4422'),
    box(-0.5, -1.1, -0.45, 0.8, 0.8, 0.8, '#7b4f27'),
  ];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + twist;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const alongX = Math.abs(ca) > Math.abs(sa);
    for (let r = 0; r < 3; r++) {
      const dist = 1.3 + r * 1.5;
      const wide = [1.6, 1.4, 0.9][r];
      out.push(box(ca * dist, DROOP[r], sa * dist, alongX ? 1.8 : wide, 0.5, alongX ? wide : 1.8, FROND[r]));
    }
  }
  return out;
}

const PALM_KINDS = [
  { h: 8, lean: 2, twist: 0.2 },
  { h: 6, lean: -1.5, twist: 0.5 },
];

/** `whole` is the palm in one piece (baked); `trunk` + `crown` (placed at x = top, y = h) let one palm's crown sway. */
export const PALM = PALM_KINDS.map(({ h, lean, twist }) => {
  const t = trunk(h, lean);
  return {
    top: t.top,
    h,
    trunk: defineModel(() => t.boxes),
    crown: defineModel(() => crown(twist)),
    whole: defineModel(() => [...t.boxes, ...shift(crown(twist), t.top, h, 0)]),
  };
});

// ---- the pond -----------------------------------------------------------------------------------------------------------

/** Water laid over the carved pond in runs of blocks (absolute coordinates: place it at the origin). The rim is turquoise. */
export const WATER = defineModel(() => {
  const out: Box[] = [];
  const x0 = Math.floor(POND.x - POND.rx - 2);
  const x1 = Math.ceil(POND.x + POND.rx + 2);
  const z0 = Math.floor(POND.z - POND.rx - 2);
  const z1 = Math.ceil(POND.z + POND.rx + 2);
  const inside = (ix: number, iz: number) => inPond(ix + 0.5, iz + 0.5);
  const rim = (ix: number, iz: number) => !inside(ix + 1, iz) || !inside(ix - 1, iz) || !inside(ix, iz + 1) || !inside(ix, iz - 1);
  for (let iz = z0; iz < z1; iz++) {
    let start = x0;
    let kind = 0; // 0 = sand, 1 = rim water, 2 = deep water
    for (let ix = x0; ix <= x1; ix++) {
      const k = ix < x1 && inside(ix, iz) ? (rim(ix, iz) ? 1 : 2) : 0;
      if (k === kind) continue;
      if (kind) out.push(box((start + ix) / 2, -0.85, iz + 0.5, ix - start, 0.75, 1, kind === 1 ? '#72d4d6' : '#3aa9de'));
      start = ix;
      kind = k;
    }
  }
  return out;
});

// ---- cacti, flowers, rocks ----------------------------------------------------------------------------------------------

const CG = '#4d9a3c';
const CGL = '#72b955';
const PINK = '#ff5c9d';
const YEL = '#ffd23f';

/** A saguaro: a ribbed trunk and two arms that go out, then up. The pink flower sits on the left arm. */
function saguaro(h: number, flower: boolean): Box[] {
  const arm = (side: number, y: number, up: number): Box[] => [
    box(side * 1.5, y, 0, 1.4, 1.2, 1.2, CG),
    box(side * 2.15, y, 0, 1.2, up, 1.2, CG),
    box(side * 2.15, y + up - 0.1, 0, 0.8, 0.6, 0.8, CG),
  ];
  const ya = Math.round(h * 0.42);
  return [
    box(0, -0.6, 0, 1.8, h, 1.8, CG),
    box(0, h - 0.7, 0, 1.3, 0.9, 1.3, CG),
    box(0, 0.2, 0.92, 0.3, h - 1.2, 0.1, CGL),
    box(0, 0.2, -0.92, 0.3, h - 1.2, 0.1, CGL),
    box(0.92, 0.2, 0, 0.1, h - 1.2, 0.3, CGL),
    box(-0.92, 0.2, 0, 0.1, h - 1.2, 0.3, CGL),
    ...arm(-1, ya, 2.9),
    ...arm(1, Math.round(h * 0.6), 2.1),
    ...(flower ? [box(-2.15, ya + 3.1, 0, 1.3, 0.45, 1.3, PINK), box(-2.15, ya + 3.5, 0, 0.55, 0.3, 0.55, YEL)] : []),
  ];
}
export const CACTUS = { plain: defineModel(() => saguaro(7, false)), flower: defineModel(() => saguaro(7, true)) };

/** A pink flower on a stem. */
export const FLOWER = defineModel(() => [
  box(0, -0.3, 0, 0.36, 2.2, 0.36, '#4e9b3a'),
  box(0.55, 0.35, 0, 0.95, 0.25, 0.55, '#5db046'),
  box(0, 1.8, 0, 0.85, 0.6, 0.85, '#ffcf3a'),
  box(0.9, 1.75, 0, 0.95, 0.5, 0.75, PINK),
  box(-0.9, 1.75, 0, 0.95, 0.5, 0.75, PINK),
  box(0, 1.75, 0.9, 0.75, 0.5, 0.95, PINK),
  box(0, 1.75, -0.9, 0.75, 0.5, 0.95, PINK),
]);

const R1 = '#cba488';
const R2 = '#b98f72';
const R3 = '#a8805f';
const R4 = '#dcbc9f';
export const ROCK = {
  large: defineModel(() => [
    box(0, -0.9, 0, 4.6, 2.5, 4, R2),
    box(0.1, 1.6, -0.1, 3.8, 1.4, 3.2, R1),
    box(-0.4, 3, 0.1, 2.4, 1, 2.2, R4),
    box(2.5, -0.9, 1.1, 2.2, 2, 2, R3),
  ]),
  medium: defineModel(() => [box(0, -0.8, 0, 3, 2, 2.6, R2), box(0.1, 1.2, 0, 2.4, 1.1, 2, R1), box(1.7, -0.8, 0.8, 1.4, 1.3, 1.4, R3)]),
};

// ---- the gift box beside level 5 ----------------------------------------------------------------------------------------

const RIB = '#fff6e6';
export const GIFT = defineModel(() => [
  box(0, 0, 0, 2.6, 2.2, 2.6, '#e8812e'),
  box(0, 2.1, 0, 2.8, 0.5, 2.8, '#f29a4a'),
  box(0, 0, 0, 0.6, 2.66, 2.9, RIB),
  box(0, 0, 0, 2.9, 2.62, 0.6, RIB),
  box(0, 2.65, 0, 0.6, 0.6, 0.6, '#f4d9b8'),
  box(0.7, 2.65, 0, 0.9, 0.8, 0.4, RIB),
  box(-0.7, 2.65, 0, 0.9, 0.8, 0.4, RIB),
]);

// ---- adobe village ------------------------------------------------------------------------------------------------------

const W = '#d6a56a';
const WL = '#e9c58b';
const WD = '#bf8f5a';
const DK = '#3a2315';
const WO = '#7b4a29';

/** Beam ends poking out of an adobe wall, the classic mud-brick detail. */
const vigas = (x0: number, z0: number, y: number, n: number, step: number): Box[] => Array.from({ length: n }, (_, i) => box(x0 + step * i, y, z0, 0.34, 0.34, 0.7, WO));

export const HOUSE_A = defineModel(() => [
  box(0, -1.5, 0, 6, 6.5, 6, W),
  box(0, -1.5, 0, 6.25, 1.9, 6.25, WD),
  box(0, 5, 0, 6.5, 0.4, 6.5, WL),
  box(-1.3, 5.4, -1.2, 3.4, 2.4, 3.4, W),
  box(-1.3, 7.8, -1.2, 3.8, 0.35, 3.8, WL),
  // door, lintel and a window on the +z (front) wall, one on the side
  box(-1.1, 0.4, 3.04, 1.5, 2.7, 0.14, DK),
  box(-1.1, 3.1, 3.06, 2, 0.28, 0.18, WO),
  box(1.55, 2, 3.04, 0.95, 1.05, 0.14, DK),
  box(3.04, 2, -0.8, 0.14, 1, 0.9, DK),
  ...vigas(-2.1, 3.3, 4.4, 4, 1.4),
]);

export const HOUSE_B = defineModel(() => [
  box(0, -1.5, 0, 3.8, 8.1, 3.8, W),
  box(0, -1.5, 0, 4.05, 1.9, 4.05, WD),
  box(0, 6.6, 0, 4.3, 0.4, 4.3, WL),
  box(0, 0.4, 1.94, 1.1, 2.1, 0.14, DK),
  box(0, 2.5, 1.96, 1.5, 0.24, 0.18, WO),
  box(0, 4, 1.94, 0.8, 1, 0.12, DK),
  box(0, 5.2, 1.94, 0.6, 0.7, 0.12, DK),
  // a little flag
  box(1.3, 7, -1.3, 0.14, 2.6, 0.14, WO),
  box(1.78, 8.5, -1.3, 0.95, 0.6, 0.08, '#d9483a'),
]);

export const HOUSE_C = defineModel(() => [
  box(0, -1.5, 0, 5.6, 5.3, 5.2, W),
  box(0, -1.5, 0, 5.85, 1.9, 5.45, WD),
  box(0, 3.8, 0, 6.1, 0.4, 5.7, WL),
  box(-1.4, 4.2, -1, 2.4, 1.6, 2.4, W),
  box(-1.4, 5.8, -1, 2.8, 0.3, 2.8, WL),
  box(0.2, 0.4, 2.64, 1.5, 2.3, 0.14, DK),
  box(0.2, 2.7, 2.66, 2, 0.24, 0.18, WO),
  box(-1.8, 1.7, 2.64, 0.9, 1, 0.14, DK),
  box(2, 1.7, 2.64, 0.9, 1, 0.14, DK),
  // a striped awning over the door
  ...Array.from({ length: 5 }, (_, i) => box(-0.6 + i * 0.7, 3, 3.35, 0.7, 0.14, 1.3, i % 2 ? '#fff0dc' : '#d9483a')),
]);

// ---- gold stars ---------------------------------------------------------------------------------------------------------

const STAR_ROWS = ['....#....', '...###...', '...###...', '#########', '.#######.', '..#####..', '..#####..', '.###.###.', '.##...##.'];

/** A pixel star: a gold body with a brighter, glowing face on its inner blocks. Runs of pixels become single boxes. */
function starBoxes(px: number): Box[] {
  const out: Box[] = [];
  const rows = STAR_ROWS.length;
  const solid = (r: number, c: number) => STAR_ROWS[r]?.[c] === '#';
  const inner = (r: number, c: number) => solid(r, c) && solid(r - 1, c) && solid(r + 1, c) && solid(r, c - 1) && solid(r, c + 1);
  const runs = (test: (r: number, c: number) => boolean, depth: number, color: string, glow: boolean) => {
    for (let r = 0; r < rows; r++) {
      let start = -1;
      for (let c = 0; c <= STAR_ROWS[r].length; c++) {
        const on = c < STAR_ROWS[r].length && test(r, c);
        if (on && start < 0) start = c;
        if (!on && start >= 0) {
          out.push(box(((start + c - 1) / 2 - 4) * px, (rows - 1 - r - rows / 2) * px, 0, (c - start) * px, px, depth, color, glow));
          start = -1;
        }
      }
    }
  };
  runs(solid, px * 1.7, '#ffbd1f', false);
  runs(inner, px * 1.78, '#ffe66a', true);
  return out;
}
export const STAR = defineModel(() => starBoxes(0.46), 0.02);
