export type RankTierKey = 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'warrior' | 'champion';

type RankTierDef = {
  key: string;
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
export const RANK_TIERS: (RankTierDef & { key: RankTierKey })[] = [
  { key: 'iron', name: 'Iron', nameAr: 'حديدي', color: '#9aa3b0', colorDark: '#5f6875', divisions: 3 },
  { key: 'bronze', name: 'Bronze', nameAr: 'برونزي', color: '#c88355', colorDark: '#8a5a35', divisions: 3 },
  { key: 'silver', name: 'Silver', nameAr: 'فضي', color: '#c8ccd4', colorDark: '#8b9099', divisions: 3 },
  { key: 'gold', name: 'Gold', nameAr: 'ذهبي', color: '#f0c96a', colorDark: '#c9971f', divisions: 3 },
  { key: 'platinum', name: 'Platinum', nameAr: 'بلاتيني', color: '#7fd6d0', colorDark: '#2f8f8b', divisions: 3 },
  { key: 'diamond', name: 'Diamond', nameAr: 'ألماسي', color: '#6ec6ff', colorDark: '#2a77c9', divisions: 1 },
  { key: 'warrior', name: 'Warrior', nameAr: 'محارب', color: '#ee6a5a', colorDark: '#a02a22', divisions: 1 },
  { key: 'champion', name: 'Champion', nameAr: 'بطل', color: '#b97bf2', colorDark: '#6a2fb0', divisions: 1 },
];

/**
 * Teachers climb their own ladder, named for the job rather than for metals: Teacher, Guide, Specialist, Expert, Professor,
 * Consultant (معلّم، مُرشد، أخصائي، خبير، أستاذ بروفسيور، استشاري) -- 16 divisions, the first five tiers in three, so every rank but the last is 300 teacher points wide. The keys are also the
 * file names of the badges (public/images/ranks/<key>.webp). Mirrored by TEACHER_RANK_LADDER in the frontend's lib/medalLevels.ts.
 */
export const TEACHER_RANK_TIERS: RankTierDef[] = [
  { key: 'teacher_teacher', name: 'Teacher', nameAr: 'معلّم', color: '#3f9a63', colorDark: '#1f5a35', divisions: 3 },
  { key: 'teacher_guide', name: 'Guide', nameAr: 'مُرشد', color: '#5fb0ad', colorDark: '#2a6f6c', divisions: 3 },
  { key: 'teacher_specialist', name: 'Specialist', nameAr: 'أخصائي', color: '#9a6fd0', colorDark: '#5a3a8a', divisions: 3 },
  { key: 'teacher_expert', name: 'Expert', nameAr: 'خبير', color: '#e0b04a', colorDark: '#a8741a', divisions: 3 },
  { key: 'teacher_professor', name: 'Professor', nameAr: 'أستاذ بروفسيور', color: '#4a6fcf', colorDark: '#1f3a85', divisions: 3 },
  { key: 'teacher_consultant', name: 'Consultant', nameAr: 'استشاري', color: '#e6d9a8', colorDark: '#a89050', divisions: 1 },
];

const expandDivisions = (tiers: RankTierDef[]) =>
  tiers.flatMap((tier) => Array.from({ length: tier.divisions }, (_, i) => ({ tier, division: tier.divisions > 1 ? i + 1 : null })));

/** Every division, lowest first: 18 of them. `division` is 1-3, or null for the single-division tiers. */
const DIVISIONS = expandDivisions(RANK_TIERS);
export const DIVISION_COUNT = DIVISIONS.length;
const TEACHER_DIVISIONS = expandDivisions(TEACHER_RANK_TIERS);

/** Points one division is wide, for students (total XP) and for teachers (teacher points, a smaller scale: they earn 10-30 at a time). */
export const POINTS_PER_DIVISION = 250;
export const TEACHER_POINTS_PER_DIVISION = 100;

function ladderFor(points: number, per: number, divisions: { tier: RankTierDef; division: number | null }[] = DIVISIONS) {
  const last = divisions.length - 1;
  const index = Math.min(last, Math.max(0, Math.floor(points / per)));
  const { tier, division } = divisions[index];
  const minXp = index * per;
  const nextMinXp = index < last ? (index + 1) * per : null;
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
  const tier = ladderFor(totalXp, POINTS_PER_DIVISION);
  return { ...tier, key: tier.key as RankTierKey };
}

export function getTeacherRankTier(teacherPoints: number) {
  return ladderFor(teacherPoints, TEACHER_POINTS_PER_DIVISION, TEACHER_DIVISIONS);
}

export const RANK_KEYS = RANK_TIERS.map((t) => t.key) as [RankTierKey, ...RankTierKey[]];

/**
 * The page colour a student picked, if it is still theirs: 'normal' (the site's own colours), their own tier or one below it
 * (null: follow their rank -- the site's own colours while they are still Iron, then each new rank's colour as they reach it).
 */
export function earnedAuraRank(picked: string | null | undefined, totalXp: number): RankTierKey | 'normal' | null {
  if (picked === 'normal') return 'normal';
  const i = RANK_KEYS.indexOf(picked as RankTierKey);
  return i >= 0 && i <= RANK_KEYS.indexOf(getRankTier(totalXp).key) ? RANK_KEYS[i] : null;
}

/**
 * The pending "your rank dropped" pop-up of a student (users.rank_drop_from, set by lib/xp.ts noteRankDrop): the division they fell from and the page
 * colour they had picked there, so the client can show which perks changed. Null when there is nothing to show -- or when they have climbed back.
 */
export function rankDropOf(row: { total_xp: number; rank_drop_from?: number | null; aura_rank?: string | null }) {
  if (row.rank_drop_from == null || getRankTier(row.total_xp).index >= row.rank_drop_from) return null;
  const from = getRankTier(row.rank_drop_from * POINTS_PER_DIVISION);
  return { from, auraBefore: earnedAuraRank(row.aura_rank, from.minXp) };
}

/** The points at which a tier's first division starts (Bronze 1 = 750 for students). */
export function tierStartXp(key: RankTierKey, per = POINTS_PER_DIVISION): number {
  return DIVISIONS.findIndex((d) => d.tier.key === key) * per;
}

/** A student's question difficulty, 1-10, from their division: Iron 1 is tier 1, Champion is tier 10, steadily in between. */
export function difficultyTierFor(totalXp: number): number {
  return 1 + Math.floor((getRankTier(totalXp).index * 9) / (DIVISION_COUNT - 1));
}
