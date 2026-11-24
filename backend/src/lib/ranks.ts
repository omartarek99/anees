import { RANK_START_XP } from './levels.js';

type RankTierKey = 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'warrior' | 'champion';

type RankTierDef = {
  key: string;
  name: string;
  nameAr: string;
  color: string;
  colorDark: string;
  /** how many divisions the tier has (Iron to Platinum: 1, 2, 3; Diamond, Warrior and Champion: one) */
  divisions: 1 | 3;
  /** points each of its divisions is wide (students: wider every tier; teachers: TEACHER_POINTS_PER_DIVISION) */
  width?: number;
};

// Ordered low to high. total_xp (boosted by quizzes, bosses, worksheets, and reel watch time) determines a student's persistent rank,
// shown on the leaderboard and profile, and it is the same ladder as the points bar on the profile (frontend lib/medalLevels.ts) and
// the tier certificates (lib/rankCertificates.ts). The divisions are laid out from level 10's points (lib/levels.ts RANK_START_XP), and
// Iron 1 is everyone's first rank: it covers 0 points up to Iron 2. Eighteen divisions -- Iron 1-3, Bronze 1-3, Silver 1-3, Gold 1-3, Platinum 1-3, Diamond, Warrior, Champion -- and each tier's
// divisions are wider than the one below (300 points an Iron division up to 1600 for Warrior), so the higher ranks take real work:
// Champion is about 10,750 points past level 10. The questions get harder on the way up too (see difficultyTierFor).
const RANK_TIERS: (RankTierDef & { key: RankTierKey })[] = [
  { key: 'iron', name: 'Iron', nameAr: 'حديدي', color: '#9aa3b0', colorDark: '#5f6875', divisions: 3, width: 300 },
  { key: 'bronze', name: 'Bronze', nameAr: 'برونزي', color: '#c88355', colorDark: '#8a5a35', divisions: 3, width: 400 },
  { key: 'silver', name: 'Silver', nameAr: 'فضي', color: '#c8ccd4', colorDark: '#8b9099', divisions: 3, width: 500 },
  { key: 'gold', name: 'Gold', nameAr: 'ذهبي', color: '#f0c96a', colorDark: '#c9971f', divisions: 3, width: 650 },
  { key: 'platinum', name: 'Platinum', nameAr: 'بلاتيني', color: '#7fd6d0', colorDark: '#2f8f8b', divisions: 3, width: 800 },
  { key: 'diamond', name: 'Diamond', nameAr: 'ألماسي', color: '#6ec6ff', colorDark: '#2a77c9', divisions: 1, width: 1200 },
  { key: 'warrior', name: 'Warrior', nameAr: 'محارب', color: '#ee6a5a', colorDark: '#a02a22', divisions: 1, width: 1600 },
  { key: 'champion', name: 'Champion', nameAr: 'بطل', color: '#b97bf2', colorDark: '#6a2fb0', divisions: 1, width: 2000 },
];

/**
 * Teachers climb their own ladder, named for the job rather than for metals: Teacher, Guide, Specialist, Expert, Professor,
 * Consultant (معلّم، مُرشد، أخصائي، خبير، أستاذ بروفسيور، استشاري) -- 16 divisions, the first five tiers in three, so every rank but the last is 300 teacher points wide. The keys are also the
 * file names of the badges (public/images/ranks/<key>.webp). Mirrored by TEACHER_RANK_LADDER in the frontend's lib/medalLevels.ts.
 */
const TEACHER_RANK_TIERS: RankTierDef[] = [
  { key: 'teacher_teacher', name: 'Teacher', nameAr: 'معلّم', color: '#3f9a63', colorDark: '#1f5a35', divisions: 3 },
  { key: 'teacher_guide', name: 'Guide', nameAr: 'مُرشد', color: '#5fb0ad', colorDark: '#2a6f6c', divisions: 3 },
  { key: 'teacher_specialist', name: 'Specialist', nameAr: 'أخصائي', color: '#9a6fd0', colorDark: '#5a3a8a', divisions: 3 },
  { key: 'teacher_expert', name: 'Expert', nameAr: 'خبير', color: '#e0b04a', colorDark: '#a8741a', divisions: 3 },
  { key: 'teacher_professor', name: 'Professor', nameAr: 'أستاذ بروفسيور', color: '#4a6fcf', colorDark: '#1f3a85', divisions: 3 },
  { key: 'teacher_consultant', name: 'Consultant', nameAr: 'استشاري', color: '#e6d9a8', colorDark: '#a89050', divisions: 1 },
];

type Division = { tier: RankTierDef; division: number | null; start: number };

/** A ladder's divisions, lowest first, each with the points it starts at. */
function expandDivisions(tiers: RankTierDef[], per: number, from = 0): Division[] {
  let at = from;
  return tiers.flatMap((tier) =>
    Array.from({ length: tier.divisions }, (_, i) => {
      const d = { tier, division: tier.divisions > 1 ? i + 1 : null, start: at };
      at += tier.width ?? per;
      return d;
    })
  );
}

/** Points one teacher division is wide (teacher points: a lesson posted is 20, a like 2 and a worksheet a student solved 5 -- lib/xp.ts). */
const TEACHER_POINTS_PER_DIVISION = 100;

/** Every student division, lowest first: 18 of them. `division` is 1-3, or null for the single-division tiers. */
const DIVISIONS = expandDivisions(RANK_TIERS, 0, RANK_START_XP);
DIVISIONS[0].start = 0; // Iron 1 is every student's default rank: it covers 0 points up to Iron 2 (the later ranks keep their old thresholds)
export const DIVISION_COUNT = DIVISIONS.length;
const TEACHER_DIVISIONS = expandDivisions(TEACHER_RANK_TIERS, TEACHER_POINTS_PER_DIVISION);

function ladderFor(points: number, divisions: Division[]) {
  let index = 0;
  while (index < divisions.length - 1 && points >= divisions[index + 1].start) index++;
  const { tier, division, start } = divisions[index];
  const nextMinXp = divisions[index + 1]?.start ?? null;
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
    minXp: start,
    nextMinXp,
    progress: nextMinXp === null ? 1 : Math.min(1, Math.max(0, (points - start) / (nextMinXp - start))),
  };
}

/** A student's rank from their total points. Everyone starts as Iron 1 (0 points up to Iron 2); there is no unranked state. */
export function getRankTier(totalXp: number) {
  const tier = ladderFor(totalXp, DIVISIONS);
  return { ...tier, key: tier.key as RankTierKey };
}

export function getTeacherRankTier(teacherPoints: number) {
  return ladderFor(teacherPoints, TEACHER_DIVISIONS);
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
  const from = getRankTier(DIVISIONS[Math.min(DIVISION_COUNT - 1, row.rank_drop_from)].start);
  return { from, auraBefore: earnedAuraRank(row.aura_rank, from.minXp) };
}

/** The points at which a tier's first division starts (Bronze 1 = 1710 for students: level 10's 810 plus three Iron divisions). */
export function tierStartXp(key: RankTierKey): number {
  return DIVISIONS.find((d) => d.tier.key === key)!.start;
}

/** A student's question difficulty, 1-10, from their division: Iron 1 is tier 1, Champion is tier 10, steadily in between. */
export function difficultyTierFor(totalXp: number): number {
  return 1 + Math.floor((getRankTier(totalXp).index * 9) / (DIVISION_COUNT - 1));
}

/** Where each division of a ladder starts, lowest first: sent with a profile so the app's rank bar (MedalLevelBar) has no copy of these numbers. */
export const ladderStarts = (teacher: boolean) => (teacher ? TEACHER_DIVISIONS : DIVISIONS).map((d, i) => (i === 0 ? 0 : d.start)); // the first rank covers 0 points up
