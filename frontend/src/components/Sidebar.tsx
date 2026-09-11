import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { RiVideoFill } from '@remixicon/react';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { useTheme } from '../lib/theme-context';

// Emoji for most nav icons (unchanged), or a component for one that's been swapped for a
// real icon (currently just Reels) -- `currentColor` means it automatically follows
// .sidebar-icon-btn's own color, including its .active state, with no extra wiring.
type SidebarLink = { to: string; key: string; icon: string | ReactNode; end?: boolean };

const HOME_LINK: SidebarLink = { to: '/', key: 'nav.home', icon: '🏠', end: true };

// The full gameplay surface — shared by both account types (see backend/src/index.ts,
// which no longer role-gates these routes either). A teacher account is a student
// account plus a few extras, not a separate walled-off experience.
const GAME_LINKS: SidebarLink[] = [
  { to: '/reels', key: 'nav.reels', icon: <RiVideoFill size={20} /> },
  { to: '/map', key: 'nav.map', icon: '🗺️' },
  { to: '/craft', key: 'nav.craft', icon: '🏗️' },
  { to: '/worksheets', key: 'nav.worksheets', icon: '📝' },
  { to: '/leaderboard', key: 'nav.leaderboard', icon: '🏆' },
  { to: '/friends', key: 'nav.friends', icon: '🧑‍🤝‍🧑' },
];

// Teacher-only extra, on top of the shared game links above.
const TEACHER_LINKS: SidebarLink[] = [{ to: '/teacher/reels', key: 'nav.myReels', icon: '🎥' }];

// Admin is a pure account-management role, not a gameplay one -- it gets its own single
// link (which doubles as its landing page) instead of the shared game surface.
const ADMIN_LINKS: SidebarLink[] = [{ to: '/admin', key: 'nav.admin', icon: '🛡️' }];

export function Sidebar() {
  const { user, logout } = useAuth();
  const { t, lang, toggleLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  if (!user) return null;

  const links =
    user.role === 'admin'
      ? ADMIN_LINKS
      : user.role === 'teacher'
        ? [HOME_LINK, ...GAME_LINKS, ...TEACHER_LINKS]
        : [HOME_LINK, ...GAME_LINKS];

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar-logo" title={t('brand')}>
        <img src="/icons/icon-192.png" alt={t('brand')} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
      </NavLink>

      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            title={t(link.key)}
            aria-label={t(link.key)}
            className={({ isActive }) => `sidebar-icon-btn${isActive ? ' active' : ''}`}
          >
            <span aria-hidden>{link.icon}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button
          type="button"
          className="sidebar-icon-btn"
          title={theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')}
          aria-label={theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark')}
          onClick={toggleTheme}
        >
          <span aria-hidden>{theme === 'dark' ? '☀️' : '🌙'}</span>
        </button>
        <button
          type="button"
          className="sidebar-icon-btn"
          title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          aria-label={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          onClick={toggleLang}
        >
          <span aria-hidden>🌐</span>
        </button>
        <NavLink
          to="/profile"
          title={t('profile.editProfile')}
          aria-label={t('profile.editProfile')}
          className={({ isActive }) => `sidebar-icon-btn${isActive ? ' active' : ''}`}
        >
          <span aria-hidden>👤</span>
        </NavLink>
        <button type="button" className="sidebar-icon-btn" title={t('nav.logout')} aria-label={t('nav.logout')} onClick={() => logout()}>
          <span aria-hidden>🚪</span>
        </button>
      </div>
    </aside>
  );
}
