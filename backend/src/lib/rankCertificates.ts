import { db } from '../db/db.js';
import { tierStartXp } from './ranks.js';

// A student who reaches the Bronze, Silver or Gold tier (its first division: Bronze 1, Silver 1, Gold 1) -- the bar on their profile -- gets a
// congratulation popup (routes/certificates.ts /requests/unseen) telling them their shield is being prepared, and a request is filed for an admin:
// on the Certificates page of the admin view they approve it, and only then is the tier's certificate sent (issueTierCertificate below, from
// routes/admin.ts). One request per student and tier. Checked after every points change (lib/xp.ts awardXp and the admin points edit), so a
// student who is already past a tier is asked about the earlier ones too -- unless they already hold a certificate of that tier.

// The tiers come from the rank ladder in lib/ranks.ts (and frontend/src/lib/medalLevels.ts mirrors it). Iron is below the first one; every tier
// above it has its own plaque.
const LEVELS = [
  { tier: 'bronze', at: tierStartXp('bronze') },
  { tier: 'silver', at: tierStartXp('silver') },
  { tier: 'gold', at: tierStartXp('gold') },
  { tier: 'platinum', at: tierStartXp('platinum') },
  { tier: 'diamond', at: tierStartXp('diamond') },
  { tier: 'warrior', at: tierStartXp('warrior') },
  { tier: 'champion', at: tierStartXp('champion') },
] as const;
export type CertificateTier = (typeof LEVELS)[number]['tier'];

// The tier plaque pictures are shipped with the website (frontend/public/images/certificates).
export const PLAQUE_PATH: Record<CertificateTier, string> = {
  bronze: '/images/certificates/bronze.webp',
  silver: '/images/certificates/silver.webp',
  gold: '/images/certificates/gold.webp',
  platinum: '/images/certificates/platinum.webp',
  diamond: '/images/certificates/diamond.webp',
  warrior: '/images/certificates/warrior.webp',
  champion: '/images/certificates/champion.webp',
};

const TITLES: Record<CertificateTier, string> = {
  bronze: 'المستوى البرونزي · Bronze Level',
  silver: 'المستوى الفضي · Silver Level',
  gold: 'المستوى الذهبي · Gold Level',
  platinum: 'المستوى البلاتيني · Platinum Level',
  diamond: 'المستوى الألماسي · Diamond Level',
  warrior: 'مستوى المحارب · Warrior Level',
  champion: 'مستوى البطل · Champion Level',
};

export function requestRankCertificates(userId: number) {
  const user = db.prepare(`SELECT role, total_xp FROM users WHERE id = ?`).get(userId) as { role: string; total_xp: number } | undefined;
  if (!user || user.role !== 'student') return;
  const hasCertificate = db.prepare(`SELECT 1 FROM certificates WHERE user_id = ? AND type = ?`);
  // OR IGNORE: the (user, tier) pair is unique, so a request is filed once and a decided one is never reopened.
  const add = db.prepare(`INSERT OR IGNORE INTO certificate_requests (user_id, tier) VALUES (?, ?)`);
  for (const { tier, at } of LEVELS) {
    if (user.total_xp < at || hasCertificate.get(userId, tier)) continue;
    add.run(userId, tier);
  }
}

/** Sends the tier's certificate (the plaque) to the student -- called when an admin approves a request. Returns the certificate id. */
export function issueTierCertificate(userId: number, tier: CertificateTier, adminId: number): number {
  return Number(
    db
      .prepare(`INSERT INTO certificates (user_id, title, type, image_url, issued_by) VALUES (?,?,?,?,?)`)
      .run(userId, TITLES[tier], tier, PLAQUE_PATH[tier], adminId).lastInsertRowid
  );
}
