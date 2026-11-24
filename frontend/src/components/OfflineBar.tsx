import { useSyncExternalStore } from 'react';
import { useLanguage } from '../lib/language-context';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** A bar along the top while the device has no connection, so failed loads have a reason the person can see. */
export function OfflineBar() {
  const { t } = useLanguage();
  const online = useSyncExternalStore(subscribe, () => navigator.onLine);
  if (online) return null;
  return (
    <div className="offline-bar" role="status">
      {t('common.offline')}
    </div>
  );
}
