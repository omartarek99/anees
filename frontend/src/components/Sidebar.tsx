import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';

const LINKS = [
  { to: '/', key: 'nav.home', icon: '🏠', end: true },
  { to: '/reels', key: 'nav.reels', icon: '🎬' },
  { to: '/map', key: 'nav.map', icon: '🗺️' },
  { to: '/craft', key: 'nav.craft', icon: '🏗️' },
  { to: '/worksheets', key: 'nav.worksheets', icon: '📝' },
  { to: '/leaderboard', key: 'nav.leaderboard', icon: '🏆' },
  { to: '/friends', key: 'nav.friends', icon: '🧑‍🤝‍🧑' },
  { to: '/messages', key: 'nav.messages', icon: '💬' },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const { t, lang, toggleLang } = useLanguage();
  if (!user) return null;

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar-logo" title={t('brand')}>
        <img src="/icons/icon-192.png" alt={t('brand')} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
      </NavLink>

      <nav className="sidebar-nav">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            title={t(link.key)}
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
          title={lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
          onClick={toggleLang}
        >
          🌐
        </button>
        <NavLink to="/profile" title={t('profile.editProfile')} className={({ isActive }) => `sidebar-icon-btn${isActive ? ' active' : ''}`}>
          👤
        </NavLink>
        <button type="button" className="sidebar-icon-btn" title={t('nav.logout')} onClick={() => logout()}>
          🚪
        </button>
      </div>
    </aside>
  );
}
