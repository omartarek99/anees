// The rank ladder shown as a bar on a student's profile: Iron 1-3, Bronze 1-3, Silver 1-3, Gold 1-3, Platinum 1-3, Diamond, Warrior,
// Champion -- eighteen divisions, each the same number of points wide. Mirrors backend/src/lib/ranks.ts (the server decides the rank
// everywhere else; keep the two in step). The Bronze, Silver and Gold tiers start where the tier certificates are sent
// (backend/src/lib/rankCertificates.ts).

export const POINTS_PER_DIVISION = 250;

export type RankKey = 'iron' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'warrior' | 'champion';

export const RANK_LADDER: { key: RankKey; name: string; nameAr: string; color: string; colorDark: string; divisions: 1 | 3 }[] = [
  { key: 'iron', name: 'Iron', nameAr: 'حديدي', color: '#9aa3b0', colorDark: '#5f6875', divisions: 3 },
  { key: 'bronze', name: 'Bronze', nameAr: 'برونزي', color: '#c88355', colorDark: '#8a5a35', divisions: 3 },
  { key: 'silver', name: 'Silver', nameAr: 'فضي', color: '#c8ccd4', colorDark: '#8b9099', divisions: 3 },
  { key: 'gold', name: 'Gold', nameAr: 'ذهبي', color: '#f0c96a', colorDark: '#c9971f', divisions: 3 },
  { key: 'platinum', name: 'Platinum', nameAr: 'بلاتيني', color: '#7fd6d0', colorDark: '#2f8f8b', divisions: 3 },
  { key: 'diamond', name: 'Diamond', nameAr: 'ألماسي', color: '#6ec6ff', colorDark: '#2a77c9', divisions: 1 },
  { key: 'warrior', name: 'Warrior', nameAr: 'محارب', color: '#ee6a5a', colorDark: '#a02a22', divisions: 1 },
  { key: 'champion', name: 'Champion', nameAr: 'بطل', color: '#b97bf2', colorDark: '#6a2fb0', divisions: 1 },
];

type LadderTier = { key: string; name: string; nameAr: string; color: string; colorDark: string; divisions: 1 | 3 };

/** A ladder of tiers whose divisions are all `per` points wide: its divisions (lowest first), and where a given number of points puts someone. */
export function makeLadder<T extends LadderTier>(tiers: T[], per: number) {
  /** Every division, lowest first: its tier, its number 1-3 (null for the single-division tiers) and where it starts. */
  const divisions = tiers
    .flatMap((tier) => Array.from({ length: tier.divisions }, (_, i) => ({ tier, division: tier.divisions > 1 ? i + 1 : null })))
    .map((d, index) => ({ ...d, index, start: index * per }));
  /** The points at which each tier of the ladder starts (the number shown under its logo). */
  const tierStart = tiers.map((t) => divisions.find((d) => d.tier.key === t.key)!.start);

  /** Where the points put someone: the division they are in, the next one (null at the top) and how far through this one they are, 0..1. */
  function standingFor(points: number) {
    const p = Math.max(0, points);
    const current = divisions[Math.min(divisions.length - 1, Math.floor(p / per))];
    const next = divisions[current.index + 1] ?? null;
    return { current, next, progress: next ? (p - current.start) / per : 1 };
  }

  /**
   * How far along the line of rank logos someone is, 0..1. The logos are evenly spaced, so the line reaches a logo when they reach that
   * tier, and sits between two logos while they are between those two tiers (in proportion to their points).
   */
  function lineFraction(points: number): number {
    const p = Math.max(0, points);
    const n = tiers.length;
    let i = n - 1;
    while (i > 0 && p < tierStart[i]) i--;
    const end = i < n - 1 ? tierStart[i + 1] : tierStart[n - 1] + per;
    const within = Math.min(1, (p - tierStart[i]) / (end - tierStart[i]));
    return Math.min(1, (i + within) / (n - 1));
  }

  return { tiers, per, divisions, tierStart, standingFor, lineFraction };
}

export const STUDENT_LADDER = makeLadder(RANK_LADDER, POINTS_PER_DIVISION);
export const DIVISIONS = STUDENT_LADDER.divisions;
export const TIER_START = STUDENT_LADDER.tierStart;
export const standingFor = STUDENT_LADDER.standingFor;
export const lineFraction = STUDENT_LADDER.lineFraction;

export const divisionLabel = (d: { tier: { name: string; nameAr: string }; division: number | null }, lang: string) =>
  `${lang === 'ar' ? d.tier.nameAr : d.tier.name}${d.division ? ` ${d.division}` : ''}`;

/**
 * The teachers' ladder: Teacher, Guide, Specialist, Expert, Professor, Consultant, a division being 100 teacher points (300 a rank). Mirrors
 * TEACHER_RANK_TIERS in backend/src/lib/ranks.ts; the keys are also the badges' file names (public/images/ranks/<key>.webp).
 */
export const TEACHER_POINTS_PER_DIVISION = 100;
export const TEACHER_RANK_LADDER: LadderTier[] = [
  { key: 'teacher_teacher', name: 'Teacher', nameAr: 'معلّم', color: '#3f9a63', colorDark: '#1f5a35', divisions: 3 },
  { key: 'teacher_guide', name: 'Guide', nameAr: 'مُرشد', color: '#5fb0ad', colorDark: '#2a6f6c', divisions: 3 },
  { key: 'teacher_specialist', name: 'Specialist', nameAr: 'أخصائي', color: '#9a6fd0', colorDark: '#5a3a8a', divisions: 3 },
  { key: 'teacher_expert', name: 'Expert', nameAr: 'خبير', color: '#e0b04a', colorDark: '#a8741a', divisions: 3 },
  { key: 'teacher_professor', name: 'Professor', nameAr: 'أستاذ بروفسيور', color: '#4a6fcf', colorDark: '#1f3a85', divisions: 3 },
  { key: 'teacher_consultant', name: 'Consultant', nameAr: 'استشاري', color: '#e6d9a8', colorDark: '#a89050', divisions: 1 },
];
export const TEACHER_LADDER = makeLadder(TEACHER_RANK_LADDER, TEACHER_POINTS_PER_DIVISION);

/** A rank's name in the current language. With `definite`, Arabic gets "ال" (المستوى الذهبي), as after the word "level". */
export const rankName = (key: string, lang: string, definite = false) => {
  const t = RANK_LADDER.find((r) => r.key === key);
  if (!t) return key;
  return lang === 'ar' ? (definite ? 'ال' : '') + t.nameAr : t.name;
};
