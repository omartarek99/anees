import { useState } from 'react';
import { RiAndroidFill } from '@remixicon/react';
import { useLanguage } from '../lib/language-context';
import { useInstallApp } from '../lib/pwa';

/** "Get the app" block at the bottom of the landing page: one Android button. It opens the browser's own install
 * window straight away; when the browser has not offered one it shows the short written steps instead. Hidden
 * on iPhone/iPad (websites cannot install there) and once the site is already running as an installed app. */
export function AppDownloadSection() {
  const { t } = useLanguage();
  const { installed, unsupported, install } = useInstallApp();
  const [showSteps, setShowSteps] = useState(false);
  if (installed || unsupported) return null;

  async function onAndroid() {
    const opened = await install();
    if (!opened) setShowSteps((v) => !v);
  }

  return (
    <section className="landing-app" id="app" aria-label={t('landing.appTag')}>
      <div className="landing-app-inner">
        <img className="landing-app-logo" src="/icons/logo-mark.png" alt="" width={112} height={112} loading="lazy" decoding="async" />
        <div className="landing-app-copy">
          <p className="landing-tag">{t('landing.appTag')}</p>
          <div className="landing-store-row">
            <button type="button" className="landing-store-btn" aria-expanded={showSteps} onClick={onAndroid}>
              <RiAndroidFill size={30} aria-hidden />
              <span>
                <small>{t('pwa.installOn')}</small>
                <strong>{t('pwa.android')}</strong>
              </span>
            </button>
          </div>
          {showSteps && (
            <div className="landing-app-steps" role="note">
              <h3>{t('pwa.androidTitle')}</h3>
              <p>{t('pwa.androidSteps')}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
