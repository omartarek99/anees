import { useMemo } from 'react';
import { groundHeight } from '../ground';
import { MAP_WIDTH } from '../layout';
import { nearestOnPath } from '../pathLine';
import type { MapZone } from '../schema';
import { HeightfieldTerrain } from '../Terrain';
import { spotAt as at } from '../placement';
import { Baked, type Placement, type Spot } from '../voxel';
import { GoldStars, SwayingPalm, type StarSpot } from './desertFx';
import { baseHeight, pathLevel, POND, sandSide, sandTop, VILLAGE } from './desertGround';
import * as M from './desertModels';
import type { ZoneModule } from './types';

// The Desert Oasis, from the top of its artwork (level 1) to the bottom (level 10): an oasis of palms round a pond, an adobe
// village, a few cacti and boulders, flowers, a gift box beside level 5 and three gold stars. Deliberately sparse: everything
// that stands still is baked into one mesh; only the stars bob and one palm sways.

const ART_W = 675;
const ART_H = 2000;

/** A spot taken from the artwork (pixels), pushed out of the road if it sits closer to it than `minRoad` blocks. */
function art(zone: MapZone, px: number, py: number, minRoad = 4.6, ry = 0, s = 1): Spot {
  let x = (px / ART_W - 0.5) * MAP_WIDTH;
  let z = zone.z0 + (py / ART_H) * (zone.z1 - zone.z0);
  for (let i = 0; i < 4; i++) {
    const hit = nearestOnPath(x, z);
    if (!hit.point || hit.d >= minRoad) break;
    const k = (minRoad - hit.d + 0.05) / Math.max(hit.d, 0.01);
    x += (x - hit.point.x) * k;
    z += (z - hit.point.z) * k;
  }
  return { x, y: groundHeight(x, z), z, ry, s };
}


function buildLayout(zone: MapZone) {
  // the oasis: palms round the pond, the tall ones beside and behind it so the water stays in view from the front
  const palms = [
    { kind: 0, ...at(POND.x + 6, POND.z + 2.6, 4.4) }, // the first one sways
    { kind: 0, ...at(POND.x - 4.6, POND.z - 3.6, 0.3) },
    { kind: 1, ...at(POND.x + 4.6, POND.z - 4.2, 2.6) },
    { kind: 1, ...at(POND.x - 5, POND.z + 3.4, 1) },
  ];
  const [sway, ...fixed] = palms;

  const houses = [
    { model: M.HOUSE_A, ...at(VILLAGE.x - 2.2, VILLAGE.z - 0.6, -0.08) },
    { model: M.HOUSE_B, ...at(VILLAGE.x + 2.4, VILLAGE.z - 3.6, 0.1) },
    { model: M.HOUSE_C, ...at(VILLAGE.x + 3.8, VILLAGE.z + 3.1, -0.12) },
  ];

  const star = (px: number, py: number, lift: number, s: number, phase: number): StarSpot => {
    const p = art(zone, px, py, 0);
    return { x: p.x, y: p.y + lift, z: p.z, s, phase };
  };

  const parts: Placement[] = [
    { model: M.WATER, items: [{ x: 0, y: 0, z: 0 }] },
    { model: M.PALM[sway.kind].trunk, items: [sway] },
    ...M.PALM.map((p, kind) => ({ model: p.whole, items: fixed.filter((q) => q.kind === kind) })),
    ...houses.map((h) => ({ model: h.model, items: [h] })),
    { model: M.CACTUS.plain, items: [art(zone, 635, 540, 5.2, 0.4), art(zone, 333, 1325, 4.6, 2, 0.6)] },
    { model: M.CACTUS.flower, items: [art(zone, 65, 1170, 5, 1.2), art(zone, 610, 1650, 5, 2.4)] },
    { model: M.FLOWER, items: [art(zone, 452, 385, 4.4, 0.5, 1.2), art(zone, 395, 800, 4.4, 2, 1.2), art(zone, 258, 1320, 4.4, 4, 1.2)] },
    { model: M.ROCK.large, items: [art(zone, 120, 1610, 5, 0.5, 1.15), art(zone, 520, 725, 5, 1.1, 0.8)] },
    { model: M.ROCK.medium, items: [art(zone, 215, 1665, 5, 2.1, 0.9), art(zone, 460, 630, 5, 0.3), art(zone, 195, 1232, 5, 4)] },
    { model: M.GIFT, items: [art(zone, 130, 935, 4.4, 0.35, 1.1)] },
  ];
  const stars = [star(235, 160, 5.2, 1.2, 0), star(333, 685, 4.6, 1, 2.4), star(72, 890, 3.8, 0.8, 4.4)];
  return { parts, sway, stars };
}

function DesertScenery({ zone, still }: { zone: MapZone; still: boolean }) {
  const L = useMemo(() => buildLayout(zone), [zone]);
  return (
    <group>
      <Baked parts={L.parts} />
      <SwayingPalm kind={L.sway.kind} spot={L.sway} still={still} />
      <GoldStars stars={L.stars} still={still} />
    </group>
  );
}

export const desert: ZoneModule = {
  baseHeight,
  pathLevel,
  Ground: ({ zone }: { zone: MapZone }) => <HeightfieldTerrain zone={zone} top={sandTop} side={sandSide} />,
  Scenery: DesertScenery,
  atmosphere: { sky: '#f7d99d', fog: '#f3dca8', sun: '#fff1d0', sunIntensity: 2.4, ambient: '#ffe9c4', ambientIntensity: 0.9 },
};
