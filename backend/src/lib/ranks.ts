export type RankTierKey = 'normal' | 'bronze' | 'silver' | 'gold';

type RankTierDef = {
  key: RankTierKey;
  minXp: number;
  name: string;
  nameAr: string;
  color: string;
  colorDark: string;
};

// Ordered low to high. total_xp (boosted by quizzes, bosses, worksheets, and reel watch time) determines a student's persistent rank,
// shown on the leaderboard and profile, and it is the same ladder as the points bar on the profile (frontend lib/medalLevels.ts) and
// the tier certificates (lib/rankCertificates.ts): everyone starts at Normal, Bronze from 200 points, Silver from 1000, Gold from 2000.
export const RANK_TIERS: RankTierDef[] = [
  { key: 'normal', minXp: 0, name: 'Normal', nameAr: 'عادي', color: '#9aa3b0', colorDark: '#5f6875' },
  { key: 'bronze', minXp: 200, name: 'Bronze', nameAr: 'برونزي', color: '#c88355', colorDark: '#8a5a35' },
  { key: 'silver', minXp: 1000, name: 'Silver', nameAr: 'فضي', color: '#c8ccd4', colorDark: '#8b9099' },
  { key: 'gold', minXp: 2000, name: 'Gold', nameAr: 'ذهبي', color: '#f0c96a', colorDark: '#c9971f' },
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

// Same 4-level ladder, rescaled for teacher_points -- a teacher earns points 10-30 at a
// time (see lib/xp.ts), so the student ladder's thresholds (300 XP for Silver, etc.)
// would be effectively unreachable. Same tier names/colors, smaller numbers.
const TEACHER_MIN_XP = [0, 100, 200, 400];
export const TEACHER_RANK_TIERS: RankTierDef[] = RANK_TIERS.map((t, i) => ({ ...t, minXp: TEACHER_MIN_XP[i] }));

export function getTeacherRankTier(teacherPoints: number) {
  return tierFor(TEACHER_RANK_TIERS, teacherPoints);
}
