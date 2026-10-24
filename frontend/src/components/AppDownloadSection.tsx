import { useState } from 'react';
import { RiAppleFill, RiAndroidFill } from '@remixicon/react';
import { useLanguage } from '../lib/language-context';
import { useInstallApp } from '../lib/pwa';

type Platform = 'ios' | 'android';

/** "Get the app" block at the bottom of the landing page: one button for iPhone and one for Android.
 * Android opens the browser's own install window when it offered one; either button otherwise shows that
 * platform's short "Add to Home Screen" steps. The visitor's own platform opens by default. Hidden once the
 * site is already running as an installed app. */
export function AppDownloadSection() {
  const { t } = useLanguage();
  const { ios, android, installed, install } = useInstallApp();
  const [open, setOpen] = useState<Platform | null>(ios ? 'ios' : android ? 'android' : null);
  if (installed) return null;

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
    <section className="landing-app" id="app" aria-labelledby="landing-app-title">
      <div className="landing-app-inner">
        <img className="landing-app-logo" src="/icons/logo-mark.png" alt="" width={112} height={112} loading="lazy" decoding="async" />
        <div className="landing-app-copy">
          <p className="landing-tag">{t('landing.appTag')}</p>
          <h2 id="landing-app-title">{t('landing.appTitle')}</h2>
          <p className="landing-body">{t('landing.appBody')}</p>
          <div className="landing-store-row">
            <button
              type="button"
              className="landing-store-btn"
              aria-expanded={open === 'ios'}
              onClick={() => setOpen((p) => (p === 'ios' ? null : 'ios'))}
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
