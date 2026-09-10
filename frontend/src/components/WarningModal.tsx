import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../lib/auth-context';
import { useLanguage } from '../lib/language-context';
import { useEscapeToClose } from '../lib/useEscapeToClose';

/** Pops up an admin-issued warning as a modal dialog (not just an inline banner) until the
 * account owner dismisses it -- a message serious enough for an admin to send deserves to
 * interrupt, not sit quietly at the top of the page waiting to be scrolled past. Renders
 * nothing when there's no active warning. */
export function WarningModal() {
  const { user, dismissWarning } = useAuth();
  const { t } = useLanguage();
  const [dismissing, setDismissing] = useState(false);
  const open = !!user?.warningMessage;

  async function handleDismiss() {
    if (dismissing) return;
    setDismissing(true);
    try {
      await dismissWarning();
    } finally {
      setDismissing(false);
    }
  }

  useEscapeToClose(handleDismiss, open);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={handleDismiss}
        >
          <motion.div
            className="modal-panel text-center"
            role="alertdialog"
            aria-modal="true"
            aria-label={t('warning.title')}
            initial={{ scale: 0.9, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 44 }}>⚠️</div>
            <h2 style={{ fontSize: 21, marginTop: 8, color: 'var(--danger)' }}>{t('warning.title')}</h2>
            <p style={{ fontSize: 15.5, lineHeight: 1.5, margin: '4px 0 0' }}>{user?.warningMessage}</p>
            <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} disabled={dismissing} onClick={handleDismiss}>
              {t('common.dismiss')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
