import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import {
  RiVideoFill,
  RiMapFill,
  RiHome2Line,
  RiGamepadLine,
  RiFilePaper2Line,
  RiGroupFill,
  RiFilmFill,
  RiBarChartBoxFill,
  RiCertificateFill,
  RiMovie2Line,
} from '@remixicon/react';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';

// The two Material icons (Leaderboard, People) as bare paths, rather than bundling @mui for them.
const PathIcon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="currentColor" aria-hidden="true">
    <path d={d} />
  </svg>
);

// Emoji for most nav icons (unchanged), or a component for the ones swapped for a real
// icon -- `currentColor` means it automatically follows .sidebar-icon-btn's own color,
// including its .active state, with no extra wiring.
type SidebarLink = { to: string; key: string; icon: string | ReactNode; end?: boolean };

const HOME_LINK: SidebarLink = { to: '/', key: 'nav.home', icon: <RiHome2Line size={20} />, end: true };

// The full gameplay surface — shared by both account types (see backend/src/index.ts,
// which no longer role-gates these routes either). A teacher account is a student
// account plus a few extras, not a separate walled-off experience.
const GAME_LINKS: SidebarLink[] = [
  { to: '/reels', key: 'nav.reels', icon: <RiVideoFill size={20} /> },
  { to: '/map', key: 'nav.map', icon: <RiMapFill size={20} /> },
  { to: '/craft', key: 'nav.craft', icon: <RiGamepadLine size={20} /> },
  { to: '/worksheets', key: 'nav.worksheets', icon: <RiFilePaper2Line size={20} /> },
  { to: '/leaderboard', key: 'nav.leaderboard', icon: <PathIcon d="M7.5 21H2V9h5.5zm7.25-18h-5.5v18h5.5zM22 11h-5.5v10H22z" /> },
  { to: '/friends', key: 'nav.friends', icon: <PathIcon d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3m-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3m0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5m8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5" /> },
];

// Teacher-only extra, on top of the shared game links above.
const TEACHER_LINKS: SidebarLink[] = [{ to: '/teacher/reels', key: 'nav.myReels', icon: <RiMovie2Line size={20} /> }];

// Admin is a pure account-management role, not a gameplay one -- instead of the shared
// game surface it gets one icon per section (Users/Videos/Reports), each its own route
// (see App.tsx's /admin/:tab), same as every other page in the app.
const ADMIN_LINKS: SidebarLink[] = [
  { to: '/admin/reports', key: 'nav.adminReports', icon: <RiBarChartBoxFill size={20} /> },
  { to: '/admin/users', key: 'nav.adminUsers', icon: <RiGroupFill size={20} /> },
  { to: '/admin/videos', key: 'nav.adminVideos', icon: <RiFilmFill size={20} /> },
  { to: '/admin/certificates', key: 'nav.adminCertificates', icon: <RiCertificateFill size={20} /> },
];

export function Sidebar() {
  const { user } = useAuth();
  const { t } = useLanguage();
  if (!user) return null;

  // Teacher's "create video" link sits right after Reels, not at the end of the list --
  // it's the natural companion to the icon students use to watch reels.
  const links =
    user.role === 'admin'
      ? ADMIN_LINKS
      : user.role === 'teacher'
        ? [HOME_LINK, GAME_LINKS[0], ...TEACHER_LINKS, ...GAME_LINKS.slice(1)]
        : [HOME_LINK, ...GAME_LINKS];

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar-logo" title={t('brand')}>
        <img src="/icons/logo-mark.png" alt={t('brand')} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </NavLink>

      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            title={t(link.key)}
            aria-label={t(link.key)}
            data-tour={link.to}
            className={({ isActive }) => `sidebar-icon-btn${isActive ? ' active' : ''}`}
          >
            <span aria-hidden>{link.icon}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
