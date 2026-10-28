import { db } from '../db/db.js';
import { RANK_TIERS } from './ranks.js';

// A student who reaches the Bronze, Silver or Gold rank (by total XP, see lib/ranks.ts) is sent that rank's certificate on the spot:
// the plaque of the tier, shown to them as the award popup the next time the app loads (routes/certificates.ts /unseen). Sent once per
// tier -- an automatic one has no issuing admin (issued_by IS NULL), which is what tells it apart from one an admin sent by hand.
// Called after every XP award (lib/xp.ts awardXp), so a student who is already past a tier gets the earlier ones too, oldest first.

const CERTIFICATE_TIERS = ['bronze', 'silver', 'gold'] as const;
type CertificateTier = (typeof CERTIFICATE_TIERS)[number];

// The tier plaque pictures are shipped with the website (frontend/public/images/certificates); the silver one is the grey plaque.
export const PLAQUE_PATH: Record<CertificateTier | 'platinum', string> = {
  bronze: '/images/certificates/bronze.webp',
  silver: '/images/certificates/platinum.webp',
  gold: '/images/certificates/gold.webp',
  platinum: '/images/certificates/platinum.webp',
};

const TITLES: Record<CertificateTier, string> = {
  bronze: 'الفئة البرونزية · Bronze Rank',
  silver: 'الفئة الفضية · Silver Rank',
  gold: 'الفئة الذهبية · Gold Rank',
};

export function grantRankCertificates(userId: number) {
  const user = db.prepare(`SELECT role, total_xp FROM users WHERE id = ?`).get(userId) as { role: string; total_xp: number } | undefined;
  // Students only, and only once they have earned something (every account starts at Bronze with 0 XP).
  if (!user || user.role !== 'student' || user.total_xp <= 0) return;
  const ladder = RANK_TIERS.map((t) => t.key as string);
  const reached = ladder.indexOf(RANK_TIERS.filter((t) => user.total_xp >= t.minXp).pop()!.key);
  const have = db.prepare(`SELECT 1 FROM certificates WHERE user_id = ? AND type = ? AND issued_by IS NULL`);
  const add = db.prepare(`INSERT INTO certificates (user_id, title, type, image_url) VALUES (?,?,?,?)`);
  for (const tier of CERTIFICATE_TIERS) {
    if (ladder.indexOf(tier) > reached || have.get(userId, tier)) continue;
    add.run(userId, TITLES[tier], tier, PLAQUE_PATH[tier]);
  }
}
