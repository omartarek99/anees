import type { ReactNode } from 'react';
import {
  RiMapFill,
  RiGamepadLine,
  RiSwordLine,
  RiVideoFill,
  RiFilePaper2Line,
  RiRobot2Line,
  RiBarChartBoxFill,
  RiGroupFill,
  RiMovie2Line,
  RiUserAddLine,
  RiToolsLine,
  RiGlobalLine,
  RiGamepadFill,
  RiBookOpenFill,
  RiTeamFill,
  RiPresentationFill,
  RiUserStarFill,
} from '@remixicon/react';

// What the admin's Features page knows about each switch (the keys are the ones in the backend lib/features.ts): the order and grouping, a small
// line icon, and the picture shown on its card.

export type Role = 'student' | 'teacher';

export const GROUPS: { title: string; keys: string[]; icon: ReactNode }[] = [
  { title: 'features.groupSite', keys: ['site'], icon: <RiGlobalLine size={18} /> },
  { title: 'features.groupGames', keys: ['map', 'craft', 'challenges'], icon: <RiGamepadFill size={18} /> },
  { title: 'features.groupLearning', keys: ['reels', 'worksheets', 'ai_worksheets'], icon: <RiBookOpenFill size={18} /> },
  { title: 'features.groupCommunity', keys: ['leaderboard', 'friends'], icon: <RiTeamFill size={18} /> },
  { title: 'features.groupTeachers', keys: ['teacher_upload'], icon: <RiPresentationFill size={18} /> },
  { title: 'features.groupAccounts', keys: ['signup'], icon: <RiUserStarFill size={18} /> },
];

/** The picture of a switch (or its line icon when it has none), in a rounded frame. Decorative: the name is always written next to it. */
export function FeatureArt({ k, size = 72 }: { k: string; size?: number }) {
  return (
    <span className="feature-art" style={{ inlineSize: size, blockSize: size }} aria-hidden="true">
      {ART[k] ? <img src={ART[k]} alt="" width={size} height={size} decoding="async" loading="lazy" /> : ICONS[k]}
    </span>
  );
}

export const ICONS: Record<string, ReactNode> = {
  site: <RiToolsLine size={22} />,
  map: <RiMapFill size={22} />,
  craft: <RiGamepadLine size={22} />,
  challenges: <RiSwordLine size={22} />,
  reels: <RiVideoFill size={22} />,
  worksheets: <RiFilePaper2Line size={22} />,
  ai_worksheets: <RiRobot2Line size={22} />,
  leaderboard: <RiBarChartBoxFill size={22} />,
  friends: <RiGroupFill size={22} />,
  teacher_upload: <RiMovie2Line size={22} />,
  signup: <RiUserAddLine size={22} />,
};

/** The picture on each switch's card (public/icons/features). A key without one falls back to its line icon. */
export const ART: Record<string, string> = Object.fromEntries(
  ['site', 'map', 'craft', 'challenges', 'reels', 'worksheets', 'ai_worksheets', 'leaderboard', 'friends', 'teacher_upload', 'signup'].map((k) => [k, `/icons/features/${k}.webp`])
);

