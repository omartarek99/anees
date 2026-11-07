import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { db } from '../db/db.js';
import { compressVideoFile } from './videoCompression.js';
import { r2Delete, r2Enabled, r2KeyFromUrl, r2Put, r2PublicUrl } from './r2.js';
import { VIDEO_PATH_PREFIX } from './reelVideo.js';

// Lesson videos go from the teacher's browser straight to R2, so nothing ever re-encoded them: a phone's 1080p / 4K file (up to 100MB), with its index
// (the MP4 "moov" box) often at the END of the file, was what every student downloaded -- Safari cannot start such a file until it has all of it, which
// is why reels were slow to start. This turns each stored video into what the Videos route always made for the other upload path: 720p H.264/AAC at a
// modest quality with the index at the front (compressVideoFile: +faststart), a fraction of the size, and playable at once.
// It runs after the lesson is already saved (the original keeps playing until the optimised copy replaces it), one video at a time (a small shared
// server), and a failure leaves the original in place. A file made here ends in OPTIMISED_SUFFIX, which is how it is told from one that still needs it.
export const OPTIMISED_SUFFIX = '-opt.mp4';

const queue: number[] = [];
let running = false;

/** Queue a lesson's video for optimising (nothing happens when R2 is off, there is no video, or it is already optimised). */
export function queueVideoOptimise(reelId: number): void {
  if (!r2Enabled || queue.includes(reelId)) return;
  queue.push(reelId);
  void drain();
}

/** Queue every lesson whose video is on R2 and not yet optimised; returns how many were queued. */
export function queueAllUnoptimised(): number {
  if (!r2Enabled) return 0;
  const rows = db.prepare(`SELECT id, video_url FROM reels WHERE video_url IS NOT NULL`).all() as { id: number; video_url: string }[];
  let n = 0;
  for (const r of rows) {
    if (r.video_url.split('?')[0].endsWith(OPTIMISED_SUFFIX) || !r2KeyFromUrl(r.video_url)) continue;
    queueVideoOptimise(r.id);
    n++;
  }
  return n;
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const id = queue.shift()!;
      try {
        await optimiseOne(id);
      } catch (err) {
        console.error('Video optimise failed for reel', id, ':', (err instanceof Error ? err.message : String(err)).slice(0, 400));
      }
    }
  } finally {
    running = false;
  }
}

async function optimiseOne(reelId: number) {
  const row = db.prepare(`SELECT video_url FROM reels WHERE id = ?`).get(reelId) as { video_url: string | null } | undefined;
  const oldUrl = row?.video_url ?? null;
  const oldKey = r2KeyFromUrl(oldUrl);
  if (!oldUrl || !oldKey || oldUrl.split('?')[0].endsWith(OPTIMISED_SUFFIX)) return;

  const dir = await mkdtemp(join(tmpdir(), 'anees-opt-'));
  try {
    const input = join(dir, 'input');
    const res = await fetch(oldUrl);
    if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(input));
    const { buffer } = await compressVideoFile(input);
    const newKey = `${VIDEO_PATH_PREFIX}${reelId}-${Date.now()}${OPTIMISED_SUFFIX}`;
    await r2Put(newKey, buffer, 'video/mp4');
    const newUrl = r2PublicUrl(newKey);
    // only if the lesson still points at the file we read (the teacher may have replaced the video, or deleted the lesson, meanwhile)
    const swapped = db.prepare(`UPDATE reels SET video_url = ? WHERE id = ? AND video_url = ?`).run(newUrl, reelId, oldUrl).changes;
    if (swapped) await r2Delete(oldKey).catch(() => {});
    else await r2Delete(newKey).catch(() => {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
