import { ZONES } from '../layout';
import type { MapZone } from '../schema';
import { HeightfieldTerrain, type TopColor } from '../Terrain';
import { Baked } from '../voxel';
import { SOUQ_PARTS } from './souqLayout';
import type { ZoneModule } from './types';

// The Souq Quarter: a flat salmon-pink plaza (two close pinks in a 3-block checker, the artwork's dot grid as slightly darker
// blocks) with a few landmarks baked into one mesh (souqLayout.ts). The road is a red carpet, built elsewhere.

const Z0 = ZONES.find((z) => z.key === 'souq')!.z0;

const PLAZA = ['#e8a698', '#e2a092'];
const DOT = '#d68b7f';

const top: TopColor = (x, z) => {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  // the dots: one every 9 blocks, every other row shifted half a step
  const lz = iz - Z0;
  const row = Math.floor(lz / 9);
  if (lz - row * 9 === 4 && (((ix + (row & 1) * 4) % 9) + 9) % 9 === 0) return DOT;
  return PLAZA[(Math.floor(ix / 3) + Math.floor(iz / 3)) & 1];
};

const Ground = ({ zone }: { zone: MapZone }) => <HeightfieldTerrain zone={zone} top={top} />;

const Scenery = () => <Baked parts={SOUQ_PARTS} />;

export const souq: ZoneModule = {
  baseHeight: () => 0,
  Ground,
  Scenery,
  atmosphere: { sky: '#f7c9b4', fog: '#f3cdb8', sun: '#ffe8cc', sunIntensity: 2.3, ambient: '#ffdccb', ambientIntensity: 0.9 },
};
