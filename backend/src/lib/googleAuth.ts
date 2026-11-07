import { db } from '../db/db.js';
import { firebaseLookup } from './firebase.js';
import { encrypt, hashForLookup } from './encryption.js';
import { moderateText } from './moderation.js';

// Sign up / sign in with Google. The browser signs in with Google through Firebase (a popup) and sends us the Firebase ID token; the token is checked
// with Firebase (accounts:lookup), which also tells us that the email is verified and that it came from Google. A new person gets an account with
// only the basics -- no username to pick, no password -- and is held on the "complete your profile" step (users.profile_complete = 0) until they
// have given their name, school and grade (a student) or their name, school, subject and ID (a teacher): routes/auth.ts POST /complete-profile,
// and the gate in middleware/auth.ts.

export type GoogleIdentity = { email: string; uid: string; name: string };

export async function verifyGoogleToken(idToken: string): Promise<{ ok: true; identity: GoogleIdentity } | { ok: false; error: string }> {
  const r = await firebaseLookup(idToken);
  if (!r.ok) return { ok: false, error: r.error };
  const u = r.data.users?.[0];
  if (!u?.email) return { ok: false, error: 'NO_EMAIL' };
  if (!u.emailVerified) return { ok: false, error: 'EMAIL_NOT_VERIFIED' };
  // A Firebase email/password account has a token that looks the same: only a Google one counts here.
  if (!u.providerUserInfo?.some((p) => p.providerId === 'google.com')) return { ok: false, error: 'NOT_GOOGLE' };
  return { ok: true, identity: { email: u.email.trim().toLowerCase(), uid: u.localId, name: (u.displayName ?? '').trim() } };
}

/** The account this Google identity belongs to: by its Firebase user id, else by its email (someone who signed up with that email before). */
export function findGoogleUser(identity: GoogleIdentity): any | undefined {
  return (
    (db.prepare(`SELECT * FROM users WHERE firebase_uid = ?`).get(identity.uid) as any) ??
    (db.prepare(`SELECT * FROM users WHERE email_hash = ?`).get(hashForLookup(identity.email)) as any)
  );
}

function freeUsername(email: string): string {
  const local = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
  const base = (local.length >= 3 ? local : `user${local}`).slice(0, 14);
  for (let i = 0; i < 25; i++) {
    const candidate = `${base}${String(Math.floor(1000 + Math.random() * 9000))}`;
    if (!moderateText(candidate).allowed) continue;
    if (!db.prepare(`SELECT 1 FROM users WHERE lower(username) = lower(?)`).get(candidate)) return candidate;
  }
  return `user${Date.now().toString(36)}`.slice(0, 20);
}

/** Makes the account for a first-time Google sign-up: just the basics, held on the profile step. Returns the user id. */
export function createGoogleUser(identity: GoogleIdentity, role: 'student' | 'teacher'): number {
  const username = freeUsername(identity.email);
  const name = identity.name.slice(0, 40);
  const displayName = name.length >= 2 && moderateText(name).allowed ? name : username;
  const userId = Number(
    db
      .prepare(
        `INSERT INTO users (username, email, email_hash, password_hash, display_name, avatar_key, total_xp, role, grade, firebase_uid, school_name, teacher_subject, email_verified, profile_complete)
         VALUES (?,?,?,?,?,?,0,?,NULL,?,NULL,NULL,1,0)`
      )
      .run(username, encrypt(identity.email), hashForLookup(identity.email), '', displayName, role === 'teacher' ? 'anonymous' : 'owl', role, identity.uid)
      .lastInsertRowid
  );
  // like every new account: map level 1 is unlocked
  db.prepare(`INSERT INTO user_level_progress (user_id, map_level_id, status) SELECT ?, id, 'available' FROM map_levels WHERE level_number = 1`).run(userId);
  return userId;
}
