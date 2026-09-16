import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { CERT_PALETTES, CERT_TYPE_LABEL_KEY, type CertificateType } from '../lib/certificateTiers';

type Certificate = {
  id: number;
  title: string;
  type: CertificateType;
  imageUrl: string;
  issuedByName: string | null;
  createdAt: string;
};

const CONFETTI_COLORS = ['#f0a83a', '#8a1538', '#7fd8cf', '#c22954', '#f0c96a'];

// Fixed per mount (not re-randomized on every render) so the pieces don't jump around --
// enough of them, staggered, to read as a proper burst rather than a few stray dots.
function useConfettiPieces(count: number) {
  return useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.round(Math.random() * 100),
        delay: Math.round(Math.random() * 400),
        duration: 1800 + Math.round(Math.random() * 900),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.round(Math.random() * 360),
      })),
    [count]
  );
}

/** Announces a newly-issued certificate (routes/admin.ts POST /certificates) the first
 * time its recipient loads the app after being awarded one -- fetched once on mount
 * (App.tsx), not polled, since "first time you see it" doesn't need to react live to an
 * admin issuing one mid-session. Certificates are shown one at a time, oldest first (the
 * backend already orders /certificates/unseen that way); dismissing one marks it seen and
 * reveals the next, if any. */
export function CertificateAwardPopup() {
  const { t } = useLanguage();
  const [queue, setQueue] = useState<Certificate[] | null>(null);
  const confetti = useConfettiPieces(28);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ certificates: Certificate[] }>('/certificates/unseen')
      .then((data) => {
        if (!cancelled) setQueue(data.certificates);
      })
      .catch(() => {
        // Best-effort -- worst case the popup just doesn't appear this visit; the
        // certificate itself is still on the recipient's profile regardless.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const current = queue && queue.length > 0 ? queue[0] : null;

  async function dismiss() {
    if (!current) return;
    const rest = queue!.slice(1);
    setQueue(rest);
    try {
      await api.post(`/certificates/${current.id}/seen`, {});
    } catch {
      // Best-effort -- worst case it's announced again on the next visit.
    }
  }

  useEscapeToClose(dismiss, current !== null);

  const palette = current ? CERT_PALETTES[current.type] : null;

  return (
    <AnimatePresence>
      {current && palette && (
        <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={dismiss}>
          <motion.div
            className="text-center certificate-award-card"
            role="dialog"
            aria-modal="true"
            aria-label={t('certificateAward.title')}
            initial={{ scale: 0.5, opacity: 0, rotate: -6 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            exit={{ scale: 0.6, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 16 }}
            style={{ background: `linear-gradient(160deg, ${palette.light}, ${palette.dark})` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="certificate-award-confetti-field" aria-hidden>
              {confetti.map((p, i) => (
                <span
                  key={i}
                  className="certificate-award-confetti"
                  style={{
                    left: `${p.left}%`,
                    backgroundColor: p.color,
                    animationDelay: `${p.delay}ms`,
                    animationDuration: `${p.duration}ms`,
                    transform: `rotate(${p.rotate}deg)`,
                  }}
                />
              ))}
            </div>

            <div style={{ fontSize: 40 }} aria-hidden>
              <span className="certificate-award-fire">🔥</span> 🎉{' '}
              <span className="certificate-award-fire" style={{ animationDelay: '0.3s' }}>
                🔥
              </span>
            </div>
            <h2 className="certificate-award-heading">{t('certificateAward.title')}</h2>
            <p className="certificate-award-tier">{t(CERT_TYPE_LABEL_KEY[current.type])}</p>

            <img src={current.imageUrl} alt={current.title} className="certificate-award-image" />

            <p className="certificate-award-name">{current.title}</p>
            {current.issuedByName && <p className="certificate-award-issuer">{t('profile.certificateFrom', { name: current.issuedByName })}</p>}

            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={dismiss}>
              {t('certificateAward.button')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
