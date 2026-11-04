import { useSyncExternalStore } from 'react';

// Two small shared flags that the signed-in pop-ups use to take turns, each a value that components can set and subscribe to.
function flag(initial: boolean) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    set(next: boolean) {
      if (value === next) return;
      value = next;
      listeners.forEach((l) => l());
    },
    use: () =>
      useSyncExternalStore(
        (cb) => {
          listeners.add(cb);
          return () => listeners.delete(cb);
        },
        () => value
      ),
  };
}

// The level pop-out (RankMilestonePopup) and the shield pop-out (CertificateAwardPopup) each take over the screen, so only one may be up at a
// time: the level ones go first, and the shield waits until none are left (or until it is known there are none).
const milestones = flag(true);
export const setMilestonesPending = milestones.set;
export const useMilestonesPending = milestones.use;

// After a rank drop the page keeps the colour of the rank the student fell from until the demotion pop-up (RankDemotionPopup) lets go of it, so
// the colour changes under the pop-up's own sweep (RankAura holds it, the pop-up releases it).
const rankPerks = flag(false);
export const setRankPerksReleased = rankPerks.set;
export const useRankPerksReleased = rankPerks.use;
