import { useId } from 'react';
import { useLanguage } from '../lib/language-context';
import { pickText } from '../lib/i18n';

export type RankTier = {
  key: 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'warrior' | 'champion';
  /** the name already carries the division: "Silver 2" */
  name: string;
  nameAr: string;
  color: string;
  colorDark: string;
  minXp: number;
  nextMinXp: number | null;
  progress: number;
  /** 1-3, or null for the single-division tiers (Diamond, Warrior, Champion) */
  division: number | null;
};

// Iron to Platinum have their own artwork (public/images/ranks/<key>.webp, transparent, square).
const TIER_ART = new Set<RankTier['key']>(['iron', 'bronze', 'silver', 'gold', 'platinum']);

/** Rank badge: the tier's artwork for Iron to Platinum, a gem-shaped badge (gradient colors only) for the higher tiers, and a small chip
 *  with the division number (1-3) on the corner of every badge big enough to carry one. */
export function RankBadge({ tier, size = 28, showName = true, showIcon = true }: { tier: RankTier; size?: number; showName?: boolean; showIcon?: boolean }) {
  const { lang } = useLanguage();
  const gradId = useId();
  const name = pickText(lang, tier.name, tier.nameAr);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {!showIcon ? null : TIER_ART.has(tier.key) ? (
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          <img src={`/images/ranks/${tier.key}.webp?v=3`} width={size} height={size} alt="" decoding="async" />
          {tier.division && size >= 24 && <DivisionChip tier={tier} size={size} />}
        </span>
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

function DivisionChip({ tier, size }: { tier: RankTier; size: number }) {
  const d = Math.max(12, Math.round(size * 0.36));
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        insetInlineEnd: -Math.round(d * 0.2),
        insetBlockEnd: -Math.round(d * 0.1),
        width: d,
        height: d,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: tier.colorDark,
        color: '#fff',
        fontSize: Math.round(d * 0.66),
        fontWeight: 900,
        lineHeight: 1,
        boxShadow: '0 0 0 1.5px #fff',
      }}
    >
      {tier.division}
    </span>
  );
}
