import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../lib/language-context';
import { getConsent, setConsent } from '../lib/cookie-consent';
import { trackPageview } from '../lib/analytics';

/** Shown once per browser until a choice is made. Not a full-screen blocking modal on
 * purpose -- a cookie notice shouldn't stop anyone from reading the page underneath it, and
 * the one cookie this app sets (session auth) is strictly necessary either way; this only
 * ever gates the optional first-party analytics (lib/analytics.ts).
 *
 * Plain conditional render, not framer-motion's AnimatePresence -- unlike WarningModal
 * (which starts hidden and only appears once `/auth/me` resolves, well after mount),
 * this banner can already be visible on the very first render. Combined with React
 * StrictMode's dev-only double-invoke of the initial mount, that leaves AnimatePresence's
 * exit-tracking in a stuck state where the DOM node never actually gets removed after
 * dismissal (reproduced directly: React's own state correctly flips, the DOM does not).
 * A CSS-only entrance and an instant dismiss sidesteps it entirely -- fine for a bar that
 * disappears once, for good. */
export function CookieConsentBanner() {
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const [choice, setChoice] = useState(getConsent);

  function choose(value: 'accepted' | 'declined') {
    setConsent(value);
    setChoice(value);
    // The route-change tracker (App.tsx's PageviewTracker) already fired once for this page
    // before consent existed, so it silently skipped -- accepting now shouldn't have to wait
    // for the *next* navigation to start counting; track the page already being looked at.
    if (value === 'accepted') trackPageview(pathname);
  }

  if (choice) return null;

  return (
    <div className="cookie-consent-banner" role="region" aria-label={t('cookieConsent.title')}>
      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
        {t('cookieConsent.body')} <Link to="/cookies">{t('legal.cookies')}</Link>
      </p>
      <div className="flex gap-sm" style={{ flexShrink: 0 }}>
        <button type="button" className="btn btn-secondary" onClick={() => choose('declined')}>
          {t('cookieConsent.decline')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => choose('accepted')}>
          {t('cookieConsent.accept')}
        </button>
      </div>
    </div>
  );
}
