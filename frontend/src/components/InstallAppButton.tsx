import { useState } from 'react';
import { RiDownloadLine } from '@remixicon/react';
import { useLanguage } from '../lib/language-context';
import { useInstallApp } from '../lib/pwa';

/** "Install app" entry in the signed-in menu (Android): opens the browser's own install window; when the browser
 * has not offered one it shows the short manual steps. Renders nothing once the app is installed, on iPhone, or on
 * a desktop browser with no install offer. */
export function InstallAppButton({ onDone }: { onDone?: () => void }) {
  const { t } = useLanguage();
  const { available, install } = useInstallApp();
  const [showSteps, setShowSteps] = useState(false);
  if (!available) return null;

  async function onClick() {
    const opened = await install();
    if (opened) onDone?.();
    else setShowSteps((v) => !v);
  }

  return (
    <>
      <button type="button" className="quick-menu-item" role="menuitem" onClick={onClick} aria-expanded={showSteps}>
        <span className="quick-menu-icon" aria-hidden>
          <RiDownloadLine size={17} />
        </span>
        {t('pwa.install')}
      </button>
      {showSteps && (
        <div className="install-steps" role="note">
          <strong>{t('pwa.androidTitle')}</strong>
          <span>{t('pwa.androidSteps')}</span>
        </div>
      )}
    </>
  );
}
