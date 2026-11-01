import { api, ApiError } from './api';

/** The most the server accepts for one lesson video (backend/src/routes/teacherReels.ts). */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

type Sent = { status: number; body: string };

/** One request with upload progress (fetch can't report it). Network failures reject with the plain "couldn't upload" message. */
function send(method: string, url: string, headers: Record<string, string>, body: XMLHttpRequestBodyInit, onProgress: (fraction: number) => void, withCredentials: boolean): Promise<Sent> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = withCredentials;
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    // no answer at all: no connection, or the storage's CORS rule does not allow this site (the browser then hides the reason)
    xhr.onerror = () => reject(new ApiError("We couldn't reach the video storage. Please check your internet connection and try again.", 0));
    xhr.onabort = () => reject(new ApiError("We couldn't reach the video storage. Please check your internet connection and try again.", 0));
    xhr.send(body);
  });
}

function errorOf(sent: Sent): ApiError {
  let message = `Request failed (${sent.status})`;
  try {
    const data = JSON.parse(sent.body);
    if (data && typeof data.error === 'string') message = data.error;
  } catch {
    /* not JSON */
  }
  return new ApiError(message, sent.status);
}

/**
 * Uploads a lesson's video. Normally: a one-time link from the server, the file sent straight to cloud storage (Cloudflare R2, or Supabase), then the
 * server checks what was stored and attaches it -- the video is ready when this resolves. Only when the server says the file is too big for the
 * storage it uses for direct uploads (Supabase's free plan, 50MB) is the file sent to the server instead, which answers at once and compresses it in
 * the background (the lesson list then shows "processing" until it is ready) -- resolves with 'processing'.
 * `onProgress` gets 0..1 while the file is being sent; `onChecking` is called when the file is up and the server is checking it.
 */
export async function uploadLessonVideo(reelId: number, file: File, onProgress: (fraction: number) => void, onChecking: () => void): Promise<'ready' | 'processing'> {
  let link: { signedUrl: string; path: string; headers: Record<string, string> } | null = null;
  try {
    link = await api.post(`/teacher-reels/${reelId}/video/upload-url`, { contentType: file.type, size: file.size });
  } catch (err) {
    // 'use_server': too big for a direct upload to the storage in use -- send it to the server instead (below)
    if (!(err instanceof ApiError && (err.body as { code?: string } | null)?.code === 'use_server')) throw err;
  }
  if (link) {
    const sent = await send('PUT', link.signedUrl, link.headers, file, onProgress, false);
    if (sent.status < 200 || sent.status >= 300) {
      console.error('Video storage refused the upload:', sent.status, sent.body.slice(0, 300));
      throw new ApiError('The video storage refused the upload. Please try again, and tell the Anees team if it keeps happening.', sent.status);
    }
    onChecking();
    await api.post(`/teacher-reels/${reelId}/video/complete`, { path: link.path });
    return 'ready';
  }
  const form = new FormData();
  form.append('video', file);
  const sent = await send('POST', `/api/teacher-reels/${reelId}/video`, { 'X-Requested-With': 'anees' }, form, onProgress, true);
  if (sent.status < 200 || sent.status >= 300) throw errorOf(sent);
  return 'processing';
}
