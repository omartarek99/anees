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

function tierFor(tiers: RankTierDef[], points: number) {
  let tier = tiers[0];
  for (const t of tiers) {
    if (points >= t.minXp) tier = t;
    else break;
  }
  const idx = tiers.indexOf(tier);
  const next = tiers[idx + 1] ?? null;
  return {
    key: tier.key,
    name: tier.name,
    nameAr: tier.nameAr,
    color: tier.color,
    colorDark: tier.colorDark,
    minXp: tier.minXp,
    nextMinXp: next?.minXp ?? null,
    progress: next ? Math.min(1, (points - tier.minXp) / (next.minXp - tier.minXp)) : 1,
  };
}

export function getRankTier(totalXp: number) {
  return tierFor(RANK_TIERS, totalXp);
}

// Same 7-tier ladder, rescaled for teacher_points -- a teacher earns points 10-30 at a
// time (see lib/xp.ts), so the student ladder's thresholds (300 XP for Silver, etc.)
// would be effectively unreachable. Same tier names/colors, smaller numbers.
export const TEACHER_RANK_TIERS: RankTierDef[] = [
  { key: 'bronze', minXp: 0, name: 'Bronze', nameAr: 'برونزي', color: '#c88355', colorDark: '#8a5a35' },
  { key: 'silver', minXp: 50, name: 'Silver', nameAr: 'فضي', color: '#c8ccd4', colorDark: '#8b9099' },
  { key: 'gold', minXp: 150, name: 'Gold', nameAr: 'ذهبي', color: '#f0c96a', colorDark: '#c9971f' },
  { key: 'platinum', minXp: 300, name: 'Platinum', nameAr: 'بلاتيني', color: '#7fd8cf', colorDark: '#379e93' },
  { key: 'diamond', minXp: 600, name: 'Diamond', nameAr: 'ماسي', color: '#7bb8f5', colorDark: '#2e6ec9' },
  { key: 'emerald', minXp: 1000, name: 'Emerald', nameAr: 'زمردي', color: '#4fd399', colorDark: '#1f9e63' },
  { key: 'master', minXp: 2000, name: 'Master', nameAr: 'أستاذ', color: '#c77df0', colorDark: '#8a2fc4' },
];

export function getTeacherRankTier(teacherPoints: number) {
  return tierFor(TEACHER_RANK_TIERS, teacherPoints);
}
