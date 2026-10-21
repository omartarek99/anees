import { db } from '../db/db.js';
import { supabaseAdmin } from './supabase.js';
import { decrypt, hashForLookup } from './encryption.js';

import { getFirebaseAdminAuth } from './firebaseAdmin.js';

export type DeleteUserResult =
  | { found: false }
  | { found: true; username: string; storage?: string; firebase: string };

// Lazily imported only when actually deleting a user that has a firebase_uid -- the main
// server has no other reason to need firebase-admin's service-account credentials, and
// importing/initializing it eagerly at boot would make the whole app fail to start without
// a service account file that most of its features never touch.
async function deleteFirebaseUser(email: string): Promise<string> {
  const auth = await getFirebaseAdminAuth();
  if (!auth) return "skipped (no Firebase service account -- see FIREBASE_SERVICE_ACCOUNT_JSON / _PATH)";
  try {
    const firebaseUser = await auth.getUserByEmail(email);
    await auth.deleteUser(firebaseUser.uid);
    return `deleted (uid ${firebaseUser.uid})`;
  } catch (err: any) {
    if (err.code === 'auth/user-not-found') return 'no matching user';
    return `error -- ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Fully deletes a user: their Supabase-stored ID document (if any), the local DB row, and
 * their Firebase Auth account. Used by both the admin panel's delete action and the
 * `admin:delete-user` CLI script. */
async function deleteUserRow(user: any): Promise<DeleteUserResult> {
  let storage: string | undefined;
  if (user.id_document_path) {
    if (supabaseAdmin) {
      const { error } = await supabaseAdmin.storage.from('teacher-id-documents').remove([user.id_document_path]);
      storage = error ? `failed to delete (${error.message})` : `deleted ${user.id_document_path}`;
    } else {
      storage = 'skipped (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not configured)';
    }
  }

  db.prepare(`DELETE FROM users WHERE id = ?`).run(user.id);
  const firebase = await deleteFirebaseUser(decrypt(user.email));

  return { found: true, username: user.username, storage, firebase };
}

export async function deleteUserByEmail(email: string): Promise<DeleteUserResult> {
  const user = db.prepare(`SELECT * FROM users WHERE email_hash = ?`).get(hashForLookup(email)) as any;
  if (!user) return { found: false };
  return deleteUserRow(user);
}

export async function deleteUserById(id: number): Promise<DeleteUserResult> {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as any;
  if (!user) return { found: false };
  return deleteUserRow(user);
}
