import { useId } from 'react';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';

export type RankTier = {
  key: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'emerald' | 'master';
  name: string;
  nameAr: string;
  color: string;
  colorDark: string;
  minXp: number;
  nextMinXp: number | null;
  progress: number;
};

// The four lowest tiers have their own artwork (public/images/ranks/<key>.webp, transparent, square).
const TIER_ART = new Set<RankTier['key']>(['bronze', 'silver', 'gold', 'platinum']);

/** Rank badge: the tier's artwork for bronze to platinum, a gem-shaped badge (gradient colors only) for the higher tiers. */
export function RankBadge({ tier, size = 28, showName = true, showIcon = true }: { tier: RankTier; size?: number; showName?: boolean; showIcon?: boolean }) {
  const { lang } = useLanguage();
  const gradId = useId();
  const name = pickText(lang, tier.name, tier.nameAr);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {!showIcon ? null : TIER_ART.has(tier.key) ? (
        <img src={`/images/ranks/${tier.key}.webp`} width={size} height={size} alt="" decoding="async" style={{ flexShrink: 0 }} />
      ) : (
        <svg width={size} height={size} viewBox="0 0 40 40" style={{ flexShrink: 0 }} aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={tier.color} />
              <stop offset="100%" stopColor={tier.colorDark} />
            </linearGradient>
          </defs>
          <path d="M20,2 L36,11 V29 L20,38 L4,29 V11 Z" fill={`url(#${gradId})`} stroke={tier.colorDark} strokeWidth="1.5" />
          <path d="M20,3.5 L33,11 L20,18.5 L7,11 Z" fill="#ffffff" opacity="0.3" />
          <circle cx="20" cy="22" r="6" fill="#ffffff" opacity="0.92" />
          <circle cx="20" cy="22" r="6" fill="none" stroke={tier.colorDark} strokeWidth="1" opacity="0.4" />
        </svg>
      )}
      {showName && (
        <span style={{ fontWeight: 800, fontSize: Math.max(11, Math.round(size * 0.4)), color: `color-mix(in srgb, ${tier.colorDark} 45%, var(--ink))` }}>{name}</span>
      )}
    </span>
  );
}
