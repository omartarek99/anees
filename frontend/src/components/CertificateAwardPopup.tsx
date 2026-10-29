import { useEffect, useMemo, useState } from 'react';
import { m, AnimatePresence } from 'framer-motion';
import { api } from '../lib/api';
import { useLanguage } from '../lib/language-context';
import { useEscapeToClose } from '../lib/useEscapeToClose';
import { CertificatePlaque } from './CertificatePlaque';
import { useMilestonesPending } from '../lib/popupGate';
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
  // The shield of a tier certificate pops out first; this turns true once it has been clicked and the window opens.
  const [revealed, setRevealed] = useState(false);

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

  // The level pop-outs go first; a shield waits until none are left.
  const waiting = useMilestonesPending();
  const current = !waiting && queue && queue.length > 0 ? queue[0] : null;
  useEffect(() => setRevealed(false), [current?.id]);

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
  // A rank certificate (or one an admin sent without a picture) IS the tier plaque, so it is shown once, big.
  const isPlaque = !!current && current.imageUrl.startsWith('/images/certificates/');

  const showShield = !!current && !!palette && isPlaque && !revealed;
  const showWindow = !!current && !!palette && !isPlaque;
  // A tier certificate: after the shield is clicked, a window like the level one says it is now in the profile.
  const showPanel = !!current && !!palette && isPlaque && revealed;

  return (
    <>
      {/* Step 1 (tier certificates): the shield pops out big, floating, on a darkened page -- click it (or the dark part) to open the window. */}
      <AnimatePresence>
        {showShield && (
          <m.div key={`shade-${current!.id}`} className="rank-pop-shade" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setRevealed(true)} aria-hidden />
        )}
        {showShield && (
          <m.button
            key={`shield-${current!.id}`}
            type="button"
            className="rank-pop rank-pop-plaque"
            aria-label={t('certificateAward.tapLabel')}
            title={t('certificateAward.tapLabel')}
            initial={{ scale: 0, rotate: -25, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 11 }}
            onClick={() => setRevealed(true)}
          >
            <span className="rank-pop-glow" style={{ background: `radial-gradient(circle, ${palette!.light}cc, transparent 68%)` }} aria-hidden />
            <img src={current!.imageUrl} alt="" width={340} height={466} />
            <span className="rank-pop-hint">{t('certificateAward.tap')}</span>
          </m.button>
        )}
      </AnimatePresence>

    <AnimatePresence>
      {showPanel && palette && current && (
        <m.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={dismiss}>
          <m.div
            className="modal-panel text-center"
            role="alertdialog"
            aria-modal="true"
            aria-label={t('certificateAward.title')}
            initial={{ scale: 0.9, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
          >
            <img src={current.imageUrl} alt="" width={84} height={115} style={{ display: 'block', margin: '0 auto', borderRadius: 3, boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }} />
            <h2 style={{ fontSize: 21, marginTop: 12, color: palette.dark }}>{t('certificateAward.congrats')}</h2>
            <p style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.5, margin: '4px 0 0' }}>{t('certificateAward.inProfile')}</p>
            <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={dismiss}>
              {t('certificateAward.button')}
            </button>
          </m.div>
        </m.div>
      )}
      {showWindow && palette && current && (
        <m.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={dismiss}>
          <m.div
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

            <div className="certificate-award-plaque">
              <CertificatePlaque tier={current.type} label={t(CERT_TYPE_LABEL_KEY[current.type])} width={isPlaque ? 250 : 160} />
            </div>
            <h2 className="certificate-award-heading">{t('certificateAward.title')}</h2>
            <p className="certificate-award-tier">{t(CERT_TYPE_LABEL_KEY[current.type])}</p>

            {!isPlaque && <img src={current.imageUrl} alt={current.title} className="certificate-award-image" />}

            <p className="certificate-award-name">{current.title}</p>
            {current.issuedByName && <p className="certificate-award-issuer">{t('profile.certificateFrom', { name: current.issuedByName })}</p>}

            <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={dismiss}>
              {t('certificateAward.button')}
            </button>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
    </>
  );
}
