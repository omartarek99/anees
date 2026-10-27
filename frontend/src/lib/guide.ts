import type { Role, User } from './auth-context';
import { api } from './api';

// The first-run guide: a short tour that lights up each icon in the menu bar with a pop-out window, plus a one-time
// "what is this page" window the first time each page is opened. Only accounts created in the last week get it
// automatically (older accounts do not suddenly get a tour). What a person
// has already seen is kept on the account (the server), with a copy in this browser, so it shows once per new user.

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

const remember = (userId: number, name: string) => {
  write(key(userId, name), '1');
  api.post('/guide', { key: name }).catch(() => {}); // best effort: the browser copy still works
};

/** Merges what the server knows into this browser, and sends up what only this browser knows (accounts that saw the guide before it was kept on the server). */
export async function syncGuide(userId: number): Promise<void> {
  try {
    const { seen } = await api.get<{ seen: string[] }>('/guide');
    const onServer = new Set(seen);
    for (const name of seen) write(key(userId, name), '1');
    const prefix = key(userId, '');
    const names: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) names.push(k.slice(prefix.length));
    }
    for (const name of names) {
      if ((name === 'tour' || name.startsWith('page_')) && read(key(userId, name)) === '1' && !onServer.has(name)) {
        api.post('/guide', { key: name }).catch(() => {});
      }
    }
  } catch {
    // offline / not signed in yet: fall back to this browser's own record
  }
}

export const tourDone = (userId: number) => read(key(userId, 'tour')) === '1';
export const finishTour = (userId: number) => remember(userId, 'tour');
export const pageSeen = (userId: number, pageId: string) => read(key(userId, `page_${pageId}`)) === '1';
export const markPageSeen = (userId: number, pageId: string) => remember(userId, `page_${pageId}`);

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
