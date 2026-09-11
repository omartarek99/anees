import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { useTheme } from '../lib/theme-context';

/** Floating settings menu, anchored on the same side as the sidebar ("icon bar") --
 * left in English, right in Arabic (see `inset-inline-start` in theme.css). The button
 * is always the first flex child next to that anchored edge, so it never shifts when the
 * panel opens; the panel is the second child, always extending toward the middle of the
 * screen (never off the edge) and reading in whichever direction the page already is. */
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
    </div>
  );
}
