import { db } from '../db/db.js';

// The admin's on/off switches for what students and teachers can use (routes/admin.ts /features, the "Features" page of the admin panel).
// Everything is ON until the admin switches it off for a role. The admin account itself is never switched off, so it can always switch things back.
//
//   site            the whole site for that role: they see a "closed for now" notice (with the admin's message) instead of the app
//   reels           watching the lesson videos (and their quizzes)
//   map             the adventure map                      (students)
//   craft           the Builder's Quarry game              (students)
//   challenges      "challenge your friends"               (students)
//   worksheets      worksheets: make, solve, send
//   ai_worksheets   worksheets made by the AI (from a video or a typed lesson name): they cost money per use
//   leaderboard     the ranking
//   friends         friends and friend requests
//   teacher_upload  uploading and managing lessons        (teachers)
//   signup          new accounts: students / teachers can (not) sign up, with e-mail or with Google

export type FeatureRole = 'student' | 'teacher';

export const FEATURES = [
  { key: 'site', roles: ['student', 'teacher'] },
  { key: 'reels', roles: ['student', 'teacher'] },
  { key: 'map', roles: ['student'] },
  { key: 'craft', roles: ['student'] },
  { key: 'challenges', roles: ['student'] },
  { key: 'worksheets', roles: ['student', 'teacher'] },
  { key: 'ai_worksheets', roles: ['student', 'teacher'] },
  { key: 'leaderboard', roles: ['student', 'teacher'] },
  { key: 'friends', roles: ['student', 'teacher'] },
  { key: 'teacher_upload', roles: ['teacher'] },
  { key: 'signup', roles: ['student', 'teacher'] },
] as const satisfies readonly { key: string; roles: readonly FeatureRole[] }[];

export type FeatureKey = (typeof FEATURES)[number]['key'];

type Row = { enabled: boolean; message: string | null; updatedAt: string | null; updatedBy: string | null };
const cache = new Map<string, Row>();
let loaded = false;

const slot = (key: string, role: string) => `${key}|${role}`;

function load() {
  cache.clear();
  const rows = db.prepare(`SELECT feature, role, enabled, message, updated_at, updated_by FROM feature_flags`).all() as {
    feature: string; role: string; enabled: number; message: string | null; updated_at: string; updated_by: string | null;
  }[];
  for (const r of rows) cache.set(slot(r.feature, r.role), { enabled: r.enabled === 1, message: r.message, updatedAt: r.updated_at, updatedBy: r.updated_by });
  loaded = true;
}

export function featureApplies(key: string, role: string): boolean {
  const f = FEATURES.find((x) => x.key === key);
  return !!f && (f.roles as readonly string[]).includes(role);
}

/** Is this feature on for this kind of account? An admin, or a role the feature does not concern, always gets true. */
export function isFeatureOn(key: FeatureKey, role: string | undefined | null): boolean {
  if (role !== 'student' && role !== 'teacher') return true;
  if (!featureApplies(key, role)) return true;
  if (!loaded) load();
  return cache.get(slot(key, role))?.enabled ?? true;
}

export function featureMessage(key: FeatureKey, role: string | undefined | null): string | null {
  if (!loaded) load();
  return (role && cache.get(slot(key, role))?.message) || null;
}

export function listFeatureStates() {
  if (!loaded) load();
  return FEATURES.map((f) => ({
    key: f.key,
    roles: Object.fromEntries(
      f.roles.map((role) => {
        const r = cache.get(slot(f.key, role));
        return [role, { enabled: r?.enabled ?? true, message: r?.message ?? null, updatedAt: r?.updatedAt ?? null, updatedBy: r?.updatedBy ?? null }];
      })
    ) as Record<FeatureRole, { enabled: boolean; message: string | null; updatedAt: string | null; updatedBy: string | null }>,
  }));
}

/** What one account type can use right now: every feature that concerns it, true or false. */
export function stateFor(role: string | null) {
  const out: Record<string, boolean> = {};
  for (const f of FEATURES) if (role && (f.roles as readonly string[]).includes(role)) out[f.key] = isFeatureOn(f.key, role);
  return out;
}

export function setFeature(key: string, role: string, enabled: boolean, by: string, message?: string | null): boolean {
  if (role !== 'student' && role !== 'teacher') return false;
  if (!featureApplies(key, role)) return false;
  const msg = message === undefined ? (cache.get(slot(key, role))?.message ?? null) : (message || '').trim().slice(0, 300) || null;
  db.prepare(
    `INSERT INTO feature_flags (feature, role, enabled, message, updated_at, updated_by) VALUES (?,?,?,?,datetime('now'),?)
     ON CONFLICT(feature, role) DO UPDATE SET enabled = excluded.enabled, message = excluded.message, updated_at = excluded.updated_at, updated_by = excluded.updated_by`
  ).run(key, role, enabled ? 1 : 0, msg, by);
  load();
  console.log(`[features] ${by} switched ${key} ${enabled ? 'ON' : 'OFF'} for ${role}s`);
  return true;
}
