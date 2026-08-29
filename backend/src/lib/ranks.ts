export type RankTierKey = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'emerald' | 'master';

type RankTierDef = {
  key: RankTierKey;
  minXp: number;
  name: string;
  nameAr: string;
  color: string;
  colorDark: string;
};

// Ordered low to high. total_xp (boosted by quizzes, bosses, worksheets, and reel watch time)
// determines a student's persistent rank tier, shown on the leaderboard and profile.
export const RANK_TIERS: RankTierDef[] = [
  { key: 'bronze', minXp: 0, name: 'Bronze', nameAr: 'برونزي', color: '#c88355', colorDark: '#8a5a35' },
  { key: 'silver', minXp: 300, name: 'Silver', nameAr: 'فضي', color: '#c8ccd4', colorDark: '#8b9099' },
  { key: 'gold', minXp: 900, name: 'Gold', nameAr: 'ذهبي', color: '#f0c96a', colorDark: '#c9971f' },
  { key: 'platinum', minXp: 2000, name: 'Platinum', nameAr: 'بلاتيني', color: '#7fd8cf', colorDark: '#379e93' },
  { key: 'diamond', minXp: 4000, name: 'Diamond', nameAr: 'ماسي', color: '#7bb8f5', colorDark: '#2e6ec9' },
  { key: 'emerald', minXp: 7000, name: 'Emerald', nameAr: 'زمردي', color: '#4fd399', colorDark: '#1f9e63' },
  { key: 'master', minXp: 11000, name: 'Master', nameAr: 'أستاذ', color: '#c77df0', colorDark: '#8a2fc4' },
];

export function getRankTier(totalXp: number) {
  let tier = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (totalXp >= t.minXp) tier = t;
    else break;
  }
  const idx = RANK_TIERS.indexOf(tier);
  const next = RANK_TIERS[idx + 1] ?? null;
  return {
    key: tier.key,
    name: tier.name,
    nameAr: tier.nameAr,
    color: tier.color,
    colorDark: tier.colorDark,
    minXp: tier.minXp,
    nextMinXp: next?.minXp ?? null,
    progress: next ? Math.min(1, (totalXp - tier.minXp) / (next.minXp - tier.minXp)) : 1,
  };
}
