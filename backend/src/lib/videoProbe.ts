import { spawn } from 'node:child_process';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';

export type VideoProbe = {
  /** The video's real length, from the file itself (null when ffmpeg couldn't tell). */
  durationSeconds: number | null;
  /** The codec of the first video stream ("h264", "hevc", "vp9" ...), or null when the file has no video stream at all. */
  videoCodec: string | null;
};

const TIMEOUT_MS = 30_000;

/**
 * Looks at a video that is already stored (by its public URL) without downloading or re-encoding it: ffmpeg reads just the file's header, which
 * lists its streams and its duration. An ordinary video gives a duration and a video codec; anything else (a web page, a broken file) gives neither.
 * ffmpeg exits with an error when it is given no output, which is expected here -- only what it prints matters.
 */
export function probeVideoUrl(url: string): Promise<VideoProbe> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-i', url]);
    let stderr = '';
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('probe timed out'));
    }, TIMEOUT_MS);
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
      resolve({
        durationSeconds: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null,
        videoCodec: v ? v[1].toLowerCase() : null,
      });
    });
  });
}
