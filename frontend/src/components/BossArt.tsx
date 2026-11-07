import type { CSSProperties } from 'react';
import type { BossArtKey } from '../lib/boss-config';

// A boss's portrait: the render for its level (public/images/bosses/<artKey>.webp, cut out of the boss sheet), fitted inside the
// box it is given, with a soft glow in the boss's colour. Enraged (it is winning, or survived the fight): the glow turns red and
// pulses; reduced motion keeps the red glow still (theme.css, .boss-art).
export function BossArt({ artKey, glow, enraged }: { artKey: BossArtKey; glow: string; enraged?: boolean }) {
  return (
    <img
      className={`boss-art${enraged ? ' is-enraged' : ''}`}
      src={`/images/bosses/${artKey}.webp`}
      alt=""
      draggable={false}
      style={{ '--boss-glow': glow } as CSSProperties}
    />
  );
}
