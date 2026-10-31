import type { RankKey } from './medalLevels';

// The rank frames in /images/frames/<rank>.png: a square picture with the round hole for the profile picture in the middle.
// `ratio` is the hole's diameter over the image's width; `hole` is how big the picture is drawn (css px), chosen so the widest frames
// (the winged ones, whose hole is small) stay about 300 px across. Made from the artwork sheet by cutting each frame out and centring its hole.
export const RANK_FRAMES: Record<RankKey, { ratio: number; hole: number }> = {
  iron: { ratio: 0.6814, hole: 132 },
  bronze: { ratio: 0.6616, hole: 132 },
  silver: { ratio: 0.562, hole: 132 },
  gold: { ratio: 0.5754, hole: 132 },
  platinum: { ratio: 0.4968, hole: 132 },
  diamond: { ratio: 0.3189, hole: 96 },
  warrior: { ratio: 0.2983, hole: 89 },
  champion: { ratio: 0.3122, hole: 94 },
};
