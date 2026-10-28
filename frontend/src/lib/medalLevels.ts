import type { CertificateType } from './certificateTiers';

// The points levels shown as a bar on a student's profile: everyone starts at "normal", then Bronze from 200 points, Silver from 1000
// and Gold from 2000. The same numbers decide when a student is sent the tier certificate (backend/src/lib/rankCertificates.ts).
export const MEDAL_LEVELS: { key: Extract<CertificateType, 'bronze' | 'silver' | 'gold'>; at: number }[] = [
  { key: 'bronze', at: 200 },
  { key: 'silver', at: 1000 },
  { key: 'gold', at: 2000 },
];

export type MedalLevel = 'normal' | 'bronze' | 'silver' | 'gold';

export function medalLevelFor(points: number): MedalLevel {
  let level: MedalLevel = 'normal';
  for (const m of MEDAL_LEVELS) if (points >= m.at) level = m.key;
  return level;
}

/** Where the points sit on the bar, 0..1. The three levels are evenly spaced, so each stretch of the bar is the same width. */
export function medalBarFraction(points: number): number {
  const stops = [0, ...MEDAL_LEVELS.map((m) => m.at)];
  const p = Math.max(0, points);
  for (let i = 0; i < MEDAL_LEVELS.length; i++) {
    if (p < stops[i + 1]) return (i + (p - stops[i]) / (stops[i + 1] - stops[i])) / MEDAL_LEVELS.length;
  }
  return 1;
}
