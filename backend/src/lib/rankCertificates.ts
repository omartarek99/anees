import { db } from '../db/db.js';
import { decrypt } from './encryption.js';
import { sendCertificateEmail } from './mailer.js';
import { tierStartXp } from './ranks.js';

// A student who reaches the Bronze, Silver or Gold tier (its first division: Bronze 1, Silver 1, Gold 1) -- the bar on their profile -- is sent that
// tier's certificate on the spot, with no admin in the loop: it goes onto their profile (shown as the award popup the next time the app loads,
// routes/certificates.ts /unseen) and to their email (emailCertificate below), and they get the "you reached a level" pop-out
// (routes/certificates.ts /requests/unseen). certificate_requests is the record of that, one row per student and tier, kept for good -- so a
// certificate an admin later revokes (revokeCertificate below, routes/admin.ts) is never sent a second time. An automatic certificate has no
// issuing admin (issued_by IS NULL), which is what tells it apart from one an admin sent by hand.
// Checked after every points change (lib/xp.ts awardXp and the admin points edit), so a student who is already past a tier gets the earlier ones
// too, oldest first -- unless they already hold a certificate of that tier.

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

export function issueRankCertificates(userId: number) {
  const user = db.prepare(`SELECT role, total_xp FROM users WHERE id = ?`).get(userId) as { role: string; total_xp: number } | undefined;
  if (!user || user.role !== 'student') return;
  const hasCertificate = db.prepare(`SELECT 1 FROM certificates WHERE user_id = ? AND type = ?`);
  // OR IGNORE: the (user, tier) pair is unique, so a tier is handled once, ever -- a revoked certificate is not sent again.
  const record = db.prepare(`INSERT OR IGNORE INTO certificate_requests (user_id, tier, status, decided_at) VALUES (?, ?, 'approved', datetime('now'))`);
  for (const { tier, at } of LEVELS) {
    if (user.total_xp < at || hasCertificate.get(userId, tier)) continue;
    if (record.run(userId, tier).changes) sendTierCertificate(userId, tier);
  }
}

/** Requests that were still waiting for an admin when approval was dropped: their certificates are sent now. Safe to run on every start. */
export function issuePendingRankCertificates() {
  const pending = db.prepare(`SELECT id, user_id, tier FROM certificate_requests WHERE status = 'pending'`).all() as { id: number; user_id: number; tier: CertificateTier }[];
  for (const r of pending) {
    if (!db.prepare(`SELECT 1 FROM certificates WHERE user_id = ? AND type = ?`).get(r.user_id, r.tier)) sendTierCertificate(r.user_id, r.tier);
    db.prepare(`UPDATE certificate_requests SET status = 'approved', decided_at = datetime('now') WHERE id = ?`).run(r.id);
  }
}

function sendTierCertificate(userId: number, tier: CertificateTier) {
  const id = Number(
    db
      .prepare(`INSERT INTO certificates (user_id, title, type, image_url, issued_by) VALUES (?,?,?,?,NULL)`)
      .run(userId, TITLES[tier], tier, PLAQUE_PATH[tier]).lastInsertRowid
  );
  void emailCertificate(id);
}

/** Emails a certificate (its picture and a link to the profile) to its owner and notes it on the row. Never throws, and does nothing while
 * email is not set up (lib/mailer.ts) -- the certificate is on the profile either way. */
export async function emailCertificate(certificateId: number) {
  try {
    const row = db
      .prepare(`SELECT c.title, c.image_url, u.email, u.is_seed FROM certificates c JOIN users u ON u.id = c.user_id WHERE c.id = ? AND c.revoked_at IS NULL`)
      .get(certificateId) as { title: string; image_url: string; email: string; is_seed: number } | undefined;
    if (!row || row.is_seed) return;
    const sent = await sendCertificateEmail(decrypt(row.email), row.title, row.image_url);
    if (sent.ok) db.prepare(`UPDATE certificates SET emailed_at = datetime('now') WHERE id = ?`).run(certificateId);
  } catch (err) {
    console.error('Certificate email failed:', err instanceof Error ? err.message : err);
  }
}

/** Takes a certificate back: it leaves the owner's profile, but the row stays -- with who took it and why -- so the record is kept. */
export function revokeCertificate(id: number, adminId: number, reason: string): boolean {
  return db.prepare(`UPDATE certificates SET revoked_at = datetime('now'), revoked_by = ?, revoked_reason = ? WHERE id = ? AND revoked_at IS NULL`).run(adminId, reason, id).changes > 0;
}

/** Revokes a student's certificates for a violation (lib/violations.ts): every one ('all'), or only the rank certificates for levels their points
 * no longer reach ('unearned'). Returns how many were taken back. */
export function revokeUserCertificates(userId: number, adminId: number, reason: string, scope: 'all' | 'unearned'): number {
  const { total_xp } = db.prepare(`SELECT total_xp FROM users WHERE id = ?`).get(userId) as { total_xp: number };
  const rows = db.prepare(`SELECT id, title, type FROM certificates WHERE user_id = ? AND revoked_at IS NULL`).all(userId) as { id: number; title: string; type: CertificateTier }[];
  let revoked = 0;
  for (const c of rows) {
    // a rank certificate is the one with the tier's own title (a hand-made one has a name an admin typed)
    if (scope === 'unearned' && !(c.title === TITLES[c.type] && tierStartXp(c.type) > total_xp)) continue;
    if (revokeCertificate(c.id, adminId, reason)) revoked++;
  }
  return revoked;
}
