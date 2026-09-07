import { createWorker } from 'tesseract.js';

export type IdVerificationFailureReason = 'NOT_QATAR_ID' | 'UNDERAGE' | 'UNREADABLE';
export type IdVerificationResult = { ok: true } | { ok: false; reason: IdVerificationFailureReason };

const MIN_TEACHER_AGE = 23;
const MIN_PLAUSIBLE_BIRTH_YEAR = 1920;

// Qatar's date convention is day-month-year, not the US month-day-year.
const DATE_PATTERN = /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;

function extractOldestPlausibleDate(text: string): Date | null {
  const now = new Date();
  let oldest: Date | null = null;

  for (const match of text.matchAll(DATE_PATTERN)) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += year < 50 ? 2000 : 1900;

    if (day < 1 || day > 31 || month < 1 || month > 12) continue;
    if (year < MIN_PLAUSIBLE_BIRTH_YEAR || year > now.getFullYear()) continue;

    const candidate = new Date(year, month - 1, day);
    // Reject dates that don't round-trip (e.g. day 31 in a 30-day month).
    if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) continue;
    if (candidate > now) continue;

    if (!oldest || candidate < oldest) oldest = candidate;
  }

  return oldest;
}

function ageInYears(birthDate: Date, now: Date): number {
  let age = now.getFullYear() - birthDate.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() && now.getDate() >= birthDate.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

/**
 * Best-effort local heuristic: OCR the photo, look for "Qatar" and the oldest plausible
 * date on the card (a QID prints issue/expiry/DOB dates, and DOB is reliably the most
 * distant past date for anyone old enough to hold an ID). Not cryptographic proof --
 * photo quality (blur, glare, rotation) can cause false rejections.
 */
export async function verifyQatarIdPhoto(buffer: Buffer): Promise<IdVerificationResult> {
  // A buffer that isn't actually a decodable JPEG/PNG (a spoofed Content-Type, a corrupt
  // upload, or arbitrary/malicious content) makes tesseract's underlying image reader fail.
  // Without an errorHandler, tesseract.js's worker message loop responds to that by
  // *throwing* (not just rejecting the pending recognize() promise) from inside a message
  // event callback with no listener -- Node treats that as uncaught and kills the whole
  // process. Supplying a no-op errorHandler here stops that throw; the try/catch below
  // still catches the (also-rejected) recognize() promise and turns it into a normal
  // "couldn't read this ID" result instead.
  const worker = await createWorker('eng', undefined, { errorHandler: () => {} });
  try {
    let text: string;
    try {
      const result = await worker.recognize(buffer);
      text = result.data.text;
    } catch {
      return { ok: false, reason: 'UNREADABLE' };
    }

    if (!/qatar/i.test(text)) {
      return { ok: false, reason: 'NOT_QATAR_ID' };
    }

    const birthDate = extractOldestPlausibleDate(text);
    if (!birthDate) {
      return { ok: false, reason: 'UNREADABLE' };
    }

    if (ageInYears(birthDate, new Date()) < MIN_TEACHER_AGE) {
      return { ok: false, reason: 'UNDERAGE' };
    }

    return { ok: true };
  } finally {
    await worker.terminate();
  }
}
