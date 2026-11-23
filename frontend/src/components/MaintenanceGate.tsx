import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { RiToolsLine } from '@remixicon/react';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { LanguageToggle } from './LanguageToggle';

// A cover over the whole website while it is being updated. It ends by itself at this moment (8:00 pm Qatar time, UTC+3), with no second
// deploy: the page checks the clock every 20 seconds. Set it to null to take the cover off.
const MAINTENANCE_UNTIL: number | null = Date.parse('2026-11-23T20:00:00+03:00');

/** Shows the maintenance cover instead of the site for everyone but the admin (who signs in through /login to check the update). */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { lang } = useLanguage();
  const { pathname } = useLocation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (MAINTENANCE_UNTIL === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => window.clearInterval(id);
  }, []);

  const active = MAINTENANCE_UNTIL !== null && now < MAINTENANCE_UNTIL;
  if (!active || user?.role === 'admin' || pathname === '/login') return <>{children}</>;

  const ar = lang === 'ar';
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 16, insetInlineEnd: 16 }}>
        <LanguageToggle />
      </div>
      <div className="card stack" style={{ maxWidth: 560, textAlign: 'center', alignItems: 'center' }} role="status">
        <RiToolsLine size={56} aria-hidden="true" />
        <h1 style={{ margin: 0, fontSize: 30 }}>{ar ? 'الموقع تحت الصيانة' : 'Anees is under maintenance'}</h1>
        <p style={{ margin: 0, fontSize: 19, lineHeight: 1.8 }}>
          {ar ? (
            <>الموقع تحت الصيانة حتى الساعة <bdi dir="ltr">8:00</bdi> مساءً (بتوقيت قطر). نعود إليكم قريبًا.</>
          ) : (
            <>We are updating the site and will be back at 8:00 PM (Qatar time). Thank you for your patience.</>
          )}
        </p>
        {user && (
          <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
            {ar ? 'تسجيل الخروج' : 'Log out'}
          </button>
        )}
        {!user && (
          <Link to="/login" className="muted" style={{ fontSize: 12, opacity: 0.55 }}>
            {ar ? 'دخول المشرف' : 'Admin sign-in'}
          </Link>
        )}
      </div>
    </div>
  );
}
