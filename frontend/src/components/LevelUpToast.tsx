import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../lib/language-context';

export function LevelUpToast({ newLevel, onDismiss }: { newLevel: number | null; onDismiss: () => void }) {
  const { t } = useLanguage();
  return (
    <AnimatePresence>
      {newLevel !== null && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
        >
          <motion.div
            className="text-center"
            initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            style={{
              background: 'linear-gradient(160deg, var(--gold-light), var(--gold))',
              border: '1px solid rgba(255,255,255,0.6)',
              borderRadius: 'var(--radius-lg)',
              padding: '36px 40px',
              boxShadow: '0 24px 60px rgba(169,112,28,0.35), 0 6px 16px rgba(20,30,60,0.15), inset 0 2px 0 rgba(255,255,255,0.5)',
              maxWidth: 340,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 54 }}>🎉🦅🎉</div>
            <h2 style={{ color: 'var(--maroon-dark)', fontSize: 24, marginTop: 8 }}>{t('levelUp.title')}</h2>
            <p style={{ color: 'var(--maroon-dark)', fontWeight: 700, fontSize: 18 }}>{t('levelUp.body', { n: newLevel })}</p>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={onDismiss}>
              {t('levelUp.button')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
