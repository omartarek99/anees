import { useSyncExternalStore } from 'react';

// Whether the reels play muted. Shared so the welcome window over the reels (GuideHost) can switch the sound off too.
let muted = false;
const listeners = new Set<() => void>();

export function setReelsMuted(next: boolean | ((m: boolean) => boolean)) {
  const value = typeof next === 'function' ? next(muted) : next;
  if (value === muted) return;
  muted = value;
  // the playing video follows at once: inside a tap that is the only moment iPhone Safari lets the sound come on
  document.querySelectorAll<HTMLVideoElement>('.swiper-slide-active video').forEach((v) => (v.muted = value));
  listeners.forEach((l) => l());
}

export function useReelsMuted(): boolean {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => muted
  );
}
