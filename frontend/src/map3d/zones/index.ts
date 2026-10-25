import { registerGround } from '../ground';
import type { ZoneKey } from '../schema';
import { corniche } from './corniche';
import { desert } from './desert';
import { falcon } from './falcon';
import { observatory } from './observatory';
import { souq } from './souq';
import type { ZoneModule } from './types';

export const ZONE_MODULES: Record<ZoneKey, ZoneModule> = { desert, souq, corniche, observatory, falcon };

// Terrain height queries (the road, the level pads, scenery placement) go through ground.ts: hand it each zone's landscape.
for (const [key, mod] of Object.entries(ZONE_MODULES)) registerGround(key as ZoneKey, mod);
