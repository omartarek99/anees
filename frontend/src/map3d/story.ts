import type { ApiLevel } from './schema';

// The story laid over the adventure map ("The Treasure of the Pearl of Light"): ten worlds of five levels (two to a zone),
// a key from the guardian that ends each world, and a new item every three keys. Pure data and rules: the words live in
// i18n.ts (the `story` group) and the screens in components/StoryPanel.tsx. Nothing here changes the map's shape.

export const WORLD_COUNT = 10;
export const KEY_COUNT = 10;

/** The world a level belongs to, 0..9 (levels 1-5 are world 0, 6-10 world 1, ...). */
export const worldOf = (level: number) => Math.floor((level - 1) / 5);

export type MilestoneId = 'mapA' | 'mapB' | 'ring' | 'shield';

export interface Milestone {
  id: MilestoneId;
  /** The big guardian's level: beating it completes the milestone. */
  level: number;
  /** Keys held once that level is beaten. */
  keys: number;
  icon: string;
}

/** Every three keys open something new: two halves of the treasure map, then the ring of power. With the ring and the map the hero finds the treasure at level 50. */
export const MILESTONES: readonly Milestone[] = [
  { id: 'mapA', level: 15, keys: 3, icon: '🗺️' },
  { id: 'mapB', level: 30, keys: 6, icon: '📜' },
  { id: 'ring', level: 45, keys: 9, icon: '💍' },
  { id: 'shield', level: 50, keys: 10, icon: '🛡️' },
];

export const milestoneAt = (level: number) => MILESTONES.find((m) => m.level === level);

const done = (levels: readonly ApiLevel[], n: number) => levels.find((l) => l.levelNumber === n)?.progress.status === 'completed';

/** One key per guardian beaten (levels 5, 10, ... 50). */
export function keysEarned(levels: readonly ApiLevel[]): number {
  let keys = 0;
  for (let k = 1; k <= KEY_COUNT; k++) if (done(levels, k * 5)) keys++;
  return keys;
}

export const hasMilestone = (levels: readonly ApiLevel[], m: Milestone) => done(levels, m.level);

/** The first milestone not yet won, with how many keys are still missing. */
export function nextMilestone(levels: readonly ApiLevel[]): { milestone: Milestone; keysLeft: number } | null {
  const milestone = MILESTONES.find((m) => !hasMilestone(levels, m));
  return milestone ? { milestone, keysLeft: Math.max(0, milestone.keys - keysEarned(levels)) } : null;
}
