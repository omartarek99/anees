import { api, ApiError } from './api';

/** The most the server accepts for one lesson video (backend/src/routes/teacherReels.ts). */
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
/**
 * Up to this size a video goes straight to Supabase Storage (fast, nothing re-encoded); Supabase takes at most 50MB in one file on the free plan.
 * A bigger one is sent to our server, which compresses it in the background. Same number as DIRECT_VIDEO_BYTES in the backend.
 */
export const DIRECT_VIDEO_BYTES = 49 * 1024 * 1024;

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
    xhr.onerror = () => reject(new ApiError("We couldn't upload the video. Please try again.", 0));
    xhr.onabort = () => reject(new ApiError("We couldn't upload the video. Please try again.", 0));
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
 * Uploads a lesson's video. Up to DIRECT_VIDEO_BYTES: a one-time link from the server, the file sent straight to Supabase, then the server checks
 * what was stored and attaches it -- the video is ready when this resolves. Bigger: the file is sent to the server, which answers at once and
 * compresses it in the background (the lesson list then shows "processing" until it is ready) -- resolves with 'processing'.
 * `onProgress` gets 0..1 while the file is being sent; `onChecking` is called when the file is up and the server is checking it.
 */
export async function uploadLessonVideo(reelId: number, file: File, onProgress: (fraction: number) => void, onChecking: () => void): Promise<'ready' | 'processing'> {
  if (file.size <= DIRECT_VIDEO_BYTES) {
    const link = await api.post<{ signedUrl: string; path: string }>(`/teacher-reels/${reelId}/video/upload-url`, { contentType: file.type, size: file.size });
    const sent = await send('PUT', link.signedUrl, { 'Content-Type': file.type, 'x-upsert': 'false' }, file, onProgress, false);
    if (sent.status < 200 || sent.status >= 300) throw new ApiError("We couldn't upload the video. Please try again.", sent.status);
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
