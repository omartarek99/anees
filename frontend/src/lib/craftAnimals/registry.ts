import type { SpeciesSpec } from './types';
import { SPECIES as exemplars } from './species/exemplars';
import { SPECIES as pasture } from './species/pasture';
import { SPECIES as equines } from './species/equines';
import { SPECIES as wildland } from './species/wildland';
import { SPECIES as sky } from './species/sky';
import { SPECIES as fish } from './species/fish';
import { SPECIES as sea } from './species/sea';
import { SPECIES as amphibians } from './species/amphibians';

/** Every animal species, in a stable order. Each module lists its own species. */
export const SPECIES_LIST: readonly SpeciesSpec[] = [...exemplars, ...pasture, ...equines, ...wildland, ...sky, ...fish, ...sea, ...amphibians];

export const SPECIES: Readonly<Record<string, SpeciesSpec>> = Object.fromEntries(SPECIES_LIST.map((s) => [s.kind, s]));

export const speciesOf = (kind: string): SpeciesSpec => SPECIES[kind] ?? SPECIES.pig;
