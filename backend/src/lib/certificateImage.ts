import { supabaseAdmin } from './supabase.js';

// Reuses the existing public `videos` bucket under its own prefix, same as avatar photos
// and teacher reel videos do -- avoids requiring a brand-new Supabase bucket just for this.
export const CERTIFICATE_IMAGE_BUCKET = 'videos';
export const CERTIFICATE_IMAGE_PATH_PREFIX = 'certificates/';

/** Removes a previously-uploaded certificate image from Supabase Storage, if any -- called
 * when an admin revokes a certificate (routes/admin.ts DELETE /certificates/:id). */
export async function deleteCertificateImageIfAny(imageUrl: string | null) {
  if (!supabaseAdmin || !imageUrl) return;
  const marker = `/${CERTIFICATE_IMAGE_BUCKET}/${CERTIFICATE_IMAGE_PATH_PREFIX}`;
  const idx = imageUrl.indexOf(marker);
  if (idx === -1) return;
  const path = imageUrl.slice(idx + `/${CERTIFICATE_IMAGE_BUCKET}/`.length);
  await supabaseAdmin.storage.from(CERTIFICATE_IMAGE_BUCKET).remove([path]);
}
