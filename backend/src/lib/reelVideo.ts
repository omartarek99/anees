import { supabaseAdmin } from './supabase.js';
import { r2Delete, r2KeyFromUrl } from './r2.js';

export const VIDEO_BUCKET = 'videos';
export const VIDEO_PATH_PREFIX = 'teacher-reels/';

/** Removes a teacher-uploaded reel's video from storage, if it has one: from Cloudflare R2 when that is where it lives (see lib/r2.ts), otherwise from
 * Supabase Storage. Shared by the teacher reel routes (replacing/deleting their own reel) and the admin routes (moderating any teacher's reel). */
export async function deleteReelVideoIfAny(videoUrl: string | null) {
  if (!videoUrl) return;
  const r2Key = r2KeyFromUrl(videoUrl);
  if (r2Key) {
    await r2Delete(r2Key).catch((err) => console.error('R2 delete failed:', err instanceof Error ? err.message : err));
    return;
  }
  if (!supabaseAdmin) return;
  const marker = `/${VIDEO_BUCKET}/${VIDEO_PATH_PREFIX}`;
  const idx = videoUrl.indexOf(marker);
  if (idx === -1) return;
  const path = videoUrl.slice(idx + `/${VIDEO_BUCKET}/`.length);
  await supabaseAdmin.storage.from(VIDEO_BUCKET).remove([path]);
}
