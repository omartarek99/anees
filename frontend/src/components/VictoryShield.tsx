import { useId } from 'react';
import { useLanguage } from '../lib/language-context';

/** The shape of the Unbeatable Shield, drawn around (0, 0) in a 60 x 72 box: shared with the treasure scene in StoryArt.tsx. */
export const SHIELD_PATH = 'M0 -34 L28 -24 V6 Q28 26 0 38 Q-28 26 -28 6 V-24 Z';
export const STAR_PATH = 'M0 -16 L4.7 -5 L16 -4.2 L7.4 3.4 L10 14.6 L0 8.6 L-10 14.6 L-7.4 3.4 L-16 -4.2 L-4.7 -5 Z';

/** Worn next to the name of a player who won the treasure battle (level 50 of the adventure map). */
export function VictoryShield({ size = 20 }: { size?: number }) {
  const { t } = useLanguage();
  const gold = `shield${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const label = t('story.shieldBadge');
  return (
    <span className="victory-shield" role="img" aria-label={label} title={label}>
      <svg width={size} height={size * 1.2} viewBox="-32 -38 64 80" aria-hidden="true">
        <defs>
          <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff1b8" />
            <stop offset="0.4" stopColor="#f7c948" />
            <stop offset="0.75" stopColor="#c98a1c" />
            <stop offset="1" stopColor="#f0be45" />
          </linearGradient>
        </defs>
        <path d={SHIELD_PATH} fill={`url(#${gold})`} stroke="#8a5a12" strokeWidth="3" strokeLinejoin="round" />
        <path d={SHIELD_PATH} fill="none" stroke="#fff3c9" strokeWidth="1.5" transform="scale(0.8)" opacity="0.8" />
        <path d={STAR_PATH} fill="#8a1538" stroke="#5c0d25" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
