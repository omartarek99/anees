import { useSyncExternalStore } from 'react';

// The level pop-out (RankMilestonePopup) and the shield pop-out (CertificateAwardPopup) each take over the screen, so only one may be up at a
// time: the level ones go first, and the shield waits until none are left (or until it is known there are none).
let milestonesPending = true;
const listeners = new Set<() => void>();

export function setMilestonesPending(value: boolean) {
  if (milestonesPending === value) return;
  milestonesPending = value;
  listeners.forEach((l) => l());
}

export function useMilestonesPending(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => milestonesPending
  );
}
