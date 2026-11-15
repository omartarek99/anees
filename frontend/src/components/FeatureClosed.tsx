import { Link } from 'react-router-dom';
import { RiLockLine, RiToolsLine } from '@remixicon/react';
import { useAuth } from '../lib/auth-context';
import { useFeatures } from '../lib/features-context';
import { useLanguage } from '../lib/language-context';

/** Shown in place of a page the admin has switched off for this kind of account (see App.tsx FeatureGate and the admin "Features" page). */
export function FeatureClosed() {
  const { t } = useLanguage();
  return (
    <div className="empty-state card stack" style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center', alignItems: 'center' }} role="status">
      <RiLockLine size={44} aria-hidden="true" />
      <h2 style={{ margin: 0 }}>{t('features.closedTitle')}</h2>
      <p className="muted" style={{ margin: 0 }}>{t('features.closedBody')}</p>
      <Link to="/" className="btn btn-primary">
        {t('features.backHome')}
      </Link>
    </div>
  );
}

/** Shown instead of the whole app while the admin has the site closed for this kind of account (maintenance). The admin's own notice is shown if there is one. */
export function SiteClosed() {
  const { t } = useLanguage();
  const { logout } = useAuth();
  const { siteMessage, refresh } = useFeatures();
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card stack" style={{ maxWidth: 520, textAlign: 'center', alignItems: 'center' }} role="status">
        <RiToolsLine size={52} aria-hidden="true" />
        <h1 style={{ margin: 0, fontSize: 26 }}>{t('features.siteClosedTitle')}</h1>
        <p style={{ margin: 0, fontSize: 17, lineHeight: 1.7 }}>{siteMessage || t('features.siteClosedBody')}</p>
        <div className="flex gap-sm" style={{ flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="btn btn-primary" onClick={refresh}>
            {t('features.siteClosedCheck')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
            {t('nav.logout')}
          </button>
        </div>
      </div>
    </div>
  );
}
