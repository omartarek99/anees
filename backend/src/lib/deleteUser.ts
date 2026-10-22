import { db } from '../db/db.js';
import { supabaseAdmin } from './supabase.js';
import { decrypt, hashForLookup } from './encryption.js';

import { getFirebaseAdminAuth } from './firebaseAdmin.js';
import { deleteAvatarPhotoIfAny } from './avatarPhoto.js';
import { deleteCertificateImageIfAny } from './certificateImage.js';
import { deleteReelVideoIfAny } from './reelVideo.js';

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

/** Fully deletes a user: their Supabase-stored files (ID document, profile photo, certificate images, lesson
 * videos), the lessons and announcements they authored, the local DB row, and their Firebase Auth account. Used by both the admin panel's delete action and the
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

  // The photo, certificate images and lesson videos sit in a public bucket, and an authored reel or post would
  // otherwise stay live with nobody left to take it down (the admin tools only reach reels with an author).
  await deleteAvatarPhotoIfAny(user.avatar_url);
  for (const c of db.prepare(`SELECT image_url FROM certificates WHERE user_id = ?`).all(user.id) as { image_url: string | null }[]) {
    await deleteCertificateImageIfAny(c.image_url);
  }
  for (const r of db.prepare(`SELECT video_url FROM reels WHERE author_user_id = ?`).all(user.id) as { video_url: string | null }[]) {
    await deleteReelVideoIfAny(r.video_url);
  }
  // reel_questions and reel_watch_progress cascade on reels(id) -- see schema.sql.
  db.prepare(`DELETE FROM reels WHERE author_user_id = ?`).run(user.id);
  db.prepare(`DELETE FROM news_posts WHERE author_user_id = ?`).run(user.id);

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
