export type RankTierKey = 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'warrior' | 'champion';

type RankTierDef = {
  key: RankTierKey;
  name: string;
  nameAr: string;
  color: string;
  colorDark: string;
  /** how many divisions the tier has (Iron to Platinum: 1, 2, 3; Diamond, Warrior and Champion: one) */
  divisions: 1 | 3;
};

// Ordered low to high. total_xp (boosted by quizzes, bosses, worksheets, and reel watch time) determines a student's persistent rank,
// shown on the leaderboard and profile, and it is the same ladder as the points bar on the profile (frontend lib/medalLevels.ts) and
// the tier certificates (lib/rankCertificates.ts). Eighteen divisions in all -- Iron 1-3, Bronze 1-3, Silver 1-3, Gold 1-3,
// Platinum 1-3, Diamond, Warrior, Champion -- and every division is the same number of points wide, so what gets harder on the way up
// is not the points but the questions (see difficultyTierFor).
export const RANK_TIERS: RankTierDef[] = [
  { key: 'iron', name: 'Iron', nameAr: 'حديدي', color: '#9aa3b0', colorDark: '#5f6875', divisions: 3 },
  { key: 'bronze', name: 'Bronze', nameAr: 'برونزي', color: '#c88355', colorDark: '#8a5a35', divisions: 3 },
  { key: 'silver', name: 'Silver', nameAr: 'فضي', color: '#c8ccd4', colorDark: '#8b9099', divisions: 3 },
  { key: 'gold', name: 'Gold', nameAr: 'ذهبي', color: '#f0c96a', colorDark: '#c9971f', divisions: 3 },
  { key: 'platinum', name: 'Platinum', nameAr: 'بلاتيني', color: '#7fd6d0', colorDark: '#2f8f8b', divisions: 3 },
  { key: 'diamond', name: 'Diamond', nameAr: 'ألماسي', color: '#6ec6ff', colorDark: '#2a77c9', divisions: 1 },
  { key: 'warrior', name: 'Warrior', nameAr: 'محارب', color: '#ee6a5a', colorDark: '#a02a22', divisions: 1 },
  { key: 'champion', name: 'Champion', nameAr: 'بطل', color: '#b97bf2', colorDark: '#6a2fb0', divisions: 1 },
];

/** Every division, lowest first: 18 of them. `division` is 1-3, or null for the single-division tiers. */
const DIVISIONS = RANK_TIERS.flatMap((tier) => Array.from({ length: tier.divisions }, (_, i) => ({ tier, division: tier.divisions > 1 ? i + 1 : null })));
export const DIVISION_COUNT = DIVISIONS.length;

/** Points one division is wide, for students (total XP) and for teachers (teacher points, a smaller scale: they earn 10-30 at a time). */
export const POINTS_PER_DIVISION = 250;
export const TEACHER_POINTS_PER_DIVISION = 50;

function ladderFor(points: number, per: number) {
  const index = Math.min(DIVISION_COUNT - 1, Math.max(0, Math.floor(points / per)));
  const { tier, division } = DIVISIONS[index];
  const minXp = index * per;
  const nextMinXp = index < DIVISION_COUNT - 1 ? (index + 1) * per : null;
  return {
    key: tier.key,
    // "Silver 2" -- the name already carries the division, so every place that shows the rank shows it
    name: division ? `${tier.name} ${division}` : tier.name,
    nameAr: division ? `${tier.nameAr} ${division}` : tier.nameAr,
    color: tier.color,
    colorDark: tier.colorDark,
    division,
    /** 0-17: which division this is, lowest first */
    index,
    minXp,
    nextMinXp,
    progress: nextMinXp === null ? 1 : Math.min(1, (points - minXp) / per),
  };
}

export function getRankTier(totalXp: number) {
  return ladderFor(totalXp, POINTS_PER_DIVISION);
}

export function getTeacherRankTier(teacherPoints: number) {
  return ladderFor(teacherPoints, TEACHER_POINTS_PER_DIVISION);
}

export const RANK_KEYS = RANK_TIERS.map((t) => t.key) as [RankTierKey, ...RankTierKey[]];

/** The rank colour a student picked, if it is still theirs: their own tier or one below it (null: follow their current rank). */
export function earnedAuraRank(picked: string | null | undefined, totalXp: number): RankTierKey | null {
  const i = RANK_KEYS.indexOf(picked as RankTierKey);
  return i >= 0 && i <= RANK_KEYS.indexOf(getRankTier(totalXp).key) ? RANK_KEYS[i] : null;
}

/** The points at which a tier's first division starts (Bronze 1 = 750 for students). */
export function tierStartXp(key: RankTierKey, per = POINTS_PER_DIVISION): number {
  return DIVISIONS.findIndex((d) => d.tier.key === key) * per;
}

/** A student's question difficulty, 1-10, from their division: Iron 1 is tier 1, Champion is tier 10, steadily in between. */
export function difficultyTierFor(totalXp: number): number {
  return 1 + Math.floor((getRankTier(totalXp).index * 9) / (DIVISION_COUNT - 1));
}
