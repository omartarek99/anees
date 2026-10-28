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

/** Rank badge: the tier's artwork (public/images/ranks/<key>.webp, transparent, square) and a small chip with the division number
 *  (1-3) on the corner of every badge big enough to carry one. */
export function RankBadge({ tier, size = 28, showName = true, showIcon = true }: { tier: RankTier; size?: number; showName?: boolean; showIcon?: boolean }) {
  const { lang } = useLanguage();
  const name = pickText(lang, tier.name, tier.nameAr);

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {showIcon && (
        <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
          <img src={`/images/ranks/${tier.key}.webp?v=4`} width={size} height={size} alt="" decoding="async" />
          {tier.division && size >= 24 && <DivisionChip tier={tier} size={size} />}
        </span>
      )}
      {showName && (
        <span style={{ fontWeight: 800, fontSize: Math.min(18, Math.max(11, Math.round(size * 0.4))), color: `color-mix(in srgb, ${tier.colorDark} 45%, var(--ink))` }}>{name}</span>
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
