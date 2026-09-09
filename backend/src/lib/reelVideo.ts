import { supabaseAdmin } from './supabase.js';

export const VIDEO_BUCKET = 'videos';
export const VIDEO_PATH_PREFIX = 'teacher-reels/';

/** Removes a teacher-uploaded reel's video from Supabase Storage, if it has one. Shared by
 * the teacher reel routes (replacing/deleting their own reel) and the admin routes
 * (moderating any teacher's reel). */
export async function deleteReelVideoIfAny(videoUrl: string | null) {
  if (!supabaseAdmin || !videoUrl) return;
  const marker = `/${VIDEO_BUCKET}/${VIDEO_PATH_PREFIX}`;
  const idx = videoUrl.indexOf(marker);
  if (idx === -1) return;
  const path = videoUrl.slice(idx + `/${VIDEO_BUCKET}/`.length);
  await supabaseAdmin.storage.from(VIDEO_BUCKET).remove([path]);
}
