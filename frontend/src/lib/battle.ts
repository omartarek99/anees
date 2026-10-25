import { useEffect, useRef, useState } from 'react';

// Boss battles are limited to three tries, then a 24-hour wait counted from the last loss (the server keeps the clock:
// backend/src/lib/battle.ts). This is the shape it sends and a ticking countdown to show the wait.

export type BattleStatus = {
  triesLeft: number;
  maxTries: number;
  /** ISO time the wait ends, or null when the player can fight. */
  lockedUntil: string | null;
};

/** Milliseconds left until `until` (null when there is no wait), ticking every second; calls `onDone` once when it reaches zero. */
export function useCountdown(until: string | null, onDone?: () => void): number | null {
  const [left, setLeft] = useState<number | null>(() => (until ? Math.max(0, Date.parse(until) - Date.now()) : null));
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!until) {
      setLeft(null);
      return;
    }
    const end = Date.parse(until);
    const tick = () => {
      const ms = Math.max(0, end - Date.now());
      setLeft(ms);
      if (ms === 0) {
        window.clearInterval(id);
        done.current?.();
      }
    };
    const id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, [until]);
  return left;
}

/** 93784000 -> "26:03:04" */
export function formatHms(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
