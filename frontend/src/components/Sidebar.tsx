import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';

type SidebarLink = { to: string; key: string; icon: string; end?: boolean };

const HOME_LINK: SidebarLink = { to: '/', key: 'nav.home', icon: '🏠', end: true };

// The full gameplay surface — shared by both account types (see backend/src/index.ts,
// which no longer role-gates these routes either). A teacher account is a student
// account plus a few extras, not a separate walled-off experience.
const GAME_LINKS: SidebarLink[] = [
  { to: '/reels', key: 'nav.reels', icon: '🎬' },
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
        <button type="button" className="sidebar-icon-btn" title={t('nav.logout')} aria-label={t('nav.logout')} onClick={() => logout()}>
          <span aria-hidden>🚪</span>
        </button>
      </div>
    </aside>
  );
}
