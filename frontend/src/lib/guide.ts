import type { Role, User } from './auth-context';

// The first-run guide: a short tour that lights up each icon in the menu bar with a pop-out window, plus a one-time
// "what is this page" window the first time each page is opened. Only accounts created in the last week get it
// automatically (older accounts do not suddenly get a tour); anyone can run it again from the menu. What a person
// has already seen is remembered in this browser, per account.

export const GUIDE_EVENT = 'anees:guide';
const FRESH_DAYS = 7;

const key = (userId: number, name: string) => `anees_guide_${userId}_${name}`;
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(k);
    else localStorage.setItem(k, value);
  } catch {
    // private mode: the guide just shows again next time
  }
};

export function guideEnabled(user: User): boolean {
  const saved = read(key(user.id, 'state'));
  if (saved) return saved === 'on';
  // createdAt comes from SQLite as "YYYY-MM-DD HH:MM:SS" in UTC.
  const created = new Date(user.createdAt.includes('T') ? user.createdAt : `${user.createdAt.replace(' ', 'T')}Z`).getTime();
  const fresh = Number.isFinite(created) && Date.now() - created < FRESH_DAYS * 86_400_000;
  write(key(user.id, 'state'), fresh ? 'on' : 'off');
  return fresh;
}

export const tourDone = (userId: number) => read(key(userId, 'tour')) === '1';
export const finishTour = (userId: number) => write(key(userId, 'tour'), '1');
export const pageSeen = (userId: number, pageId: string) => read(key(userId, `page_${pageId}`)) === '1';
export const markPageSeen = (userId: number, pageId: string) => write(key(userId, `page_${pageId}`), '1');

/** "Show the guide" in the menu: switch it on, forget what was seen, and start the tour again. */
export function replayGuide(user: User) {
  write(key(user.id, 'state'), 'on');
  write(key(user.id, 'tour'), null);
  for (const id of Object.values(PAGE_IDS)) write(key(user.id, `page_${id}`), null);
  window.dispatchEvent(new Event(GUIDE_EVENT));
}

/** Route -> the id used for that page's texts (guide.page_<id>_b) and its "seen" flag. */
export const PAGE_IDS: Record<string, string> = {
  '/': 'home',
  '/reels': 'reels',
  '/map': 'map',
  '/craft': 'craft',
  '/worksheets': 'worksheets',
  '/leaderboard': 'leaderboard',
  '/friends': 'friends',
  '/profile': 'profile',
  '/teacher/reels': 'myReels',
  '/admin/reports': 'adminReports',
  '/admin/users': 'adminUsers',
  '/admin/videos': 'adminVideos',
  '/admin/certificates': 'adminCertificates',
};

/** The tour, in order: `target` matches the data-tour attribute on the icon (see Sidebar.tsx / QuickMenu.tsx). */
export type TourStop = { target: string; id: string };

export function tourStops(role: Role): TourStop[] {
  if (role === 'admin') {
    return [
      { target: '/admin/reports', id: 'adminReports' },
      { target: '/admin/users', id: 'adminUsers' },
      { target: '/admin/videos', id: 'adminVideos' },
      { target: '/admin/certificates', id: 'adminCertificates' },
      { target: 'menu', id: 'menu' },
    ];
  }
  const stops: TourStop[] = [
    { target: '/', id: 'home' },
    { target: '/reels', id: 'reels' },
    ...(role === 'teacher' ? [{ target: '/teacher/reels', id: 'myReels' }] : []),
    { target: '/map', id: 'map' },
    { target: '/craft', id: 'craft' },
    { target: '/worksheets', id: 'worksheets' },
    { target: '/leaderboard', id: 'leaderboard' },
    { target: '/friends', id: 'friends' },
    { target: 'menu', id: 'menu' },
  ];
  return stops;
}
