import type { RankKey } from './medalLevels';

/**
 * The two perks that follow a student's rank: the frame around their picture (the home page, public/images/frames) and the colour the pages wear
 * (RankAura.tsx). A page colour they picked -- a rank they have reached, or 'normal' -- wins over their own rank's, for the frame as well; with none
 * picked both follow the rank, except that Iron, the rank everyone starts in, keeps the site's own colours (a null colour).
 */
export function perksOf(tierKey: string, aura: RankKey | 'normal' | null | undefined): { frame: string; colour: RankKey | null } {
  return {
    frame: aura && aura !== 'normal' ? aura : tierKey,
    colour: aura === 'normal' ? null : aura ?? (tierKey === 'iron' ? null : (tierKey as RankKey)),
  };
}
