import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { useTheme } from '../lib/theme-context';

/** Floating bottom-corner settings menu — the single place profile/language/theme/logout
 * live now (moved out of the sidebar, see Sidebar.tsx). Fixed to the same bottom-right
 * spot always; only its popup panel opens/closes, the button itself never moves. */
export function QuickMenu() {
  const { t, toggleLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const themeLabel = theme === 'dark' ? t('common.switchToLight') : t('common.switchToDark');

  return (
    <div className="quick-menu" ref={rootRef}>
      {open && (
        <div className="quick-menu-panel" role="menu">
          <NavLink to="/profile" className="quick-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="quick-menu-icon" aria-hidden>
              👤
            </span>
            {t('profile.editProfile')}
          </NavLink>
          <button
            type="button"
            className="quick-menu-item"
            role="menuitem"
            onClick={() => {
              toggleLang();
              setOpen(false);
            }}
          >
            <span className="quick-menu-icon" aria-hidden>
              🌐
            </span>
            {t('common.language')}
          </button>
          <button
            type="button"
            className="quick-menu-item"
            role="menuitem"
            onClick={() => {
              toggleTheme();
              setOpen(false);
            }}
          >
            <span className="quick-menu-icon" aria-hidden>
              {theme === 'dark' ? '☀️' : '🌙'}
            </span>
            {themeLabel}
          </button>
          <button
            type="button"
            className="quick-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <span className="quick-menu-icon" aria-hidden>
              🚪
            </span>
            {t('nav.logout')}
          </button>
        </div>
      )}
      <button
        type="button"
        className="quick-menu-btn"
        aria-label={t('common.menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden>☰</span>
      </button>
    </div>
  );
}
