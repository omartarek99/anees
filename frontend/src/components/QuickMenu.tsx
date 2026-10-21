import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { RiUserFill, RiLogoutBoxRLine, RiLogoutBoxLine, RiLockPasswordLine } from '@remixicon/react';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { useTheme } from '../lib/theme-context';
import { LanguageSwitch, ThemeSwitch } from './Switch';

/** Floating settings menu, anchored on the same side as the sidebar ("icon bar") --
 * left in English, right in Arabic (see `inset-inline-start` in theme.css). The button
 * is always the first flex child next to that anchored edge, so it never shifts when the
 * panel opens; the panel is the second child, always extending toward the middle of the
 * screen (never off the edge) and reading in whichever direction the page already is. */
export function QuickMenu() {
  const { t, lang, toggleLang } = useLanguage();
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
              <RiUserFill size={17} />
            </span>
            {t('profile.editProfile')}
          </NavLink>
          <NavLink to="/password" className="quick-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <span className="quick-menu-icon" aria-hidden>
              <RiLockPasswordLine size={17} />
            </span>
            {t('profile.changePassword')}
          </NavLink>
          <button
            type="button"
            className="quick-menu-item"
            role="menuitem"
            onClick={toggleLang}
          >
            {t('common.language')}
            <LanguageSwitch />
          </button>
          <button
            type="button"
            className="quick-menu-item"
            role="menuitem"
            onClick={toggleTheme}
          >
            {themeLabel}
            <ThemeSwitch />
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
              {lang === 'ar' ? <RiLogoutBoxRLine size={17} /> : <RiLogoutBoxLine size={17} />}
            </span>
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
