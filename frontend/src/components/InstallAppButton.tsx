import { useState } from 'react';
import { RiDownloadLine } from '@remixicon/react';
import { useLanguage } from '../lib/language-context';
import { useInstallApp, openIosGuide } from '../lib/pwa';

/** "Install app" entry: opens the browser's own install dialog on Android/Chrome; on iPhone (and when the
 * browser offered no prompt) it shows the short manual steps. Renders nothing once the app is installed or on a
 * desktop browser with no install offer. `variant` only changes the look to suit the surrounding menu. */
export function InstallAppButton({ variant = 'menu', onDone }: { variant?: 'menu' | 'landing'; onDone?: () => void }) {
  const { t } = useLanguage();
  const { available, ios, install } = useInstallApp();
  const [showSteps, setShowSteps] = useState(false);
  if (!available) return null;

  async function onClick() {
    // iPhone: show the guide overlay (a page cannot open "Add to Home Screen" itself).
    if (ios) {
      openIosGuide();
      onDone?.();
      return;
    }
    const opened = await install();
    if (opened) onDone?.();
    else setShowSteps((v) => !v);
  }

  const steps = ios ? t('pwa.iosSteps') : t('pwa.androidSteps');
  const title = ios ? t('pwa.iosTitle') : t('pwa.androidTitle');

  return (
    <>
      <button
        type="button"
        className={variant === 'landing' ? 'landing-btn landing-btn--ghost' : 'quick-menu-item'}
        role={variant === 'menu' ? 'menuitem' : undefined}
        onClick={onClick}
        aria-expanded={showSteps}
      >
        {variant === 'menu' && (
          <span className="quick-menu-icon" aria-hidden>
            <RiDownloadLine size={17} />
          </span>
        )}
        {variant === 'landing' && <RiDownloadLine size={18} aria-hidden />}
        {t('pwa.install')}
      </button>
      {showSteps && (
        <div className={variant === 'landing' ? 'install-steps install-steps--landing' : 'install-steps'} role="note">
          <strong>{title}</strong>
          <span>{steps}</span>
        </div>
      )}
    </>
  );
}
