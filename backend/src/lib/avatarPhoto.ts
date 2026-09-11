import { supabaseAdmin } from './supabase.js';

// Reuses the existing public `videos` bucket under its own prefix, same as teacher reel
// videos do (backend/src/lib/reelVideo.ts) -- avoids requiring a brand-new Supabase
// bucket just for this.
export const AVATAR_PHOTO_BUCKET = 'videos';
export const AVATAR_PHOTO_PATH_PREFIX = 'profile-photos/';

/** Removes a user's previously-uploaded profile photo from Supabase Storage, if any. */
export async function deleteAvatarPhotoIfAny(avatarUrl: string | null) {
  if (!supabaseAdmin || !avatarUrl) return;
  const marker = `/${AVATAR_PHOTO_BUCKET}/${AVATAR_PHOTO_PATH_PREFIX}`;
  const idx = avatarUrl.indexOf(marker);
  if (idx === -1) return;
  const path = avatarUrl.slice(idx + `/${AVATAR_PHOTO_BUCKET}/`.length);
  await supabaseAdmin.storage.from(AVATAR_PHOTO_BUCKET).remove([path]);
}
