import { useState } from 'react';
import { RiAppleFill, RiAndroidFill } from '@remixicon/react';
import { useLanguage } from '../lib/language-context';
import { useInstallApp, openShareSheet } from '../lib/pwa';

type Platform = 'ios' | 'android';

/** "Get the app" block at the bottom of the landing page: one button for iPhone and one for Android.
 * On an iPhone the button opens the Share sheet straight away (where "Add to Home Screen" is); on Android it opens the
 * browser's own install window. Anywhere that is not possible (or on the other platform's button) it shows that
 * platform's short written steps instead. Hidden once the site is already running as an installed app. */
export function AppDownloadSection() {
  const { t } = useLanguage();
  const { ios, installed, install } = useInstallApp();
  // Nothing is expanded until a button is tapped: the tap itself does the installing (Share sheet / install window).
  const [open, setOpen] = useState<Platform | null>(null);
  if (installed) return null;

  async function onIphone() {
    if (ios) {
      // The steps stay visible underneath as a guide for picking "Add to Home Screen" in the sheet.
      setOpen('ios');
      await openShareSheet();
      return;
    }
    setOpen((p) => (p === 'ios' ? null : 'ios'));
  }

  async function onAndroid() {
    const opened = await install();
    if (!opened) setOpen((p) => (p === 'android' ? null : 'android'));
  }

  const steps =
    open === 'ios'
      ? { title: t('pwa.iosTitle'), text: t('pwa.iosSteps') }
      : open === 'android'
        ? { title: t('pwa.androidTitle'), text: t('pwa.androidSteps') }
        : null;

  return (
    <section className="landing-app" id="app" aria-label={t('landing.appTag')}>
      <div className="landing-app-inner">
        <img className="landing-app-logo" src="/icons/logo-mark.png" alt="" width={112} height={112} loading="lazy" decoding="async" />
        <div className="landing-app-copy">
          <p className="landing-tag">{t('landing.appTag')}</p>
          <div className="landing-store-row">
            <button
              type="button"
              className="landing-store-btn"
              aria-expanded={open === 'ios'}
              onClick={onIphone}
            >
              <RiAppleFill size={30} aria-hidden />
              <span>
                <small>{t('pwa.installOn')}</small>
                <strong>{t('pwa.iphone')}</strong>
              </span>
            </button>
            <button type="button" className="landing-store-btn" aria-expanded={open === 'android'} onClick={onAndroid}>
              <RiAndroidFill size={30} aria-hidden />
              <span>
                <small>{t('pwa.installOn')}</small>
                <strong>{t('pwa.android')}</strong>
              </span>
            </button>
          </div>
          {steps && (
            <div className="landing-app-steps" role="note">
              <h3>{steps.title}</h3>
              <p>{steps.text}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
