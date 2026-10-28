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

/** Every division, lowest first (18): its tier, its number 1-3 (null for the single-division tiers) and where it starts. */
export const DIVISIONS = RANK_LADDER.flatMap((tier) => Array.from({ length: tier.divisions }, (_, i) => ({ tier, division: tier.divisions > 1 ? i + 1 : null })))
  .map((d, index) => ({ ...d, index, start: index * POINTS_PER_DIVISION }));

export const divisionLabel = (d: (typeof DIVISIONS)[number], lang: string) => `${lang === 'ar' ? d.tier.nameAr : d.tier.name}${d.division ? ` ${d.division}` : ''}`;

/** Where a student's points put them: the division they are in, the next one (null at the top) and how far through this one they are, 0..1. */
export function standingFor(points: number) {
  const p = Math.max(0, points);
  const current = DIVISIONS[Math.min(DIVISIONS.length - 1, Math.floor(p / POINTS_PER_DIVISION))];
  const next = DIVISIONS[current.index + 1] ?? null;
  return { current, next, progress: next ? (p - current.start) / POINTS_PER_DIVISION : 1 };
}
