import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../lib/language-context';
import { useEscapeToClose } from '../lib/useEscapeToClose';

/** Explains the point system, opened by tapping the diamond in the reel action rail. Unlike
 * DoublePointsNotification, this one's visibility flips on a direct click (a synchronous
 * user gesture, not an async event resolving after mount), so framer-motion's
 * AnimatePresence is safe here -- same pattern as LevelUpToast. */
export function PointsInfoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useLanguage();
  useEscapeToClose(onClose, open);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="text-center"
            role="dialog"
            aria-modal="true"
            aria-label={t('pointsInfo.title')}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 20 }}
            style={{
              background: 'linear-gradient(160deg, var(--gold-light), var(--gold))',
              border: '1px solid rgba(255,255,255,0.6)',
              borderRadius: 'var(--radius-lg)',
              padding: '32px 28px',
              boxShadow: '0 24px 60px rgba(169,112,28,0.35), 0 6px 16px rgba(20,30,60,0.15), inset 0 2px 0 rgba(255,255,255,0.5)',
              maxWidth: 320,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 44 }}>💎</div>
            <h2 style={{ color: 'var(--maroon-dark)', fontSize: 20, marginTop: 8 }}>{t('pointsInfo.title')}</h2>
            <ul style={{ textAlign: 'start', margin: '16px 0', padding: 0, listStyle: 'none' }}>
              <li style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, fontWeight: 700, fontSize: 14.5, color: 'var(--maroon-dark)' }}>
                <span style={{ fontSize: 20 }} aria-hidden>
                  🎬
                </span>
                {t('pointsInfo.video')}
              </li>
              <li style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 700, fontSize: 14.5, color: 'var(--maroon-dark)' }}>
                <span style={{ fontSize: 20 }} aria-hidden>
                  📝
                </span>
                {t('pointsInfo.quiz')}
              </li>
            </ul>
            <button className="btn btn-primary" onClick={onClose}>
              {t('common.close')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
