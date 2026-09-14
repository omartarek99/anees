import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { path as ffmpegPath } from '@ffmpeg-installer/ffmpeg';

// Lesson reels are short (teacherReelSchema caps durationSec at 300s) and only ever shown
// inside a phone-sized <video> frame, so there's no reason to keep a camera/screen-recording's
// full resolution or bitrate -- capping the longer side at 720px and re-encoding at a modest
// CRF cuts typical uploads down substantially with no visible loss at that display size.
const MAX_DIMENSION = 720;
const CRF = 28;
const AUDIO_BITRATE = '128k';
const TIMEOUT_MS = 120_000;

function runFfmpeg(inputPath: string, outputPath: string): Promise<{ durationSeconds: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-y',
      '-i',
      inputPath,
      // Fit within a MAX_DIMENSION x MAX_DIMENSION box, shrinking only (never upscaling a
      // smaller source) regardless of portrait/landscape orientation, then round both
      // dimensions down to the nearest even number (required by libx264).
      '-vf',
      `scale='min(${MAX_DIMENSION},iw)':'min(${MAX_DIMENSION},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
      '-c:v',
      'libx264',
      '-crf',
      String(CRF),
      '-preset',
      'veryfast',
      '-c:a',
      'aac',
      '-b:a',
      AUDIO_BITRATE,
      // Moves the MP4 index to the front of the file so the <video> tag can start playing
      // before the whole file has downloaded.
      '-movflags',
      '+faststart',
      outputPath,
    ]);

    let stderr = '';
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('ffmpeg timed out'));
    }, TIMEOUT_MS);

    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        // ffmpeg logs the *input* file's real duration to stderr near the top of every run
        // (e.g. "Duration: 00:00:10.53, start: ..."), regardless of whether -i is followed
        // by any trim/speed filters (we apply none) -- reading it back here is free, and
        // means callers don't need a whole second ffprobe binary just to learn how long the
        // video they just processed actually is.
        const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        const durationSeconds = match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : null;
        resolve({ durationSeconds });
      } else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Re-encodes a video buffer into a compressed, web-friendly H.264/AAC MP4. Always outputs
 * mp4 regardless of the input container (mp4/webm/mov all go in), so callers only ever have
 * to deal with one format on the way out. Throws on failure -- callers should catch this and
 * turn it into a normal 4xx/5xx response rather than letting it propagate unhandled.
 * `durationSeconds` is the source video's real, measured duration (null only if ffmpeg's log
 * format ever changes and the regex above stops matching) -- callers should use this instead
 * of whatever placeholder duration a teacher may have typed into the composer form, since
 * that number drives real things (the reel's progress bar, the watch-points thresholds).
 */
export async function compressVideo(buffer: Buffer): Promise<{ buffer: Buffer; durationSeconds: number | null }> {
  const workDir = await mkdtemp(join(tmpdir(), 'anees-video-'));
  const inputPath = join(workDir, 'input');
  const outputPath = join(workDir, 'output.mp4');
  try {
    await writeFile(inputPath, buffer);
    const { durationSeconds } = await runFfmpeg(inputPath, outputPath);
    const outBuffer = await readFile(outputPath);
    return { buffer: outBuffer, durationSeconds };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
