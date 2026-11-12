import { NavLink } from 'react-router-dom';
import { RiBarChartBoxFill, RiDashboardLine, RiFilePaper2Line, RiGroupFill, RiMovie2Line, RiVideoFill } from '@remixicon/react';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';

// A teacher's navigation: a bar across the top of every page (they have no sidebar), led by the way back to their dashboard
// (the home page, HomePage TeacherDashboard). On a phone the links scroll sideways.
const LINKS = [
  { to: '/', key: 'home.dashTitle', icon: <RiDashboardLine size={18} />, end: true },
  { to: '/teacher/reels', key: 'home.dash_lessons', icon: <RiMovie2Line size={18} /> },
  { to: '/worksheets', key: 'nav.worksheets', icon: <RiFilePaper2Line size={18} /> },
  { to: '/reels', key: 'nav.reels', icon: <RiVideoFill size={18} /> },
  { to: '/leaderboard', key: 'nav.leaderboard', icon: <RiBarChartBoxFill size={18} /> },
  { to: '/friends', key: 'nav.friends', icon: <RiGroupFill size={18} /> },
];

export function TeacherNav() {
  const { user } = useAuth();
  const { t } = useLanguage();
  if (user?.role !== 'teacher') return null;
  return (
    <nav className="teacher-nav" aria-label={t('home.dashTitle')}>
      <NavLink to="/" end className="teacher-nav-brand" title={t('brand')}>
        <img src="/icons/logo-mark.png" alt={t('brand')} />
      </NavLink>
      <div className="teacher-nav-links no-scrollbar">
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `teacher-nav-link${isActive ? ' active' : ''}`}>
            <span aria-hidden="true">{l.icon}</span>
            {t(l.key)}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
