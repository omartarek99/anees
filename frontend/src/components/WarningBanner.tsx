import { useState } from 'react';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';

/** Shows an admin-issued warning at the top of every page until the account owner
 * dismisses it. Renders nothing when there's no active warning. */
export function WarningBanner() {
  const { user, dismissWarning } = useAuth();
  const { t } = useLanguage();
  const [dismissing, setDismissing] = useState(false);

  if (!user?.warningMessage) return null;

  async function handleDismiss() {
    setDismissing(true);
    try {
      await dismissWarning();
    } finally {
      setDismissing(false);
    }
  }

  return (
    <div
      className="form-error-banner"
      style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
    >
      <span>
        <strong>{t('warning.bannerTitle')}</strong> {user.warningMessage}
      </span>
      <button type="button" className="btn btn-secondary" disabled={dismissing} onClick={handleDismiss}>
        {t('common.dismiss')}
      </button>
    </div>
  );
}
