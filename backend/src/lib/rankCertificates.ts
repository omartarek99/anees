import { db } from '../db/db.js';

// A student who reaches the Bronze (200 points), Silver (1000) or Gold (2000) level -- the bar on their profile -- is sent that level's certificate on the spot:
// the plaque of the tier, shown to them as the award popup the next time the app loads (routes/certificates.ts /unseen). Sent once per
// tier -- an automatic one has no issuing admin (issued_by IS NULL), which is what tells it apart from one an admin sent by hand.
// Called after every XP award (lib/xp.ts awardXp), so a student who is already past a tier gets the earlier ones too, oldest first.

// Must match MEDAL_LEVELS in frontend/src/lib/medalLevels.ts. Everyone starts at 'normal', below the first one.
const LEVELS = [
  { tier: 'bronze', at: 200 },
  { tier: 'silver', at: 1000 },
  { tier: 'gold', at: 2000 },
] as const;
type CertificateTier = (typeof LEVELS)[number]['tier'];

// The tier plaque pictures are shipped with the website (frontend/public/images/certificates); the silver one is the grey plaque.
export const PLAQUE_PATH: Record<CertificateTier | 'platinum', string> = {
  bronze: '/images/certificates/bronze.webp',
  silver: '/images/certificates/platinum.webp',
  gold: '/images/certificates/gold.webp',
  platinum: '/images/certificates/platinum.webp',
};

const TITLES: Record<CertificateTier, string> = {
  bronze: 'المستوى البرونزي · Bronze Level',
  silver: 'المستوى الفضي · Silver Level',
  gold: 'المستوى الذهبي · Gold Level',
};

export function grantRankCertificates(userId: number) {
  const user = db.prepare(`SELECT role, total_xp FROM users WHERE id = ?`).get(userId) as { role: string; total_xp: number } | undefined;
  if (!user || user.role !== 'student') return;
  const have = db.prepare(`SELECT 1 FROM certificates WHERE user_id = ? AND type = ? AND issued_by IS NULL`);
  const add = db.prepare(`INSERT INTO certificates (user_id, title, type, image_url) VALUES (?,?,?,?)`);
  for (const { tier, at } of LEVELS) {
    if (user.total_xp < at || have.get(userId, tier)) continue;
    add.run(userId, TITLES[tier], tier, PLAQUE_PATH[tier]);
  }
}
