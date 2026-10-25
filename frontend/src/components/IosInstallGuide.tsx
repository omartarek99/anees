import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../lib/language-context';
import { useIosGuide, isIosSafari, isIpad } from '../lib/pwa';

// Apple does not let a website open "Add to Home Screen" (and the Share sheet a page opens from code leaves that
// item out), so on iPhone the app shows this guide: the three taps, with an arrow pointing at Safari's own
// Share button -- bottom centre on iPhone, top right on iPad.

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 15V3" />
    <path d="m8 7 4-4 4 4" />
    <path d="M6.5 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-.5" />
  </svg>
);
const AddIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <path d="M12 8.5v7M8.5 12h7" />
  </svg>
);

/** Mounted once near the root (App.tsx); opened from any "install" button through openIosGuide(). */
export function IosInstallGuideHost() {
  const { t } = useLanguage();
  const [open, close] = useIosGuide();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;
  const ipad = isIpad();

  return createPortal(
    <div className={`ios-guide${ipad ? ' ios-guide--ipad' : ''}`} role="dialog" aria-modal="true" aria-label={t('pwa.iosGuideTitle')} onClick={close}>
      <div className="ios-guide-card" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ios-guide-close" onClick={close} aria-label={t('common.close')}>
          ×
        </button>
        <img className="ios-guide-logo" src="/icons/logo-mark.png" alt="" width={52} height={52} />
        <h3>{t('pwa.iosGuideTitle')}</h3>
        {!isIosSafari() && <p className="ios-guide-warn">{t('pwa.iosOpenSafari')}</p>}
        <ol>
          <li>
            <span className="ios-guide-icon">
              <ShareIcon />
            </span>
            <span>{t('pwa.iosStep1')}</span>
          </li>
          <li>
            <span className="ios-guide-icon">
              <AddIcon />
            </span>
            <span>{t('pwa.iosStep2')}</span>
          </li>
          <li>
            <span className="ios-guide-icon ios-guide-icon--text">{t('pwa.iosStep3Badge')}</span>
            <span>{t('pwa.iosStep3')}</span>
          </li>
        </ol>
      </div>
      <div className="ios-guide-arrow" aria-hidden="true">
        <svg viewBox="0 0 24 40" width="34" height="56" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v30" />
          <path d="m4 26 8 9 8-9" />
        </svg>
      </div>
    </div>,
    document.body
  );
}
