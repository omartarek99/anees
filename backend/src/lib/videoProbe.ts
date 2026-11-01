import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';

export type VideoProbe = {
  /** The video's real length, from the file itself (null when ffmpeg couldn't tell). */
  durationSeconds: number | null;
  /** The codec of the first video stream ("h264", "hevc", "vp9" ...), or null when the file has no video stream at all. */
  videoCodec: string | null;
};

const PROBE_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 90_000;

/**
 * Looks at a video file on disk without re-encoding it: ffmpeg reads the file's header, which lists its streams and its duration. An ordinary
 * video gives a duration and a video codec; anything else (a web page, a broken file) gives neither.
 * ffmpeg exits with an error when it is given no output, which is expected here -- only what it prints matters.
 */
export function probeVideoFile(path: string): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-i', path]);
    let stderr = '';
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('probe timed out'));
    }, PROBE_TIMEOUT_MS);
    proc.stderr.on('data', (chunk) => {
      if (stderr.length < 64 * 1024) stderr += chunk;
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    proc.on('close', () => {
      clearTimeout(timeout);
      const d = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      const v = stderr.match(/Stream #\d+:\d+[^\n]*?: Video: ([a-z0-9_]+)/i);
      const probe = { durationSeconds: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null, videoCodec: v ? v[1].toLowerCase() : null };
      // so the server's log says why a file could not be read (ffmpeg's last lines; they contain no file name of ours beyond the temp path)
      if (!probe.videoCodec || !probe.durationSeconds) console.error('Video probe found no video stream. ffmpeg said:', stderr.trim().split('\n').slice(-4).join(' | ').slice(0, 500));
      resolve(probe);
    });
  });
}

/**
 * Looks at a video that is already stored, by its public URL: the file is downloaded to a temporary file (at most `maxBytes`) and probed from disk.
 * (Handing ffmpeg the https address itself works on some machines and not others -- its TLS support is not the same everywhere -- and an mp4 may keep
 * its index at the end of the file, which a plain download handles without any special reading.) The temporary file is always removed.
 */
export async function probeVideoFromUrl(url: string, maxBytes: number): Promise<VideoProbe> {
  const dir = await mkdtemp(join(tmpdir(), 'anees-probe-'));
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    if (!res.ok || !res.body) throw new Error(`download failed: HTTP ${res.status}`);
    const file = join(dir, 'video');
    let received = 0;
    const cap = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length;
        if (received > maxBytes) cb(new Error('file is larger than the limit'));
        else cb(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), cap, createWriteStream(file));
    return await probeVideoFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
